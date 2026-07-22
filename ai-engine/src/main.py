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

from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlmodel import Session
from typing import Annotated

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from src.models.schemas import ExtractRequest, ExtractionResult, EvidencePayload, Requirement as SchemaRequirement
from src.services.llm_service import GeminiLLMService
from src.services.base_llm import BaseLLMService
from src.db.database import create_db_and_tables, get_session
from src.db.models import Candidate, Requirement, Evidence
from src.routers import candidates, requirements, auth, jobs, applications
from src.security.auth import verify_api_key
from src.services.pdf_service import extract_text_from_pdf_bytes

# Initialize Rate Limiter (15 requests/minute per client IP)
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


# ─────────────────────────────────────────────────────────────────────────────
# Application Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events for the AI Engine."""
    create_db_and_tables()
    yield


from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

# OpenAPI Tags Metadata
tags_metadata = [
    {
        "name": "extraction",
        "description": "Core AI Evidence Extraction endpoints powered by Google Gemini LLM & Consent Gate.",
    },
    {
        "name": "auth",
        "description": "User registration, PBKDF2 password hashing & HS256 JWT bearer authentication.",
    },
    {
        "name": "job-postings",
        "description": "Employer job requirements & active postings management.",
    },
    {
        "name": "job-applications",
        "description": "Candidate application submission & status evaluation (accepted, declined, reviewing).",
    },
    {
        "name": "candidates",
        "description": "Candidate identity profiles & audit evidence history.",
    },
    {
        "name": "requirements",
        "description": "Evaluation criteria & requirements definitions.",
    },
]

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
    version="1.3.0",
    lifespan=lifespan,
    openapi_tags=tags_metadata,
    docs_url=None,
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from fastapi.responses import HTMLResponse

# Custom EIP Dark Theme Swagger UI Route
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    response = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} — API Documentation",
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
        swagger_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
    )
    dark_css = """
        <style>
            body { background-color: #09090b !important; color: #f4f4f5 !important; font-family: ui-sans-serif, system-ui, sans-serif !important; }
            .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
            .swagger-ui .topbar { display: none !important; }
            .swagger-ui .info { margin: 20px 0 !important; }
            .swagger-ui .scheme-container { background-color: #18181b !important; box-shadow: none !important; border-radius: 12px !important; }
        </style>
    """
    html_content = response.body.decode("utf-8").replace("</head>", f"{dark_css}</head>")
    return HTMLResponse(content=html_content)

# Custom ReDoc Route
@app.get("/redoc", include_in_schema=False)
async def custom_redoc_html():
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} — ReDoc Documentation",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js",
    )

# CORS: Restricted to localhost for development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(applications.router)
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
@limiter.limit("15/minute")
def extract_evidence(
    request: Request,
    extract_req: ExtractRequest,
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
        result = llm_service.extract_evidence(extract_req)

        # Persist the result for audit trail and future report generation
        db_evidence = Evidence(
            candidate_external_id=extract_req.payload.candidate_id,
            requirement_external_id=extract_req.requirement.id,
            source_type=extract_req.payload.source_type,
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
@limiter.limit("15/minute")
async def extract_evidence_from_file(
    request: Request,
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
