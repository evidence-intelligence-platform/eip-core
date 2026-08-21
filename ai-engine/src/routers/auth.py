"""
EIF: User Authentication & JWT Auth Router
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 06_API_CONTRACTS.md — User authentication & token issuance
"""

import hashlib
import os
import secrets
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import (
    Candidate,
    Company,
    ConsentLog,
    Evidence,
    ExplainabilityReport,
    JobApplication,
    JobPosting,
    PasswordResetToken,
    Requirement,
    UserAccount,
)
from src.rate_limit import limiter
from src.security.auth import verify_api_key
from src.security.jwt import create_user_access_token, get_current_user_payload, hash_password, verify_password
from src.security.permissions import CurrentUser, require_user
from src.services.audit import anonymize_identifier, record_audit
from src.services.email_service import password_reset_email, send_email, welcome_email
from src.services.storage import delete_upload
from src.services.tax_id import is_valid_tax_number

# How long a reset link stays valid. Mirrored in the e-mail copy ("30 dakika")
# — change both together.
RESET_TOKEN_TTL_MINUTES = 30

# A second forgot-password request inside this window silently reuses silence:
# no new token, no new e-mail. Keeps a stuck user from mailbombing themselves
# (or an attacker from mailbombing someone else) within the rate limit.
RESET_REQUEST_COOLDOWN_SECONDS = 60

# A syntactically valid PBKDF2 hash that no real password will ever match.
# login_user verifies against this when the e-mail doesn't exist, so the
# 100,000-iteration PBKDF2 call always runs — without it, "unknown e-mail"
# answers measurably faster than "wrong password for a real account", an
# account-enumeration timing side-channel.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def _hash_reset_token(token: str) -> str:
    """SHA-256 hex of the reset token — only this ever touches the database."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _frontend_base_url() -> str:
    """Where reset links point. In production set FRONTEND_URL explicitly."""
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["authentication"],
)


# Headcount bands offered to employers. ">5 people" (anything past "1-5")
# triggers the corporate-e-mail requirement.
COMPANY_SIZE_BANDS = ("1-5", "6-20", "21-50", "50+")


class RegisterRequest(BaseModel):
    # Personal e-mail for everyone — never a company address.
    email: EmailStr = Field(..., description="Personal e-mail address")
    password: str = Field(..., description="Password (min 8 chars)")
    # "admin" is deliberately not selectable: the endpoint is public, so
    # anyone could have granted themselves administrator rights.
    role: Literal["employer", "candidate"] = Field("candidate", description="User role")
    full_name: str | None = Field(None, description="Candidate or contact person name")

    # ── Employer-only company profile ───────────────────────────────────────
    company_name: str | None = Field(None, description="Employer: company name")
    tax_number: str | None = Field(None, description="Employer: tax number (required for companies)")
    company_size: str | None = Field(None, description="Employer: headcount band")
    company_email: EmailStr | None = Field(
        None, description="Employer: corporate e-mail (required when size > 5)"
    )

    @field_validator("password")
    @classmethod
    def _password_min_length(cls, value: str) -> str:
        # Pydantic's built-in "string_too_short" error is English and
        # developer-shaped ({"type": "string_too_short", "msg": "String
        # should have at least 8 characters", ...}) — a short password is the
        # single most common validation failure a non-technical candidate hits,
        # on the very first screen they touch. Same Turkish tone as the
        # hand-written checks in _validate_employer_profile below.
        if len(value) < 8:
            raise ValueError("Şifre en az 8 karakter olmalıdır.")
        return value


def _validate_employer_profile(data: "RegisterRequest") -> None:
    """
    A company account must be attributable to a real legal entity. Every
    employer gives a company name and a tax number; only teams larger than
    five are asked for a corporate e-mail, since a two-person workshop rarely
    has one and requiring it would just push them to fake it.
    """
    if data.role != "employer":
        return
    if not (data.company_name and data.company_name.strip()):
        raise HTTPException(status_code=400, detail="Şirket adı zorunludur.")
    tax = (data.tax_number or "").strip()
    if not is_valid_tax_number(tax):
        # Real checksum, not just a length check: rejects mistyped numbers and
        # most random digit strings (a VKN/TCKN carries a check digit). Full
        # existence at GİB still needs an online lookup — out of scope here.
        raise HTTPException(
            status_code=400,
            detail="Geçerli bir vergi numarası girin (10 haneli VKN veya 11 haneli TCKN).",
        )
    if data.company_size not in COMPANY_SIZE_BANDS:
        raise HTTPException(status_code=400, detail="Çalışan sayısı aralığını seçin.")
    if data.company_size != "1-5" and not (data.company_email and str(data.company_email).strip()):
        raise HTTPException(
            status_code=400,
            detail="5'ten fazla çalışanı olan şirketler için kurumsal e-posta zorunludur.",
        )


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
    # Employer's registered company — the authoritative name postings publish
    # under. The tax number itself is intentionally NOT returned to the client.
    company_name: str | None = None
    company_size: str | None = None


@router.post(
    "/register",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user (Employer or Candidate)",
)
# Sign-up is a write that also seeds the candidate pool; cap it so the
# "email already exists" reply cannot be used to enumerate the whole user
# base, and so a script cannot mass-create accounts.
@limiter.limit("10/minute")
def register_user(
    request: Request,
    data: RegisterRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> AuthTokenResponse:
    """Registers a new UserAccount and auto-generates a Candidate profile if role is 'candidate'."""
    _validate_employer_profile(data)
    existing = session.exec(select(UserAccount).where(UserAccount.email == data.email)).first()
    if existing:
        # This does reveal that the address is taken — but the person is
        # creating THEIR OWN account, so "you already have an account, sign
        # in instead" is the helpful answer. The rate limit above is what
        # stops that reply from becoming a bulk enumeration oracle.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{data.email}' adresiyle zaten bir hesap var. Giriş yapmayı deneyin."
        )

    hashed_pw = hash_password(data.password)
    user = UserAccount(
        email=data.email,
        hashed_password=hashed_pw,
        role=data.role,
        # Company profile is only meaningful for employers; candidates leave
        # these null. Validation above already guaranteed the required ones.
        company_name=(data.company_name.strip() if data.role == "employer" and data.company_name else None),
        tax_number=(data.tax_number.strip() if data.role == "employer" and data.tax_number else None),
        company_size=(data.company_size if data.role == "employer" else None),
        company_email=(str(data.company_email) if data.role == "employer" and data.company_email else None),
    )
    session.add(user)
    # flush, not commit: user.id is needed to mint the candidate identity
    # below, but the account must not survive if that identity cannot be
    # created — the whole registration commits (or rolls back) as one unit.
    session.flush()

    # If role is candidate, create the server-owned Candidate record
    if data.role == "candidate":
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
            name=data.full_name or data.email.split('@')[0],
            # Consent is captured per submission, not granted at signup.
            consent_granted=False,
        )
        session.add(cand)

    session.commit()
    session.refresh(user)

    # Best-effort, after the response: registration must never fail or slow
    # down because the mail provider is down (or not configured yet).
    subject, html = welcome_email(data.full_name or data.email.split("@")[0])
    background_tasks.add_task(send_email, user.email, subject, html)

    token = create_user_access_token(user)
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
# Tight limit: this is the credential-guessing endpoint. 10/min per end-user
# address makes online password spraying impractical without locking out a
# genuine user who fat-fingers their password a few times.
@limiter.limit("10/minute")
def login_user(
    request: Request,
    data: LoginRequest,
    session: Session = Depends(get_session),
) -> AuthTokenResponse:
    """Authenticates credentials and issues a JWT token."""
    user = session.exec(select(UserAccount).where(UserAccount.email == data.email)).first()
    # Always run the PBKDF2 verification, even when there's no account to
    # check against — see _DUMMY_PASSWORD_HASH above.
    password_ok = verify_password(
        data.password, user.hashed_password if user else _DUMMY_PASSWORD_HASH
    )
    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_user_access_token(user)
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
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    candidate = session.exec(
        select(Candidate).where(Candidate.user_id == user.id)
    ).first()

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        created_at=user.created_at.isoformat(),
        candidate_external_id=candidate.external_id if candidate else None,
        company_name=user.company_name,
        company_size=user.company_size,
    )


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Account e-mail to send the reset link to")


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="Reset token from the e-mailed link")
    # Same policy as registration: the reset path must not accept a password
    # that /register would reject.
    new_password: str = Field(..., description="New password (min 8 chars)")

    @field_validator("token")
    @classmethod
    def _token_min_length(cls, value: str) -> str:
        # A too-short token can never match a real reset link — same Turkish
        # message reset_password itself uses for an invalid/unknown token, so
        # the client can't tell shape-invalid apart from merely-wrong.
        if len(value) < 16:
            raise ValueError(
                "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. "
                "Lütfen yeni bir bağlantı isteyin."
            )
        return value

    @field_validator("new_password")
    @classmethod
    def _new_password_min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Şifre en az 8 karakter olmalıdır.")
        return value


class MessageResponse(BaseModel):
    message: str


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request a password reset link by e-mail",
)
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> MessageResponse:
    """
    Always answers 202 with the same message, whether or not the address has
    an account — this endpoint must not double as an account-existence oracle.

    When the account exists, a single-use token (30 min TTL) is stored as a
    SHA-256 hash and the plaintext goes out by e-mail only. Repeated requests
    inside the cooldown window are silently ignored. The 5/min cap adds a
    second wall against using this endpoint to probe addresses in bulk.
    """
    generic = MessageResponse(
        message="Bu adrese kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi."
    )

    user = session.exec(select(UserAccount).where(UserAccount.email == data.email)).first()
    if not user:
        return generic

    now = datetime.utcnow()
    recent = session.exec(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id)
        .where(PasswordResetToken.created_at > now - timedelta(seconds=RESET_REQUEST_COOLDOWN_SECONDS))
    ).first()
    if recent:
        return generic

    token = secrets.token_urlsafe(32)
    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_reset_token(token),
            expires_at=now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
        )
    )
    record_audit(
        session,
        actor_id=user.email,
        action="auth.password_reset_requested",
        target_entity=f"useraccount:{user.id}",
    )
    session.commit()

    reset_link = f"{_frontend_base_url()}/sifre-sifirla?token={token}"
    subject, html = password_reset_email(reset_link)
    background_tasks.add_task(send_email, user.email, subject, html)

    return generic


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Set a new password using an e-mailed reset token",
)
@limiter.limit("10/minute")
def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    session: Session = Depends(get_session),
) -> MessageResponse:
    """
    Consumes a valid token and replaces the account password. The token row is
    marked used and every other outstanding token of the same account dies
    with it — a leaked older e-mail must not stay a working backdoor. The
    10/min cap stops brute-forcing the reset token itself.
    """
    now = datetime.utcnow()
    token_row = session.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == _hash_reset_token(data.token)
        )
    ).first()

    if not token_row or token_row.used_at is not None or token_row.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. "
                "Lütfen yeni bir bağlantı isteyin."
            ),
        )

    user = session.get(UserAccount, token_row.user_id)
    if not user:
        # The account was deleted after the link went out; the token points at
        # nothing. Same message as above — no oracle here either.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. "
                "Lütfen yeni bir bağlantı isteyin."
            ),
        )

    user.hashed_password = hash_password(data.new_password)
    token_row.used_at = now
    session.add(user)
    session.add(token_row)

    # Retire the account's other live tokens in the same transaction.
    for other in session.exec(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id)
        .where(PasswordResetToken.used_at == None)  # noqa: E711 — SQL IS NULL
    ).all():
        other.used_at = now
        session.add(other)

    record_audit(
        session,
        actor_id=user.email,
        action="auth.password_reset_completed",
        target_entity=f"useraccount:{user.id}",
    )
    session.commit()

    return MessageResponse(message="Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.")


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
    - Account-scoped rows: every PasswordResetToken of the account — the
      forgot/reset flow only ever marks rows used, it never deletes them, so
      anyone who once requested a reset link has live rows — and every
      free-form Requirement the account created via POST /api/v1/requirements
      (created_by_user_id, external_id outside the "req_job_" namespace the
      posting branch already covers). Both carry a cascade-less foreign key
      to useraccount.
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
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

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

    # ── Account-scoped rows ─────────────────────────────────────────────────
    # Password reset tokens: user_id is a cascade-less NOT NULL foreign key,
    # and forgot/reset-password only ever mark rows used — a surviving row
    # aborts the erasure on PostgreSQL exactly like a surviving report would.
    for reset_token in session.exec(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user_id)
    ).all():
        session.delete(reset_token)

    # Free-form requirements (POST /api/v1/requirements) carry the same
    # cascade-less foreign key via created_by_user_id. The posting loop above
    # only removed the auto-generated "req_job_<id>" rows; this sweep catches
    # every requirement the account created, whatever its external_id.
    # (Autoflush has already applied the pending deletes, so the loop's rows
    # do not come back here.)
    for requirement in session.exec(
        select(Requirement).where(Requirement.created_by_user_id == user_id)
    ).all():
        session.delete(requirement)

    # The postings and requirements above reference this account
    # (created_by_user_id), and the reset tokens do via user_id — all must be
    # gone from the database before the account row itself goes.
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


# ─────────────────────────────────────────────────────────────────────────────
# KVKK md. 11 — right of access & data portability (GET /me/export)
# ─────────────────────────────────────────────────────────────────────────────
# Erasure (DELETE /me above) and access are the two halves of one right, and
# they must agree on what "the caller's own data" is. This endpoint therefore
# walks the SAME ownership queries delete_me walks — Candidate.user_id,
# JobPosting.created_by_user_id, Requirement.created_by_user_id,
# PasswordResetToken.user_id — only in the read direction. Nothing is keyed by
# a path or query parameter, so there is no identifier for a caller to swap:
# the export is bound to the account behind the token and to nothing else.

EXPORT_FORMAT_VERSION = "1.0"
EXPORT_PLATFORM_NAME = "EİP — Kanıt Zekâsı Platformu"

# Shown inside the downloaded document itself: whoever opens the file months
# later must be able to tell what it does and does not contain, without
# reading this source file.
EXPORT_NOTES = [
    "Bu belge, KVKK md. 11 kapsamındaki 'kişisel verilere erişme ve veri taşınabilirliği' "
    "hakkınız gereği, yalnızca sizin hesabınıza ait kayıtlardan oluşturulmuştur.",
    "Yüklediğiniz belgelerin İÇERİĞİ (PDF, görsel vb. dosyaların kendisi) bu belgeye dahil "
    "değildir; kanıt kayıtlarında yalnızca dosya adı, dosya türü, yüklenme zamanı ve "
    "moderasyon durumu gibi üst veriler yer alır.",
    "Şifreniz ve şifre sıfırlama bağlantılarınızın gizli değerleri hiçbir koşulda dışa "
    "aktarılmaz; şifre sıfırlama kayıtlarında yalnızca tarih bilgisi bulunur.",
    "İşveren hesapları için ilanlara gelen başvurular yalnızca sayısal özet olarak yer alır: "
    "başvuran adayların kimlik ve kişisel bilgileri, onların KVKK hakları gereği bu belgeye "
    "yazılmaz.",
]


class ExportCategory(BaseModel):
    """One data category in the export, with how many records it carries."""
    key: str
    label: str
    count: int


class ExportAccount(BaseModel):
    """
    The account row itself. hashed_password is never included — it is a
    credential, not personal data the account holder needs back.
    """
    id: int
    email: str
    role: str
    created_at: str
    # Employer-only profile. Unlike GET /auth/me, the tax number IS included
    # here: /auth/me feeds the UI (which has no use for it), while this
    # document answers "what do you hold about me" — and the tax number is
    # held about this account, so withholding it would make the answer false.
    company_name: str | None = None
    company_size: str | None = None
    company_email: str | None = None
    tax_number: str | None = None


class ExportCandidateProfile(BaseModel):
    external_id: str
    name: str
    consent_granted: bool
    consent_timestamp: str
    created_at: str
    interests: list[str] = []


class ExportEvidence(BaseModel):
    """
    An evidence verdict as its owner may read it back.

    Moderation internals stay behind the same seam candidates.py draws: the
    storage path on disk, the deciding admin's e-mail and the internal review
    note are not exported. `has_media` plus the filename/MIME pair is the
    metadata promised in EXPORT_NOTES; the file bytes themselves are not here.
    """
    requirement_external_id: str
    source_type: str
    status: str
    confidence_score: int | None = None
    reasoning: str
    evidence_pointer: str | None = None
    review_status: str
    created_at: str
    has_media: bool = False
    media_filename: str | None = None
    media_mime: str | None = None


class ExportApplication(BaseModel):
    """The candidate's own application, named by the posting it went to."""
    job_id: int
    job_title: str | None = None
    company_name: str | None = None
    status: str
    created_at: str


class ExportReport(BaseModel):
    """An explainability report about the exporting candidate."""
    created_at: str
    job_title: str | None = None
    final_summary: str
    # Stored as a JSON string; handed back verbatim rather than re-encoded, so
    # the export never disagrees with what the platform actually holds.
    match_matrix: str


class ExportConsent(BaseModel):
    candidate_external_id: str
    consent_granted: bool
    consent_timestamp: str
    ip_address: str | None = None


class ExportPasswordResetEvent(BaseModel):
    """
    Timing metadata only. The token hash — and above all the token itself,
    which the database never stores — stay out: a live reset link inside a
    downloadable file would be a ready-made account takeover.
    """
    created_at: str
    expires_at: str
    used_at: str | None = None


class ExportJobPosting(BaseModel):
    id: int
    title: str
    description: str
    category: str
    status: str
    created_at: str
    company_name: str | None = None


class ExportRequirement(BaseModel):
    external_id: str
    description: str
    created_at: str


class ExportReceivedApplicationSummary(BaseModel):
    """
    Counts, never people. An employer's own hiring activity is their data; the
    applicants behind it are not, so this carries totals per posting and no
    applicant name, e-mail, candidate id or AI-derived trait.
    """
    job_id: int
    job_title: str
    total: int
    by_status: dict[str, int] = {}


class DataExportResponse(BaseModel):
    format_version: str
    platform: str
    exported_at: str
    notes: list[str]
    categories: list[ExportCategory]
    account: ExportAccount
    # Candidate-side categories (empty for a pure employer account).
    candidate_profiles: list[ExportCandidateProfile] = []
    evidence: list[ExportEvidence] = []
    applications: list[ExportApplication] = []
    reports: list[ExportReport] = []
    consents: list[ExportConsent] = []
    # Account-scoped.
    password_reset_events: list[ExportPasswordResetEvent] = []
    # Employer-side categories (empty for a pure candidate account).
    job_postings: list[ExportJobPosting] = []
    requirements: list[ExportRequirement] = []
    received_applications: list[ExportReceivedApplicationSummary] = []


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _job_of_application(session: Session, application: JobApplication) -> JobPosting | None:
    return session.get(JobPosting, application.job_id) if application.job_id else None


@router.get(
    "/me/export",
    response_model=DataExportResponse,
    dependencies=[Depends(verify_api_key)],
    summary="Export the authenticated account's own data as JSON (KVKK md. 11)",
)
# An export touches every table the account appears in, so it is far heavier
# than /auth/me. The cap keeps a stuck download button (or a script) from
# turning the portability right into a self-inflicted denial of service.
@limiter.limit("5/minute")
def export_me(
    request: Request,
    user: CurrentUser = Depends(require_user),
    session: Session = Depends(get_session),
) -> DataExportResponse:
    """
    KVKK/GDPR right-of-access endpoint: returns everything the platform holds
    about the CALLER, as structured JSON the client can offer as a download.

    Scope, mirroring delete_me's ownership queries in the read direction:

    - Candidate-owned: every Candidate profile linked via user_id, that
      profile's Evidence (metadata only), JobApplications, ExplainabilityReports
      and ConsentLog rows.
    - Employer-owned: every JobPosting created by the account, the Requirements
      it defined (both the auto-generated "req_job_<id>" ones and free-form
      rows), and a COUNT-ONLY summary of the applications those postings
      received. Applicant identity is deliberately absent — see
      ExportReceivedApplicationSummary.
    - Account-scoped: the account row (never its password hash) and password
      reset events (timestamps only, never a token or its hash).

    Both branches run for every account, exactly as in delete_me, so a hybrid
    or admin account is handled uniformly instead of by a role switch that
    could silently drop a category.
    """
    email = user.get("sub")
    account = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not account:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    user_id = account.id

    # ── Candidate-owned data ────────────────────────────────────────────────
    candidates = session.exec(
        select(Candidate).where(Candidate.user_id == user_id).order_by(Candidate.id)
    ).all()

    profiles: list[ExportCandidateProfile] = []
    evidence_out: list[ExportEvidence] = []
    applications_out: list[ExportApplication] = []
    reports_out: list[ExportReport] = []
    consents_out: list[ExportConsent] = []

    for candidate in candidates:
        profiles.append(ExportCandidateProfile(
            external_id=candidate.external_id,
            name=candidate.name,
            consent_granted=candidate.consent_granted,
            consent_timestamp=_iso(candidate.consent_timestamp),
            created_at=_iso(candidate.created_at),
            # Same comma-separated encoding candidates.py reads; unpacked here
            # so the document is readable without knowing the storage format.
            interests=[key for key in (candidate.interests or "").split(",") if key],
        ))

        for evidence in session.exec(
            select(Evidence)
            .where(Evidence.candidate_external_id == candidate.external_id)
            .order_by(Evidence.id)
        ).all():
            evidence_out.append(ExportEvidence(
                requirement_external_id=evidence.requirement_external_id,
                source_type=evidence.source_type,
                status=evidence.status,
                confidence_score=evidence.confidence_score,
                reasoning=evidence.reasoning,
                evidence_pointer=evidence.evidence_pointer,
                review_status=evidence.review_status,
                created_at=_iso(evidence.created_at),
                has_media=bool(evidence.media_path),
                media_filename=evidence.media_filename,
                media_mime=evidence.media_mime,
            ))

        for application in session.exec(
            select(JobApplication)
            .where(JobApplication.candidate_id == candidate.id)
            .order_by(JobApplication.id)
        ).all():
            job = _job_of_application(session, application)
            company = session.get(Company, job.company_id) if job and job.company_id else None
            applications_out.append(ExportApplication(
                job_id=application.job_id,
                job_title=job.title if job else None,
                company_name=company.name if company else None,
                status=application.status,
                created_at=_iso(application.created_at),
            ))

        for report in session.exec(
            select(ExplainabilityReport)
            .where(ExplainabilityReport.candidate_external_id == candidate.external_id)
            .order_by(ExplainabilityReport.id)
        ).all():
            linked = (
                session.get(JobApplication, report.application_id)
                if report.application_id
                else None
            )
            job = _job_of_application(session, linked) if linked else None
            reports_out.append(ExportReport(
                created_at=_iso(report.created_at),
                job_title=job.title if job else None,
                final_summary=report.final_summary,
                match_matrix=report.match_matrix,
            ))

        # ConsentLog rows survive account deletion by design (they are the
        # legal proof processing was authorized), which makes them exactly the
        # kind of record the access right exists to disclose.
        for consent in session.exec(
            select(ConsentLog)
            .where(ConsentLog.candidate_external_id == candidate.external_id)
            .order_by(ConsentLog.id)
        ).all():
            consents_out.append(ExportConsent(
                candidate_external_id=consent.candidate_external_id,
                consent_granted=consent.consent_granted,
                consent_timestamp=_iso(consent.consent_timestamp),
                ip_address=consent.ip_address,
            ))

    # ── Employer-owned data ─────────────────────────────────────────────────
    postings = session.exec(
        select(JobPosting)
        .where(JobPosting.created_by_user_id == user_id)
        .order_by(JobPosting.id)
    ).all()

    postings_out: list[ExportJobPosting] = []
    received: list[ExportReceivedApplicationSummary] = []
    for posting in postings:
        company = session.get(Company, posting.company_id) if posting.company_id else None
        postings_out.append(ExportJobPosting(
            id=posting.id,
            title=posting.title,
            description=posting.description,
            category=posting.category,
            status=posting.status,
            created_at=_iso(posting.created_at),
            company_name=company.name if company else None,
        ))

        # Counts only. The Candidate table is never joined in this branch: a
        # name, an e-mail, a candidate id or an AI-derived trait belongs to the
        # APPLICANT, and handing another person's data to the employer inside
        # a KVKK document would be a fresh violation rather than compliance.
        by_status: dict[str, int] = {}
        for application in session.exec(
            select(JobApplication).where(JobApplication.job_id == posting.id)
        ).all():
            by_status[application.status] = by_status.get(application.status, 0) + 1
        received.append(ExportReceivedApplicationSummary(
            job_id=posting.id,
            job_title=posting.title,
            total=sum(by_status.values()),
            by_status=dict(sorted(by_status.items())),
        ))

    # Requirements the account defined. created_by_user_id covers both the
    # free-form ones (POST /api/v1/requirements) and the auto-generated
    # "req_job_<id>" rows; the per-posting lookup catches postings published
    # before requirement ownership was tracked, whose rows carry a NULL owner —
    # the same pair of paths delete_me deletes through.
    requirements: dict[str, Requirement] = {
        requirement.external_id: requirement
        for requirement in session.exec(
            select(Requirement)
            .where(Requirement.created_by_user_id == user_id)
            .order_by(Requirement.id)
        ).all()
    }
    for posting in postings:
        external_id = f"req_job_{posting.id}"
        if external_id not in requirements:
            owned = session.exec(
                select(Requirement).where(Requirement.external_id == external_id)
            ).first()
            if owned:
                requirements[external_id] = owned

    requirements_out = [
        ExportRequirement(
            external_id=requirement.external_id,
            description=requirement.description,
            created_at=_iso(requirement.created_at),
        )
        for requirement in sorted(requirements.values(), key=lambda r: r.id or 0)
    ]

    # ── Account-scoped rows ─────────────────────────────────────────────────
    reset_events = [
        ExportPasswordResetEvent(
            created_at=_iso(token_row.created_at),
            expires_at=_iso(token_row.expires_at),
            used_at=_iso(token_row.used_at),
        )
        for token_row in session.exec(
            select(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id)
            .order_by(PasswordResetToken.id)
        ).all()
    ]

    account_out = ExportAccount(
        id=account.id,
        email=account.email,
        role=account.role,
        created_at=_iso(account.created_at),
        company_name=account.company_name,
        company_size=account.company_size,
        company_email=account.company_email,
        tax_number=account.tax_number,
    )

    categories = [
        ExportCategory(key="account", label="Hesap bilgileri", count=1),
        ExportCategory(key="candidate_profiles", label="Aday profilleriniz", count=len(profiles)),
        ExportCategory(
            key="evidence",
            label="Kanıt kayıtlarınız (yalnızca üst veri, dosya içeriği hariç)",
            count=len(evidence_out),
        ),
        ExportCategory(key="applications", label="Başvurularınız", count=len(applications_out)),
        ExportCategory(key="reports", label="Eşleşme raporlarınız", count=len(reports_out)),
        ExportCategory(key="consents", label="Rıza (onay) kayıtlarınız", count=len(consents_out)),
        ExportCategory(
            key="password_reset_events",
            label="Şifre sıfırlama işlemleriniz (yalnızca tarih bilgisi)",
            count=len(reset_events),
        ),
        ExportCategory(key="job_postings", label="Yayınladığınız ilanlar", count=len(postings_out)),
        ExportCategory(
            key="requirements",
            label="Tanımladığınız değerlendirme kriterleri",
            count=len(requirements_out),
        ),
        ExportCategory(
            key="received_applications",
            label="İlanlarınıza gelen başvuruların sayısal özeti (aday kimliği içermez)",
            count=len(received),
        ),
    ]

    # A data-access request is a legally relevant event about a person, so it
    # leaves a record like the erasure and the moderation verdicts do. The
    # account survives an export, so the actor is the plain address here —
    # unlike delete_me, which must hash it.
    record_audit(
        session,
        actor_id=email,
        action="account.export",
        target_entity=f"useraccount:{user_id}",
        details=f"role={account.role}; KVKK md.11 data portability export",
    )
    session.commit()

    return DataExportResponse(
        format_version=EXPORT_FORMAT_VERSION,
        platform=EXPORT_PLATFORM_NAME,
        exported_at=datetime.utcnow().isoformat(),
        notes=EXPORT_NOTES,
        categories=categories,
        account=account_out,
        candidate_profiles=profiles,
        evidence=evidence_out,
        applications=applications_out,
        reports=reports_out,
        consents=consents_out,
        password_reset_events=reset_events,
        job_postings=postings_out,
        requirements=requirements_out,
        received_applications=received,
    )
