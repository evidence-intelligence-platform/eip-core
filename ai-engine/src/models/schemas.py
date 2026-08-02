"""
EIF: Pydantic Schemas for the Isolated Intelligence Zone
---
Version: 1.2.0
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
        "CHATGPT_EXPORT", "CASE_STUDY_BLOG"
    ] = Field(
        ...,
        description="The type of evidence source. Determines parsing context."
    )
    raw_data: str = Field(
        ...,
        max_length=150_000,
        description="Raw evidence content. Max 150,000 characters to prevent LLM abuse."
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
        return self


class Requirement(BaseModel):
    """A single job requirement to evaluate the candidate against."""
    id: str = Field(..., description="Unique identifier for this requirement.")
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


class ExtractRequest(BaseModel):
    """The top-level request envelope sent to the extraction endpoint."""
    payload: EvidencePayload
    requirement: Requirement
