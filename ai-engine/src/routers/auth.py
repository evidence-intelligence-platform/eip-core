"""
EIF: User Authentication & JWT Auth Router
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 06_API_CONTRACTS.md — User authentication & token issuance
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import (
    Candidate,
    Evidence,
    ExplainabilityReport,
    JobApplication,
    JobPosting,
    Requirement,
    UserAccount,
)
from src.security.auth import verify_api_key
from src.security.jwt import create_access_token, get_current_user_payload, hash_password, verify_password
from src.services.audit import anonymize_identifier, record_audit
from src.services.storage import delete_upload

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["authentication"],
)


class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="Password (min 6 chars)")
    # "admin" is deliberately not selectable: the endpoint is public, so
    # anyone could have granted themselves administrator rights.
    role: Literal["employer", "candidate"] = Field("candidate", description="User role")
    full_name: str | None = Field(None, description="Candidate or Employer name")


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str
    role: str


class UserProfileResponse(BaseModel):
    id: int
    email: str
    role: str
    created_at: str
    # The server owns this identity. The UI used to build it from the e-mail
    # address, which produced a different value than the one stored here.
    candidate_external_id: str | None = None


@router.post(
    "/register",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user (Employer or Candidate)",
)
def register_user(
    request: RegisterRequest,
    session: Session = Depends(get_session),
) -> AuthTokenResponse:
    """Registers a new UserAccount and auto-generates a Candidate profile if role is 'candidate'."""
    existing = session.exec(select(UserAccount).where(UserAccount.email == request.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{request.email}' already exists."
        )

    hashed_pw = hash_password(request.password)
    user = UserAccount(
        email=request.email,
        hashed_password=hashed_pw,
        role=request.role,
    )
    session.add(user)
    # flush, not commit: user.id is needed to mint the candidate identity
    # below, but the account must not survive if that identity cannot be
    # created — the whole registration commits (or rolls back) as one unit.
    session.flush()

    # If role is candidate, create the server-owned Candidate record
    if request.role == "candidate":
        ext_id = f"cand_{user.id}"
        existing_cand = session.exec(select(Candidate).where(Candidate.external_id == ext_id)).first()
        if existing_cand:
            # The account was created a moment ago, so an existing row can
            # only be somebody else's (a squatted id, or legacy data).
            # Silently skipping here bricked the account forever: /auth/me
            # returned candidate_external_id null and no candidate flow —
            # applying, uploading evidence — ever worked. Fail loudly and
            # roll the registration back instead.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Aday kimliği başka bir hesap tarafından kullanılıyor. "
                    "Lütfen destek ekibiyle iletişime geçin."
                ),
            )
        cand = Candidate(
            external_id=ext_id,
            user_id=user.id,
            name=request.full_name or request.email.split('@')[0],
            # Consent is captured per submission, not granted at signup.
            consent_granted=False,
        )
        session.add(cand)

    session.commit()
    session.refresh(user)

    token = create_access_token({"sub": user.email, "user_id": user.id, "role": user.role})
    return AuthTokenResponse(
        access_token=token,
        email=user.email,
        role=user.role,
    )


@router.post(
    "/login",
    response_model=AuthTokenResponse,
    summary="Authenticate user and return JWT Access Token",
)
def login_user(
    request: LoginRequest,
    session: Session = Depends(get_session),
) -> AuthTokenResponse:
    """Authenticates credentials and issues a JWT token."""
    user = session.exec(select(UserAccount).where(UserAccount.email == request.email)).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": user.email, "user_id": user.id, "role": user.role})
    return AuthTokenResponse(
        access_token=token,
        email=user.email,
        role=user.role,
    )


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user profile",
)
def get_me(
    payload: dict = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> UserProfileResponse:
    """Returns the profile of the currently authenticated user."""
    email = payload.get("sub")
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    candidate = session.exec(
        select(Candidate).where(Candidate.user_id == user.id)
    ).first()

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        created_at=user.created_at.isoformat(),
        candidate_external_id=candidate.external_id if candidate else None,
    )


def _delete_applications(session: Session, applications: list[JobApplication]) -> None:
    """
    Deletes job applications together with the ExplainabilityReports that
    reference them.

    ExplainabilityReport.application_id is a foreign key with no cascade, so a
    surviving report either aborts the entire erasure (PostgreSQL raises
    IntegrityError — the right to be forgotten silently fails) or is left with
    a dangling application_id (SQLite, where foreign keys are off). SQLModel
    declares no ORM relationship for the unit of work to infer an order from,
    so the flushes pin it: reports first, applications after.
    """
    for application in applications:
        for report in session.exec(
            select(ExplainabilityReport).where(
                ExplainabilityReport.application_id == application.id
            )
        ).all():
            session.delete(report)
    session.flush()

    for application in applications:
        session.delete(application)
    session.flush()


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_api_key)],
    summary="Delete the authenticated account and all owned data (KVKK erasure)",
)
def delete_me(
    payload: dict = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> None:
    """
    KVKK/GDPR right-to-erasure endpoint. Any authenticated role may delete
    its own account; the internal API key is required like everywhere else.

    Deletion policy (both branches run for every account, so hybrid or admin
    accounts are handled uniformly):

    - Candidate-owned data: every Candidate profile linked via user_id, that
      candidate's JobApplications, their Evidence rows AND the stored media
      files on disk, and candidate-linked ExplainabilityReports.
    - Employer-owned data: every JobPosting this account created
      (created_by_user_id), those postings' JobApplications — an application
      into a deleted posting is meaningless — the posting's auto-generated
      Requirement ("req_job_<id>") and the Evidence rows judged against that
      requirement. Those Evidence rows belong to applicants, but they are
      keyed to the requirement by a plain string: left behind they show the
      candidate a verdict against a job that no longer resolves, and on SQLite
      a later posting reusing the id would silently inherit them. Postings
      that predate ownership tracking (created_by_user_id is NULL) cannot be
      attributed to anyone and are left in place. Company rows are never
      deleted: they may be shared.
    - ExplainabilityReports pointing at a deleted JobApplication go with it —
      the foreign key has no cascade, so leaving them breaks the erasure.
    - ConsentLog rows are deliberately KEPT: the consent record is the legal
      proof that processing was authorized while it happened, and erasing the
      proof together with the data would defeat its purpose (KVKK retention
      of consent evidence).

    All database deletions and the anonymized audit row commit in ONE
    transaction. Media blobs are unlinked only after the commit succeeds, and
    a blob already missing from disk never aborts the deletion.
    """
    email = payload.get("sub")
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user_id, user_role = user.id, user.role
    media_paths: list[str] = []

    # ── Candidate-owned data ────────────────────────────────────────────────
    candidates = session.exec(select(Candidate).where(Candidate.user_id == user_id)).all()
    for candidate in candidates:
        _delete_applications(session, session.exec(
            select(JobApplication).where(JobApplication.candidate_id == candidate.id)
        ).all())
        for evidence in session.exec(
            select(Evidence).where(Evidence.candidate_external_id == candidate.external_id)
        ).all():
            if evidence.media_path:
                media_paths.append(evidence.media_path)
            session.delete(evidence)
        for report in session.exec(
            select(ExplainabilityReport).where(
                ExplainabilityReport.candidate_external_id == candidate.external_id
            )
        ).all():
            session.delete(report)
        session.delete(candidate)

    # ── Employer-owned data ─────────────────────────────────────────────────
    postings = session.exec(
        select(JobPosting).where(JobPosting.created_by_user_id == user_id)
    ).all()
    for posting in postings:
        _delete_applications(session, session.exec(
            select(JobApplication).where(JobApplication.job_id == posting.id)
        ).all())
        requirement_external_id = f"req_job_{posting.id}"
        # Applicants' verdicts against this posting's requirement: the link is
        # a plain string with no foreign key, so nothing else would ever clean
        # them up — see the deletion policy above.
        for evidence in session.exec(
            select(Evidence).where(
                Evidence.requirement_external_id == requirement_external_id
            )
        ).all():
            if evidence.media_path:
                media_paths.append(evidence.media_path)
            session.delete(evidence)
        requirement = session.exec(
            select(Requirement).where(Requirement.external_id == requirement_external_id)
        ).first()
        if requirement:
            session.delete(requirement)
        session.delete(posting)

    # The postings above reference this account (created_by_user_id), so they
    # must be gone from the database before the account row itself goes.
    session.flush()
    session.delete(user)

    # ConsentLog rows are intentionally NOT touched — see docstring.

    # The audit trail must survive the account, so the actor is a one-way
    # hash: an auditor can confirm a known address was erased, but the trail
    # never stores the deleted e-mail in plaintext.
    record_audit(
        session,
        actor_id=anonymize_identifier(email),
        action="account.delete",
        target_entity=f"useraccount:{user_id}",
        details=f"role={user_role}; self-service KVKK erasure",
    )
    session.commit()

    # Disk cleanup strictly AFTER the commit: if the transaction had failed,
    # the rows would still exist and must keep pointing at real files.
    for media_path in media_paths:
        try:
            delete_upload(media_path)
        except (ValueError, OSError):
            # A poisoned or unremovable path must not turn a completed
            # deletion into a 500 — the DB erasure already happened.
            pass

    return None
