"""
EIF: AI Engine — FastAPI Application Entry Point
---
Version: 1.2.0
Owner: EIF Architecture Team
Compliance:
  - 04_SYSTEM_ARCHITECTURE.md: Isolated Intelligence Zone
  - 06_API_CONTRACTS.md: All endpoints require authentication
  - 01_ENGINEERING_CONSTITUTION.md: Zero Trust, Consent Gate
---
AUDIT FIXES (2026-07-22):
  - [FIXED] Added API Key authentication (verify_api_key) to all extraction endpoints.
    Per 06_API_CONTRACTS.md, no endpoint may be publicly accessible without credentials.
  - [FIXED] consent_verified is now enforced at the schema level (schemas.py) AND
    verified in the file upload endpoint's form data.
  - [FIXED] PDF_RESUME source_type is now valid per updated schemas.py.
  - [FIXED] LLM service now uses GeminiLLMService (BaseLLMService implementation).
  - [NOTE] CORS is configured for localhost only. Add ALLOWED_ORIGINS env var
    before any deployment.
"""

from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlmodel import Session
from typing import Annotated

from src.models.schemas import ExtractRequest, ExtractionResult, EvidencePayload, Requirement as SchemaRequirement
from src.services.llm_service import GeminiLLMService
from src.services.base_llm import BaseLLMService
from src.db.database import create_db_and_tables, get_session
from src.db.models import Candidate, Requirement, Evidence
from src.routers import candidates, requirements
from src.security.auth import verify_api_key
from src.services.pdf_service import extract_text_from_pdf_bytes


# ─────────────────────────────────────────────────────────────────────────────
# Application Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events for the AI Engine."""
    create_db_and_tables()
    yield


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Application
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="EIP Evidence Extractor API",
    description=(
        "Strictly typed Isolated Intelligence Zone API. "
        "Extracts verifiable evidence from candidate data payloads. "
        "All endpoints require X-Internal-API-Key authentication. "
        "Ref: 04_SYSTEM_ARCHITECTURE.md — Isolated Intelligence Zone."
    ),
    version="1.2.0",
    lifespan=lifespan,
)

# CORS: Restricted to localhost for development.
# TODO (Phase 7): Move allowed origins to ALLOWED_ORIGINS environment variable.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(candidates.router)
app.include_router(requirements.router)

# ─────────────────────────────────────────────────────────────────────────────
# LLM Service Initialization
# ─────────────────────────────────────────────────────────────────────────────
# The service is typed as BaseLLMService (the abstract interface).
# This allows swapping the underlying provider (Gemini → OpenAI → Local)
# without changing any business logic. Ref: 02_FOUNDATION_MANIFEST.md Section 2.
llm_service: BaseLLMService = GeminiLLMService()


# ─────────────────────────────────────────────────────────────────────────────
# Extraction Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post(
    "/api/v1/extract",
    response_model=ExtractionResult,
    dependencies=[Depends(verify_api_key)],
    summary="Extract evidence from a raw data payload",
    tags=["extraction"],
)
def extract_evidence(
    request: ExtractRequest,
    session: Session = Depends(get_session),
) -> ExtractionResult:
    """
    Core extraction endpoint. Accepts a structured evidence payload and a requirement.

    Authentication: X-Internal-API-Key header required.
    Consent Gate: request.payload.consent_verified must be True (enforced by schema).

    Returns an ExtractionResult with:
    - status: VERIFIED | INSUFFICIENT EVIDENCE | CONTRADICTION
    - reasoning: Mandatory human-readable explanation (non-empty)
    - evidence_pointer: Direct reference to the evidence source
    """
    try:
        result = llm_service.extract_evidence(request)

        # Persist the result for audit trail and future report generation
        db_evidence = Evidence(
            candidate_external_id=request.payload.candidate_id,
            requirement_external_id=request.requirement.id,
            source_type=request.payload.source_type,
            status=result.status,
            reasoning=result.reasoning,
            evidence_pointer=result.evidence_pointer,
        )
        session.add(db_evidence)
        session.commit()
        session.refresh(db_evidence)

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post(
    "/api/v1/extract/file",
    response_model=ExtractionResult,
    dependencies=[Depends(verify_api_key)],
    summary="Extract evidence from an uploaded file (PDF/TXT)",
    tags=["extraction"],
)
async def extract_evidence_from_file(
    candidate_id: str = Form(..., description="Candidate ID from the Core Zone."),
    requirement_id: str = Form(..., description="Requirement ID to evaluate against."),
    consent_verified: bool = Form(
        ...,
        description=(
            "Explicit candidate consent. MUST be True. "
            "Ref: 01_ENGINEERING_CONSTITUTION.md Article II, Section 1."
        )
    ),
    source_type: str = Form(
        "PDF_RESUME",
        description="Source type. Defaults to PDF_RESUME for file uploads."
    ),
    file: UploadFile = File(..., description="PDF or plain text file to analyze."),
    session: Session = Depends(get_session),
) -> ExtractionResult:
    """
    File-based extraction endpoint. Accepts a PDF or TXT file upload.

    Authentication: X-Internal-API-Key header required.
    Consent Gate: consent_verified form field must be True.

    Parses the file, constructs an ExtractRequest, and delegates to the same
    LLM service used by the JSON endpoint for consistency.
    """
    try:
        # Fetch the requirement from DB to get its description
        from sqlmodel import select
        req_db = session.exec(
            select(Requirement).where(Requirement.external_id == requirement_id)
        ).first()
        if not req_db:
            raise HTTPException(
                status_code=404,
                detail=f"Requirement '{requirement_id}' not found in database."
            )

        # Parse file content
        content_bytes = await file.read()

        if file.filename and file.filename.lower().endswith(".pdf"):
            raw_text = extract_text_from_pdf_bytes(content_bytes)
        elif file.content_type == "application/pdf":
            raw_text = extract_text_from_pdf_bytes(content_bytes)
        else:
            # Assume UTF-8 text for all other formats
            raw_text = content_bytes.decode("utf-8", errors="ignore")

        # Build the typed request — schema validation enforces consent gate
        request = ExtractRequest(
            payload=EvidencePayload(
                candidate_id=candidate_id,
                source_type=source_type,  # type: ignore[arg-type]
                raw_data=raw_text,
                consent_verified=consent_verified,
            ),
            requirement=SchemaRequirement(
                id=req_db.external_id,
                description=req_db.description,
            ),
        )

        result = llm_service.extract_evidence(request)

        db_evidence = Evidence(
            candidate_external_id=request.payload.candidate_id,
            requirement_external_id=request.requirement.id,
            source_type=request.payload.source_type,
            status=result.status,
            reasoning=result.reasoning,
            evidence_pointer=result.evidence_pointer,
        )
        session.add(db_evidence)
        session.commit()
        session.refresh(db_evidence)

        return result

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# Health Check (Public — No Auth Required)
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    summary="Health check",
    tags=["system"],
)
async def health_check():
    """Public health check endpoint. No authentication required."""
    return {
        "status": "healthy",
        "zone": "Isolated Intelligence Zone",
        "version": "1.2.0",
    }
