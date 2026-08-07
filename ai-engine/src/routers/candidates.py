
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, select

from src.db.database import get_session
from src.db.models import Candidate, Evidence
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_employer, require_user

router = APIRouter(
    prefix="/api/v1/candidates",
    tags=["candidates"],
    dependencies=[Depends(verify_api_key)],
)


class EvidenceRead(SQLModel):
    """
    Evidence as callers outside the admin moderation panel may see it.
    Moderation internals — the storage path on disk, the deciding admin's
    e-mail, the internal review note — must never cross this seam; the
    moderation router has its own admin-only DTO for those.
    """
    id: int
    candidate_external_id: str
    requirement_external_id: str
    source_type: str
    status: str
    confidence_score: int | None = None
    reasoning: str
    evidence_pointer: str | None = None
    review_status: str
    created_at: datetime


class CandidateRead(SQLModel):
    """
    A profile as the report and apply screens need it.

    The table model must never be the response: `user_id` is the internal
    account key the ownership checks are built on, and `consent_timestamp` is
    a KVKK record — neither is any caller's business.
    """
    id: int
    external_id: str
    name: str
    consent_granted: bool
    created_at: datetime


def _assert_may_read_candidate(candidate: Candidate, user: CurrentUser) -> None:
    """
    Decides *who* may read a profile — not just which of its rows.

    Registration mints predictable ids ("cand_<user id>") from a sequential
    key, so an endpoint that only filters rows hands a stranger's name and
    approved findings to anyone who can count. The roster is already
    employer-only; the per-id views draw the same line: the candidate the
    record is about, the employers who evaluate applicants, and the
    moderating admins.
    """
    if user.get("role") in ("employer", "admin"):
        return
    if candidate.user_id is not None and candidate.user_id == user.get("user_id"):
        return
    raise HTTPException(
        status_code=403,
        detail="You may only view your own candidate profile.",
    )


@router.get("/", response_model=list[CandidateRead])
def list_candidates(
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
):
    candidates = session.exec(select(Candidate)).all()
    return candidates

class CandidateCreate(SQLModel):
    """
    What a caller may set when creating a profile.

    The table model must never be the request body: `user_id` is the ownership
    anchor for the moderation gate and for KVKK deletion, so a caller able to
    set it could bind a profile to somebody else's account — or claim an
    external_id whose evidence is not theirs. It is filled in from the JWT.
    """
    external_id: str
    name: str
    consent_granted: bool = True


@router.post("/", response_model=Candidate)
def create_candidate(
    candidate_in: CandidateCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
):
    # "cand_<n>" is the server-issued identity namespace: registration mints
    # exactly f"cand_{user.id}" for account n (auth.py). Left open, any
    # signed-in caller could pre-claim future users' predictable ids before
    # they register and permanently lock those accounts out of every
    # candidate flow. Only the account the id belongs to may create it.
    reserved = re.fullmatch(r"cand_(\d+)", candidate_in.external_id)
    if reserved and int(reserved.group(1)) != user.get("user_id"):
        raise HTTPException(
            status_code=403,
            detail="This external_id is reserved for another account.",
        )
    existing = session.exec(select(Candidate).where(Candidate.external_id == candidate_in.external_id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Candidate with this external_id already exists")
    candidate = Candidate(
        external_id=candidate_in.external_id,
        name=candidate_in.name,
        consent_granted=candidate_in.consent_granted,
        # Ownership is server-side, exactly as job postings record their
        # creator (jobs.py); the client never gets a say in whose profile
        # this is.
        user_id=user.get("user_id"),
    )
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate

@router.get("/{external_id}", response_model=CandidateRead)
def get_candidate(
    external_id: str,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
):
    """
    Looks up a single candidate. Without this, the UI had to download the
    whole roster just to check whether one record already existed.
    """
    candidate = session.exec(select(Candidate).where(Candidate.external_id == external_id)).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_may_read_candidate(candidate, user)
    return candidate


@router.get("/{external_id}/evidences", response_model=list[EvidenceRead])
def get_candidate_evidences(
    external_id: str,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
):
    candidate = session.exec(select(Candidate).where(Candidate.external_id == external_id)).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_may_read_candidate(candidate, user)

    query = select(Evidence).where(Evidence.candidate_external_id == external_id)
    # Moderation gate: an upload awaiting (or refused by) human review must
    # never reach an employer's report — that is the promise made to the
    # candidate at upload time. Only the moderating admins and the candidate
    # who owns the profile may see non-approved rows.
    is_admin = user.get("role") == "admin"
    is_owner = candidate.user_id is not None and candidate.user_id == user.get("user_id")
    if not (is_admin or is_owner):
        query = query.where(Evidence.review_status == "approved")

    evidences = session.exec(query).all()
    return evidences
