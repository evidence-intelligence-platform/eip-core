"""
EIF: Database ORM Models (SQLModel)
---
Version: 1.3.0
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md
---
Defines all 11 relational entities required by the EIF Architecture Specification:
1. UserAccount (USERS)
2. Role (ROLES)
3. Permission (PERMISSIONS)
4. Company (COMPANIES)
5. Candidate (CANDIDATE_PROFILES)
6. Requirement (JOB_REQUIREMENTS)
7. JobPosting (JOBS)
8. JobApplication (JOB_APPLICATIONS)
9. Evidence (AI_CANDIDATE_INSIGHTS & RAW_EVIDENCE)
10. ExplainabilityReport (EXPLAINABILITY_REPORTS)
11. ConsentLog (CONSENT_LOGS)
12. AuditTrail (AUDIT_TRAIL)
"""

from datetime import datetime

from sqlmodel import Field, SQLModel


class UserAccount(SQLModel, table=True):
    """User account model for Core Zone authentication and authorization."""
    id: int | None = Field(default=None, primary_key=True)
    # Everyone signs up with a personal e-mail — a company address is never
    # required to hold an account. Employers optionally add a corporate e-mail
    # (see company_email) once their team is large enough to have one.
    email: str = Field(index=True, unique=True)
    hashed_password: str
    role: str = Field(default="candidate", description="employer, candidate, admin")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # ── Employer-only company profile (all nullable; a candidate leaves them
    #    empty). Collected at registration so a posting can be attributed to a
    #    verifiable legal entity from the first day. ──────────────────────────
    company_name: str | None = Field(default=None, description="Employer: legal/company name")
    tax_number: str | None = Field(
        default=None,
        description="Employer: Turkish tax number (VKN/TCKN) — required for every company",
    )
    company_size: str | None = Field(
        default=None,
        description="Employer: headcount band, e.g. '1-5', '6-20', '21-50', '50+'",
    )
    company_email: str | None = Field(
        default=None,
        description="Employer: corporate e-mail, requested only when the team exceeds 5 people",
    )


class PasswordResetToken(SQLModel, table=True):
    """
    Single-use, short-lived password reset token.

    Only the SHA-256 of the token is stored: a database leak must not hand an
    attacker ready-to-use reset links. The plaintext token exists once, inside
    the e-mail sent to the account owner. `used_at` marks consumption — a
    consumed or expired row never resets anything again.
    """
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="useraccount.id", index=True)
    token_hash: str = Field(index=True, unique=True, description="SHA-256 hex of the token")
    expires_at: datetime
    used_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Role(SQLModel, table=True):
    """Role definitions for access control."""
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True, description="employer, candidate, admin")
    description: str | None = None


class Permission(SQLModel, table=True):
    """Granular permission flags."""
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    category: str = Field(description="read, write, execute, admin")
    description: str | None = None


class Company(SQLModel, table=True):
    """Employer company entity."""
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    industry: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Candidate(SQLModel, table=True):
    """Candidate profile entity."""
    id: int | None = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True, description="External ID from ATS or Core system")
    user_id: int | None = Field(
        default=None,
        foreign_key="useraccount.id",
        index=True,
        description="Owning account. Without it a candidate cannot be told apart from anyone else's record.",
    )
    name: str
    consent_granted: bool = Field(default=True, description="Crucial privacy flag for GDPR/CCPA")
    consent_timestamp: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Comma-separated category keys the candidate is interested in (e.g.
    # "HEALTHCARE,EDUCATION"). Drives the personalized job feed; empty means
    # "show everything". Editable from the hub at any time.
    interests: str | None = Field(default=None)


class Requirement(SQLModel, table=True):
    """Job requirement entity."""
    id: int | None = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True, description="External ID from ATS or Core system")
    description: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by_user_id: int | None = Field(
        default=None,
        foreign_key="useraccount.id",
        index=True,
        description=(
            "Employer account that defined this requirement. Nullable because "
            "rows created before ownership tracking have no attributable "
            "owner. Scopes listing so one company's hiring criteria are never "
            "visible to another — a shared global list let any employer read "
            "every other employer's requirements."
        ),
    )


class JobPosting(SQLModel, table=True):
    """Job posting created by employer companies."""
    id: int | None = Field(default=None, primary_key=True)
    company_id: int | None = Field(default=None, foreign_key="company.id")
    created_by_user_id: int | None = Field(
        default=None,
        foreign_key="useraccount.id",
        index=True,
        description=(
            "Employer account that created the posting. Nullable because rows "
            "created before ownership tracking have no known owner; KVKK "
            "account deletion needs this to know which postings to erase."
        ),
    )
    title: str = Field(index=True)
    description: str
    category: str = Field(
        default="OTHER",
        index=True,
        description="Profession category. The sector filter had nothing to match on without it.",
    )
    status: str = Field(default="active", description="draft, active, closed")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class JobApplication(SQLModel, table=True):
    """Application connecting candidate to a job posting."""
    id: int | None = Field(default=None, primary_key=True)
    candidate_id: int = Field(foreign_key="candidate.id")
    job_id: int = Field(foreign_key="jobposting.id")
    status: str = Field(default="submitted", description="submitted, reviewing, accepted, declined")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Cached AI standout traits (JSON array of short skill phrases), computed
    # once from the applicant's verified evidence and reused on every dashboard
    # load. Null until first computed; "[]" means "computed, nothing to show".
    standout_traits: str | None = Field(default=None)


class Evidence(SQLModel, table=True):
    """AI Extraction & raw evidence link record."""
    id: int | None = Field(default=None, primary_key=True)
    candidate_external_id: str = Field(index=True)
    requirement_external_id: str = Field(index=True)
    source_type: str
    status: str  # VERIFIED, INSUFFICIENT EVIDENCE, CONTRADICTION
    confidence_score: int | None = None
    reasoning: str
    evidence_pointer: str | None = None
    # Human moderation. Uploaded images and scanned PDFs are trivial to
    # doctor, so they start "pending" until an admin decides; plain text and
    # text-layer PDFs stay "approved". Values: pending | approved | rejected.
    review_status: str = Field(default="approved", index=True)
    media_path: str | None = None  # relative path inside UPLOAD_DIR
    media_mime: str | None = None
    media_filename: str | None = None  # original upload name, sanitized, display only
    reviewed_by: str | None = None  # email of the deciding admin
    reviewed_at: datetime | None = None
    review_note: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ExplainabilityReport(SQLModel, table=True):
    """Explainability report matrix generated for candidate job match."""
    id: int | None = Field(default=None, primary_key=True)
    application_id: int | None = Field(default=None, foreign_key="jobapplication.id")
    candidate_external_id: str = Field(index=True)
    match_matrix: str = Field(description="JSON formatted match matrix string")
    final_summary: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ConsentLog(SQLModel, table=True):
    """Immutable audit record for privacy consent events."""
    id: int | None = Field(default=None, primary_key=True)
    candidate_external_id: str = Field(index=True)
    consent_granted: bool
    consent_timestamp: datetime = Field(default_factory=datetime.utcnow)
    ip_address: str | None = None


class AuditTrail(SQLModel, table=True):
    """Immutable system audit trail log."""
    id: int | None = Field(default=None, primary_key=True)
    actor_id: str = Field(index=True)
    action: str = Field(index=True)
    target_entity: str
    details: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
