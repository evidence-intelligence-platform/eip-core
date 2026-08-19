"""
EIF: Job Application Router
---
Version: 1.1.0
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md — JOB_APPLICATIONS Entity
"""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, or_, select

from src.db.database import get_session
from src.db.models import Candidate, JobApplication, JobPosting
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_employer, require_user
from src.services.audit import record_audit
from src.services.traits import standout_traits_for

router = APIRouter(
    prefix="/api/v1/applications",
    tags=["job-applications"],
    dependencies=[Depends(verify_api_key)],
)


class ApplicationStatusUpdate(BaseModel):
    status: Literal["submitted", "reviewing", "accepted", "declined"]


class JobApplicationRead(BaseModel):
    """
    An application plus the candidate's identity. Without these the employer
    dashboard had to guess the candidate's external_id to build a report link,
    and every guess pointed at a record that does not exist.
    """
    id: int
    candidate_id: int
    job_id: int
    status: str
    created_at: datetime
    candidate_external_id: str | None = None
    candidate_name: str | None = None
    # AI-derived standout signals (verified evidence, moderation-approved),
    # e.g. ["Sertifika/belge doğrulandı", "Özgeçmiş doğrulandı"]. Empty until
    # the applicant's documents are processed. Employers/admins only.
    standout_traits: list[str] = []
    # Whether *this caller* may decide the application, mirroring the PATCH
    # guard below. Employers are shown ownerless (created_by_user_id IS NULL)
    # postings' applications but the PATCH always 403s them; without this flag
    # the dashboard could not tell and rendered dead accept/decline buttons.
    decidable: bool = False


@router.get("/", response_model=list[JobApplicationRead], summary="List job applications")
def list_applications(
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
) -> list[JobApplicationRead]:
    """
    Lists job applications visible to the caller.

    Previously this returned the whole table to anyone, so every candidate saw
    every other candidate's applications and their accept/decline status.

    Employers are scoped too: this list carries applicant names and external
    ids, so an unscoped listing handed every employer their competitors'
    entire pipelines. An employer now sees only applications into postings
    they created — plus postings with no recorded creator (see below).
    Admins see everything.
    """
    # JobPosting is selected too so each row can carry `decidable`: whether
    # the PATCH below would let *this caller* decide it. The two routes must
    # agree, or the list shows applications the caller can only 403 on.
    query = (
        select(JobApplication, Candidate, JobPosting)
        .join(Candidate, Candidate.id == JobApplication.candidate_id, isouter=True)
        .join(JobPosting, JobPosting.id == JobApplication.job_id, isouter=True)
    )

    role = user.get("role")
    if role == "candidate":
        # A candidate only ever sees their own applications.
        query = query.where(Candidate.user_id == user.get("user_id"))
    elif role != "admin":
        # Employer scope: own postings, plus postings that predate ownership
        # tracking (created_by_user_id IS NULL). Transitional by design —
        # pre-ownership postings have no attributable owner, and hiding them
        # would blank out existing demo/legacy employer dashboards overnight.
        # The posting itself must exist (this used to be an inner join): a
        # NULL from a dangling job_id must not pass as "pre-ownership".
        query = query.where(
            JobPosting.id.is_not(None),
            or_(
                JobPosting.created_by_user_id == user.get("user_id"),
                JobPosting.created_by_user_id.is_(None),
            ),
        )

    rows = session.exec(query).all()

    # Standout traits are an employer/admin decision aid; a candidate viewing
    # their own applications does not need them. Computed (and cached) once per
    # application via the traits service — AI summary first, deterministic tags
    # as fallback.
    def _traits(app, cand) -> list[str]:
        if role == "candidate" or not (cand and cand.external_id):
            return []
        return standout_traits_for(session, app, cand.external_id)

    return [
        JobApplicationRead(
            id=app.id,
            candidate_id=app.candidate_id,
            job_id=app.job_id,
            status=app.status,
            created_at=app.created_at,
            candidate_external_id=cand.external_id if cand else None,
            candidate_name=cand.name if cand else None,
            standout_traits=_traits(app, cand),
            # Mirror of update_application_status's guard: admins decide
            # anything; employers only postings they created — an ownerless
            # posting (created_by_user_id IS NULL) is visible but never
            # decidable by an employer; candidates cannot decide at all.
            decidable=(
                role == "admin"
                or (
                    role != "candidate"
                    and job is not None
                    and job.created_by_user_id == user.get("user_id")
                )
            ),
        )
        for app, cand, job in rows
    ]


class ApplicationCreate(BaseModel):
    """
    What a caller may set when applying.

    The table model must never be the request body: "accepted"/"declined" is
    the employer's verdict, so a candidate able to set it would mint a
    pre-accepted application and walk straight past the employer-only PATCH
    below. The id and the timestamp are the database's to hand out.
    """
    candidate_id: int
    job_id: int
    status: Literal["submitted", "reviewing"] = "submitted"


@router.post("/", response_model=JobApplication, status_code=status.HTTP_201_CREATED, summary="Submit a job application")
def create_application(
    app_in: ApplicationCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
) -> JobApplication:
    """Submits a candidate application for a specific job posting."""
    candidate = session.exec(select(Candidate).where(Candidate.id == app_in.candidate_id)).first()
    if not candidate:
        raise HTTPException(status_code=404, detail=f"{app_in.candidate_id} numaralı aday bulunamadı.")

    # An application is filed under an identity, and candidate ids are small
    # sequential integers: without this a signed-in stranger could apply in a
    # rival's name — the employer dashboard then shows that person's real name
    # and external_id — or spam-apply to sabotage them, and the row records
    # nothing about who actually submitted it. Admins are exempt, as elsewhere.
    if user.get("role") != "admin" and candidate.user_id != user.get("user_id"):
        raise HTTPException(
            status_code=403,
            detail="Başvuru yalnızca kendi aday profiliniz adına yapılabilir.",
        )

    job = session.exec(select(JobPosting).where(JobPosting.id == app_in.job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"{app_in.job_id} numaralı ilan bulunamadı.")

    # Draft postings are not public yet and closed postings stopped taking
    # applicants — GET /jobs/ already hides both from the public listing, so
    # letting an old link or a guessed id apply here anyway would put a
    # candidate in front of an employer who does not believe the role is
    # open at all.
    if job.status != "active":
        raise HTTPException(
            status_code=409,
            detail="Bu ilan artık başvuruya açık değil.",
        )

    # One candidate, one open application per job: without this a candidate
    # could resubmit after being declined and show up a second time as a
    # fresh, undecided row in the same employer's pipeline — quietly
    # reopening a decision the "irreversible" rule below was meant to close.
    duplicate = session.exec(
        select(JobApplication).where(
            JobApplication.candidate_id == app_in.candidate_id,
            JobApplication.job_id == app_in.job_id,
        )
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Bu ilana zaten başvurdunuz.")

    application = JobApplication(
        candidate_id=app_in.candidate_id,
        job_id=app_in.job_id,
        status=app_in.status,
    )
    session.add(application)
    session.commit()
    session.refresh(application)
    return application


@router.patch("/{app_id}", response_model=JobApplication, summary="Update job application status")
def update_application_status(
    app_id: int,
    status_update: ApplicationStatusUpdate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
) -> JobApplication:
    """
    Updates status of a job application (e.g. accepted, declined, reviewing).

    Employers only: a candidate could previously accept their own application.
    """
    application = session.exec(select(JobApplication).where(JobApplication.id == app_id)).first()
    if not application:
        raise HTTPException(status_code=404, detail=f"{app_id} numaralı başvuru bulunamadı.")

    # Whose pipeline is this? Application ids are small sequential integers and
    # the decision below is irreversible, so with the role check alone any
    # employer account could decline a competitor's applicants — a rejection
    # the candidate's actual employer never issued and cannot undo. The
    # posting records its creator; that is the boundary.
    if user.get("role") != "admin":
        job = session.get(JobPosting, application.job_id)
        if job is None or job.created_by_user_id != user.get("user_id"):
            raise HTTPException(
                status_code=403,
                detail="Başvurular yalnızca ilanı yayınlayan işveren tarafından karara bağlanabilir.",
            )

    if application.status in ["accepted", "declined"]:
        raise HTTPException(status_code=409, detail="Başvuru zaten sonuçlandırılmış. Durum tekrar güncellenemez.")

    application.status = status_update.status
    session.add(application)
    # An accept/decline is a legally relevant, irreversible decision about a
    # person: same-transaction audit row, exactly as moderation verdicts do —
    # the record lives or dies with the decision it describes.
    record_audit(
        session,
        actor_id=user.get("sub", "unknown"),
        action=f"application.decision.{status_update.status}",
        target_entity=f"application:{app_id}",
    )
    session.commit()
    session.refresh(application)
    return application
