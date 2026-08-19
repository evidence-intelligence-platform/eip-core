
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlmodel import Session, SQLModel, select

from src.db.database import get_session
from src.db.models import Candidate, Evidence, JobApplication, JobPosting
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

    `consent_granted` is deliberately NOT exposed here. It is set once at
    profile creation and never updated afterwards — the real, audited
    consent trail lives in ConsentLog, written per extraction (see
    record_consent). Surfacing this stale column would show every genuine
    candidate as permanently non-consenting (auth.py sets it False at
    registration) while letting nothing ever correct it.
    """
    id: int
    external_id: str
    name: str
    created_at: datetime


def _employer_visible_candidate_ids(session: Session, employer_user_id) -> set[int]:
    """
    The candidates an employer is allowed to see: exactly those who applied
    to one of this employer's postings. Ownerless postings
    (created_by_user_id IS NULL — pre-ownership, transitional) stay visible to
    every employer, matching the same rule the applications list already uses
    (applications.py), so a name shown in the dashboard never 403s when its
    report is opened.
    """
    rows = session.exec(
        select(JobApplication.candidate_id)
        .join(JobPosting, JobPosting.id == JobApplication.job_id)
        .where(
            or_(
                JobPosting.created_by_user_id == employer_user_id,
                JobPosting.created_by_user_id.is_(None),
            )
        )
    ).all()
    return {cid for cid in rows if cid is not None}


def _assert_may_read_candidate(
    candidate: Candidate, user: CurrentUser, session: Session
) -> None:
    """
    Decides *who* may read a profile — not just which of its rows.

    The product promises the candidate that their documents are shared "only
    with the employer of the job you applied to" (KVKK page / landing FAQ).
    So the trust boundary is not "any employer": an employer may read a
    candidate only when that candidate applied to one of the employer's own
    postings. Admins (moderation) see everyone; the candidate sees their own
    record. Registration mints predictable ids ("cand_<user id>"), so without
    this a stranger who registered as an employer could count their way
    through the entire candidate pool — contradicting the promise.
    """
    if user.get("role") == "admin":
        return
    if candidate.user_id is not None and candidate.user_id == user.get("user_id"):
        return
    if user.get("role") == "employer":
        if candidate.id in _employer_visible_candidate_ids(session, user.get("user_id")):
            return
    raise HTTPException(
        status_code=403,
        detail="Bu aday profilini görüntüleme yetkiniz yok.",
    )


def _get_readable_candidate(
    external_id: str, user: CurrentUser, session: Session
) -> Candidate:
    """
    Looks up a candidate and enforces read access as a single step, so a
    non-existent external_id and one that exists but isn't the caller's to
    see come back as the exact same 404.

    Registration mints predictable ids ("cand_<user id>"), same as the
    docstring on _assert_may_read_candidate explains. Doing "404 if missing"
    then "403 if not yours" as two separate steps would leak the counting
    attack that guard was built to prevent one layer up: the status code
    alone (404 vs 403) would confirm which ids have registered, even though
    the profile itself stays hidden. One outcome for both cases closes that.
    """
    not_found = HTTPException(status_code=404, detail="Aday bulunamadı.")
    candidate = session.exec(select(Candidate).where(Candidate.external_id == external_id)).first()
    if not candidate:
        raise not_found
    try:
        _assert_may_read_candidate(candidate, user, session)
    except HTTPException:
        raise not_found
    return candidate


@router.get("/", response_model=list[CandidateRead])
def list_candidates(
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
):
    """
    The employer's candidate pool — only candidates who applied to this
    employer's postings, never the whole database. Admins get everyone for
    moderation.
    """
    if user.get("role") == "admin":
        return session.exec(select(Candidate)).all()

    visible = _employer_visible_candidate_ids(session, user.get("user_id"))
    if not visible:
        return []
    return session.exec(select(Candidate).where(Candidate.id.in_(visible))).all()

class CandidateCreate(SQLModel):
    """
    What a caller may set when creating a profile.

    The table model must never be the request body: `user_id` is the ownership
    anchor for the moderation gate and for KVKK deletion, so a caller able to
    set it could bind a profile to somebody else's account — or claim an
    external_id whose evidence is not theirs. It is filled in from the JWT.

    `consent_granted` is intentionally not accepted here either: it is not a
    live consent signal (that is ConsentLog, written per extraction), so a
    client should never be able to set it to True with zero backing evidence
    at profile-creation time.
    """
    external_id: str
    name: str


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
            detail="Bu external_id başka bir hesaba ayrılmış.",
        )
    existing = session.exec(select(Candidate).where(Candidate.external_id == candidate_in.external_id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bu external_id'ye sahip bir aday zaten mevcut.")
    candidate = Candidate(
        external_id=candidate_in.external_id,
        name=candidate_in.name,
        # Ownership is server-side, exactly as job postings record their
        # creator (jobs.py); the client never gets a say in whose profile
        # this is. consent_granted is left at its table default — it is not
        # a client-settable field (see CandidateCreate).
        user_id=user.get("user_id"),
    )
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate

class InterestsPayload(SQLModel):
    interests: list[str]


def _candidate_of(session: Session, user: CurrentUser) -> Candidate:
    cand = session.exec(
        select(Candidate).where(Candidate.user_id == user.get("user_id"))
    ).first()
    if not cand:
        raise HTTPException(
            status_code=404,
            detail="Bu hesaba bağlı bir aday profili bulunamadı.",
        )
    return cand


@router.get("/me/interests", response_model=InterestsPayload)
def get_my_interests(
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
):
    """The signed-in candidate's own interest categories (empty = show all)."""
    cand = _candidate_of(session, user)
    keys = [k for k in (cand.interests or "").split(",") if k]
    return InterestsPayload(interests=keys)


@router.put("/me/interests", response_model=InterestsPayload)
def set_my_interests(
    payload: InterestsPayload,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
):
    """
    Replaces the candidate's interests. Keys are short uppercase category
    tokens; we normalise, dedupe and cap them, and store null for an empty
    list ('show everything'). The client owns the canonical category list.
    """
    cleaned: list[str] = []
    for raw in payload.interests[:20]:
        key = str(raw).strip().upper()
        if key and key.replace("_", "").isalnum() and key not in cleaned:
            cleaned.append(key)
    cand = _candidate_of(session, user)
    cand.interests = ",".join(cleaned) if cleaned else None
    session.add(cand)
    session.commit()
    return InterestsPayload(interests=cleaned)


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
    return _get_readable_candidate(external_id, user, session)


@router.get("/{external_id}/evidences", response_model=list[EvidenceRead])
def get_candidate_evidences(
    external_id: str,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
):
    candidate = _get_readable_candidate(external_id, user, session)

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
