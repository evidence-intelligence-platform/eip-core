"""
EIF: Job Posting Router
---
Version: 1.0.1
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md — JOBS Entity
"""


from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import Company, JobPosting, Requirement, UserAccount
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_employer

router = APIRouter(
    prefix="/api/v1/jobs",
    tags=["job-postings"],
    dependencies=[Depends(verify_api_key)],
)

# Statuses employers may set; anything else is rejected rather than silently
# stored, since applications.py gates new applications on status == "active".
_VALID_STATUSES = {"draft", "active", "closed"}


def _require_non_blank(value: str, field_name: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError(f"{field_name} boş bırakılamaz.")
    return stripped


class JobCreate(BaseModel):
    company_name: str | None = None
    # company_id intentionally does NOT exist here: an authenticated employer
    # could otherwise POST an arbitrary {"company_id": 1} and have the
    # posting attributed to any company already in the database, real or
    # seeded, regardless of who registered it. The company is always
    # resolved server-side from the caller's own account below.
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    status: str | None = "active"
    # Was missing entirely, so Pydantic dropped whatever the dashboard sent
    # and every sector filter returned nothing.
    category: str | None = "OTHER"

    @field_validator("title", "description")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        # A whitespace-only title/description would mint a blank AI grading
        # criterion (see create_job: description is copied verbatim into the
        # Requirement every applicant is evaluated against) — Explainability
        # First means there must always be a real criterion behind a verdict.
        return _require_non_blank(v, "Bu alan")

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError("Geçersiz ilan durumu.")
        return v


class JobUpdate(BaseModel):
    """Partial update for an employer's own posting. All fields optional."""
    title: str | None = None
    description: str | None = None
    category: str | None = None
    status: str | None = None

    @field_validator("title", "description")
    @classmethod
    def _not_blank(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _require_non_blank(v, "Bu alan")

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError("Geçersiz ilan durumu.")
        return v


class JobPostingRead(BaseModel):
    """A posting plus its company name, which the UI showed as a placeholder."""
    id: int
    company_id: int | None = None
    company_name: str | None = None
    title: str
    description: str
    category: str
    status: str
    created_at: datetime


def _to_read(job: JobPosting, company: Company | None) -> JobPostingRead:
    return JobPostingRead(
        id=job.id,
        company_id=job.company_id,
        company_name=company.name if company else None,
        title=job.title,
        description=job.description,
        category=job.category,
        status=job.status,
        created_at=job.created_at,
    )


@router.get("/", response_model=list[JobPostingRead], summary="List all active job postings")
def list_jobs(session: Session = Depends(get_session)) -> list[JobPostingRead]:
    """Returns all active job postings. Public: job seekers browse before signing up."""
    rows = session.exec(
        select(JobPosting, Company)
        .join(Company, Company.id == JobPosting.company_id, isouter=True)
        .where(JobPosting.status == "active")
    ).all()
    return [_to_read(job, company) for job, company in rows]


@router.post("/", response_model=JobPostingRead, status_code=status.HTTP_201_CREATED, summary="Create a new job posting")
def create_job(
    job_in: JobCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
) -> JobPostingRead:
    """Creates a new job posting. Employers only."""

    # Single company identity: the posting is published as the company the
    # employer REGISTERED (with its tax number), never a free-text name typed
    # at posting time. Otherwise "Acme A.Ş." could register and then post as
    # "Başka Şirket", and the verifiable-entity promise would be a lie. The
    # request body's company_name is ignored for employers with a profile.
    account = session.get(UserAccount, user.get("user_id"))
    registered_name = account.company_name if account and account.company_name else None
    company_name = registered_name or job_in.company_name

    # Company identity is resolved from THIS authenticated account's own
    # posting history, never by matching Company.name against the whole
    # table: Company.name carries no uniqueness constraint and registration
    # never checks company_name for collisions, so a second employer who
    # merely types the same display name as an already-registered company
    # (e.g. a well-known name) must never be silently merged into that
    # company's row and have their listing appear as that company's genuine
    # posting. The candidate match is therefore restricted to companies THIS
    # account has itself posted under before — never any Company row created
    # by a different account — which is collision-proof because
    # created_by_user_id comes from the authenticated token, not from
    # anything the caller can choose. A single account may still legitimately
    # own more than one Company row (e.g. a legacy/test account with no
    # registered profile posting under different names); each name it has
    # used gets its own row, reused on repeat.
    company_id: int | None = None
    if company_name:
        own_existing = session.exec(
            select(Company)
            .join(JobPosting, JobPosting.company_id == Company.id)
            .where(JobPosting.created_by_user_id == user.get("user_id"))
            .where(Company.name == company_name)
        ).first()
        if own_existing:
            company_id = own_existing.id
        else:
            # No hardcoded "Technology": this platform serves every sector.
            company = Company(name=company_name, industry=job_in.category or "OTHER")
            session.add(company)
            session.commit()
            session.refresh(company)
            company_id = company.id

    job = JobPosting(
        company_id=company_id,
        # Ownership is recorded so KVKK account deletion can find the
        # employer's postings later; company_name alone proves nothing.
        created_by_user_id=user.get("user_id"),
        title=job_in.title,
        description=job_in.description,
        category=job_in.category or "OTHER",
        status=job_in.status or "active",
    )
    session.add(job)
    # Flush, don't commit: the id is needed to key the requirement, but the
    # posting and the criterion it is graded by are one fact. Committing them
    # separately meant anything that broke the second insert — a colliding
    # "req_job_<id>" row — left a live, publicly listed posting behind whose
    # evaluation criterion was somebody else's text.
    session.flush()

    # The AI needs something job-specific to evaluate against; without this the
    # engine fell back to a generic "technical requirement" for every applicant.
    requirement = Requirement(
        external_id=f"req_job_{job.id}",
        description=job.description,
        created_by_user_id=user.get("user_id"),
    )
    session.add(requirement)
    session.commit()
    session.refresh(job)

    company = session.get(Company, job.company_id) if job.company_id else None
    return _to_read(job, company)


@router.get(
    "/mine",
    response_model=list[JobPostingRead],
    summary="List the authenticated employer's own postings, including drafts and closed listings",
)
def list_my_jobs(
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
) -> list[JobPostingRead]:
    """
    Employer-scoped roster: unlike GET /, this includes drafts and closed
    postings and is filtered to the caller's own account — without it an
    employer had no self-service way to see (let alone stop applications
    against) a listing after publishing it. Registered before /{job_id} so
    "mine" is never parsed as a job id.
    """
    rows = session.exec(
        select(JobPosting, Company)
        .join(Company, Company.id == JobPosting.company_id, isouter=True)
        .where(JobPosting.created_by_user_id == user.get("user_id"))
        .order_by(JobPosting.id.desc())
    ).all()
    return [_to_read(job, company) for job, company in rows]


@router.patch("/{job_id}", response_model=JobPostingRead, summary="Update the caller's own job posting")
def update_job(
    job_id: int,
    job_in: JobUpdate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
) -> JobPostingRead:
    """
    Lets an employer fix a typo or close a filled role — the only way to stop
    new applications from arriving against a dead listing, since there was
    previously no PATCH or status-change path at all. Ownership-checked: an
    employer may only edit postings their own account created.
    """
    job = session.get(JobPosting, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="İlan bulunamadı.")
    if job.created_by_user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Bu ilanı düzenleme yetkiniz yok.")

    if job_in.title is not None:
        job.title = job_in.title
    if job_in.category is not None:
        job.category = job_in.category
    if job_in.status is not None:
        job.status = job_in.status
    if job_in.description is not None:
        job.description = job_in.description
        # The Requirement this posting's applicants are graded against must
        # stay in lockstep with the description it was minted from — an
        # employer editing a typo out of the posting text must not leave
        # every subsequent applicant graded against the old wording, and
        # every existing evaluation stays traceable to the text that was
        # live for it (Explainability First: no evidence pointer is rewritten
        # after the fact — only the still-open criterion is).
        requirement = session.exec(
            select(Requirement).where(Requirement.external_id == f"req_job_{job.id}")
        ).first()
        if requirement:
            requirement.description = job_in.description
            session.add(requirement)

    session.add(job)
    session.commit()
    session.refresh(job)

    company = session.get(Company, job.company_id) if job.company_id else None
    return _to_read(job, company)


@router.get("/{job_id}", response_model=JobPostingRead, summary="Get single job posting by ID")
def get_job(job_id: int, session: Session = Depends(get_session)) -> JobPostingRead:
    """Retrieves a single job posting by ID."""
    job = session.exec(select(JobPosting).where(JobPosting.id == job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job posting {job_id} not found.")
    company = session.get(Company, job.company_id) if job.company_id else None
    return _to_read(job, company)
