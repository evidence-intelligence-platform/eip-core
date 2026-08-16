"""
EIF: Pydantic Schemas for the Isolated Intelligence Zone
---
Version: 1.3.0
Owner: EIF Architecture Team
Compliance:
  - 01_ENGINEERING_CONSTITUTION.md Article II, Section 1: Consent as Prerequisite
  - AI_AGENT_RULES.md Rule 2: Never output a result without reasoning + evidence_pointer
---
AUDIT FIXES (2026-07-22):
  - [FIXED] Added "PDF_RESUME" to EvidencePayload.source_type Literal.
    The file upload endpoint used "PDF_RESUME" but the schema only allowed
    GITHUB | CHATGPT | LINKEDIN → caused runtime Pydantic ValidationError.
  - [FIXED] Added consent_verified field to EvidencePayload with a @model_validator.
    Per Engineering Constitution Article II.1, no extraction may run without
    explicit candidate consent. This is now enforced at the schema level —
    the first line of defense before any business logic executes.
  - [FIXED] Added max_length to raw_data to prevent oversized LLM requests (SEC-4).
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

# 5 MB covers a phone photo of a certificate without letting a 40 MB scan
# through. Kept here so both the schema and the upload endpoint agree.
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

# Magic bytes, because the browser-supplied filename and content-type are
# both under the caller's control.
_MAGIC = {
    "image/jpeg": lambda d: d[:3] == bytes.fromhex("ffd8ff"),
    "image/png": lambda d: d[:8] == bytes.fromhex("89504e470d0a1a0a"),
    "image/webp": lambda d: d[:4] == b"RIFF" and d[8:12] == b"WEBP",
    "application/pdf": lambda d: d[:5] == b"%PDF-",
}


class MediaAttachment(BaseModel):
    """
    A document the model should *look at* rather than read as text.

    A construction worker's safety certificate, a nurse's diploma and a
    driver's licence are usually photographs. Sending only extracted text
    meant those documents were unreadable — and because the score is
    verified/total, attaching one actively lowered the candidate's result.
    """
    mime_type: Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]
    data: bytes = Field(..., repr=False, exclude=True)
    filename: str | None = None

    @model_validator(mode="after")
    def validate_attachment(self) -> "MediaAttachment":
        if len(self.data) > MAX_ATTACHMENT_BYTES:
            raise ValueError(
                f"Dosya boyutu çok büyük. En fazla {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB."
            )
        checker = _MAGIC.get(self.mime_type)
        if checker and not checker(self.data):
            raise ValueError("Dosya içeriği belirtilen türle uyuşmuyor.")
        return self


class EvidencePayload(BaseModel):
    """
    The standardized evidence container passed to the Extraction Engine.

    Every field is required. consent_verified MUST be True — the schema
    validator will raise an error before processing if it is False.
    This is not a UI convenience; it is a legal and ethical enforcement point.
    """
    candidate_id: str = Field(
        ...,
        description="Unique identifier for the candidate (from the Core Zone)."
    )
    source_type: Literal[
        "GITHUB", "CHATGPT", "LINKEDIN", "PDF_RESUME",
        "LINKEDIN_URL", "PORTFOLIO_LINK", "CERTIFICATE_LICENSE",
        "CHATGPT_EXPORT", "CASE_STUDY_BLOG",
        "IMAGE_DOCUMENT", "SCANNED_PDF",
    ] = Field(
        ...,
        description="The type of evidence source. Determines parsing context."
    )
    raw_data: str = Field(
        ...,
        max_length=150_000,
        description="Raw evidence content. Max 150,000 characters to prevent LLM abuse."
    )
    media: list[MediaAttachment] = Field(
        default_factory=list,
        max_length=5,
        description="Documents to be read visually (photos of certificates, scanned PDFs).",
    )
    consent_verified: bool = Field(
        ...,
        description=(
            "Explicit candidate consent flag. MUST be True. "
            "Set to False is a Constitution violation and will be rejected. "
            "Compliance: 01_ENGINEERING_CONSTITUTION.md Article II, Section 1."
        )
    )

    @model_validator(mode='after')
    def enforce_consent_gate(self) -> 'EvidencePayload':
        """
        THE CONSENT GATE.
        This is the code-level enforcement of Engineering Constitution Article II, Section 1.
        No data extraction pipeline may execute without cryptographically/verifiably
        confirmed candidate consent. False or missing consent STOPS processing here.
        """
        if not self.consent_verified:
            raise ValueError(
                "CONSENT GATE VIOLATION: Evidence extraction is strictly forbidden "
                "without explicit candidate consent. "
                "consent_verified must be True. "
                "Ref: 01_ENGINEERING_CONSTITUTION.md Article II, Section 1."
            )
        if not self.raw_data.strip() and not self.media:
            raise ValueError("Boş kanıt gönderilemez: metin veya belge eklenmelidir.")
        return self


class Requirement(BaseModel):
    """A single job requirement to evaluate the candidate against."""
    id: str = Field(..., description="Unique identifier for this requirement.")
    category: str | None = Field(
        default=None,
        description=(
            "Profession category of the posting. Lets the model apply the right "
            "evidence standard: a licence number for a driver, a repository for "
            "a developer — neither ranked above the other."
        ),
    )
    description: str = Field(
        ...,
        description="Human-readable description of the requirement being evaluated."
    )


class ExtractionResult(BaseModel):
    """
    The strictly typed output of the Evidence Extractor.

    Compliance: AI_AGENT_RULES.md Rule 2 — An AI agent must NEVER output a result
    without a `reasoning` and `evidence_pointer` field. The schema enforces this
    at the type level. An empty `reasoning` is a Constitution violation.
    """
    status: Literal["VERIFIED", "INSUFFICIENT EVIDENCE", "CONTRADICTION"] = Field(
        ...,
        description="The definitive, evidence-based status of the extraction."
    )
    confidence_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Confidence score of the evaluation from 0 to 100. Below 85 should require human review."
    )
    reasoning: str = Field(
        ...,
        min_length=10,
        description=(
            "Mandatory explanation of why this status was chosen. "
            "Must reference observable evidence, not personality assessments."
        )
    )
    evidence_pointer: str | None = Field(
        None,
        description=(
            "URL, direct quote, or exact reference to the evidence in the raw data. "
            "Required when status is VERIFIED or CONTRADICTION."
        )
    )

    @model_validator(mode='after')
    def enforce_evidence_pointer(self) -> 'ExtractionResult':
        """
        THE EVIDENCE GATE.
        A verdict about a person that nobody can trace back to a source is the
        exact thing this platform exists to refuse, so an unsupported VERIFIED
        or CONTRADICTION is rejected here instead of being persisted as an
        audit-trail row that cannot be audited. INSUFFICIENT EVIDENCE is the
        honest answer when there is nothing to point at, and it alone may leave
        the pointer empty.
        Compliance: AI_AGENT_RULES.md Rule 2.
        """
        # A whitespace-only pointer is not evidence — it merely satisfies a
        # `is not None` check, which is how an empty claim would slip through.
        if self.status in ("VERIFIED", "CONTRADICTION") and not (self.evidence_pointer or "").strip():
            raise ValueError(
                f"EVIDENCE POINTER VIOLATION: '{self.status}' sonucu kanıt gösterilmeden "
                "verilemez. evidence_pointer alanı zorunludur; kanıta işaret edilemiyorsa "
                "doğru sonuç 'INSUFFICIENT EVIDENCE'tır. "
                "Ref: AI_AGENT_RULES.md Rule 2."
            )
        return self


class FileExtractionResult(ExtractionResult):
    """
    ExtractionResult for file uploads, plus the moderation verdict.

    A photographed certificate is easy to doctor, so uploaded images and
    scanned PDFs wait for a human decision ("pending") while text keeps the
    old behaviour ("approved"). Only adds a field — existing consumers of
    ExtractionResult keep working unchanged.
    """
    review_status: Literal["pending", "approved"] = Field(
        "approved",
        description='"pending" when the uploaded document awaits admin review.',
    )


class ExtractRequest(BaseModel):
    """The top-level request envelope sent to the extraction endpoint."""
    payload: EvidencePayload
    requirement: Requirement
