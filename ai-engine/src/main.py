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

from contextlib import asynccontextmanager

from pydantic import ValidationError
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlmodel import Session

from src.db.database import create_db_and_tables, get_session
from src.db.models import Evidence, JobPosting, Requirement
from src.models.schemas import EvidencePayload, ExtractionResult, ExtractRequest
from src.models.schemas import Requirement as SchemaRequirement
from src.routers import applications, auth, candidates, jobs, requirements
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_user
from src.services.base_llm import BaseLLMService
from src.services.llm_service import GeminiLLMService
from src.services.file_policy import MAX_UPLOAD_BYTES, read_upload_limited, sniff_kind
from src.services.pdf_service import extract_text_from_pdf_bytes, extract_text_or_flag_scanned

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
def get_llm_service() -> BaseLLMService:
    """Dependency injection for the LLM Service."""
    return GeminiLLMService()


def _category_for_requirement(requirement_id: str, session: Session) -> str | None:
    """
    Resolves the profession category behind a requirement.

    Requirements created for a posting are keyed "req_job_<job id>", so the
    posting's category can be recovered and handed to the model. Without it
    every applicant — chef, nurse, driver — was judged by the same yardstick.
    """
    if not requirement_id.startswith("req_job_"):
        return None
    try:
        job_id = int(requirement_id.removeprefix("req_job_"))
    except ValueError:
        return None

    from sqlmodel import select

    job = session.exec(select(JobPosting).where(JobPosting.id == job_id)).first()
    return job.category if job else None


# ─────────────────────────────────────────────────────────────────────────────
# Extraction Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post(
    "/api/v1/extract",
    response_model=ExtractionResult,
    dependencies=[Depends(verify_api_key), Depends(require_user)],
    summary="Extract evidence from a raw data payload",
    tags=["extraction"],
)
@limiter.limit("15/minute")
async def extract_evidence(
    request: Request,
    extract_req: ExtractRequest,
    session: Session = Depends(get_session),
    llm_service: BaseLLMService = Depends(get_llm_service),
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
        if extract_req.payload.source_type == "CHATGPT_EXPORT":
            import json
            try:
                json.loads(extract_req.payload.raw_data)
            except json.JSONDecodeError:
                raise ValueError("CHATGPT_EXPORT source_type requires valid JSON raw_data")

        result = await llm_service.extract_evidence(extract_req)

        # Persist the result for audit trail and future report generation
        db_evidence = Evidence(
            candidate_external_id=extract_req.payload.candidate_id,
            requirement_external_id=extract_req.requirement.id,
            source_type=extract_req.payload.source_type,
            status=result.status,
            confidence_score=result.confidence_score,
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
    dependencies=[Depends(verify_api_key), Depends(require_user)],
    summary="Extract evidence from an uploaded document (PDF, image or text)",
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
    file: UploadFile = File(..., description="PDF, image (JPG/PNG/WebP) or plain text document."),
    session: Session = Depends(get_session),
    llm_service: BaseLLMService = Depends(get_llm_service),
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
        # Fall back to a profession-neutral description, and do NOT persist it:
        # writing "Technical requirement verification" into the database meant a
        # chef applying for a kitchen role was permanently evaluated against a
        # technical yardstick.
        requirement_description = (
            req_db.description
            if req_db
            else "İlanda belirtilen mesleki yeterliliğin belgeyle doğrulanması."
        )
        requirement_category = _category_for_requirement(requirement_id, session)

        # Read with a size limit and identify the file by its contents rather
        # than by a filename the caller controls.
        content_bytes = await read_upload_limited(file, MAX_UPLOAD_BYTES)
        kind, mime = sniff_kind(content_bytes, file.filename)

        media: list[MediaAttachment] = []
        resolved_source = source_type

        if kind == "image":
            # A photographed certificate has no text layer; the model has to see it.
            raw_text = f"Yüklenen belge görseli: {file.filename or 'belge'}"
            media.append(
                MediaAttachment(mime_type=mime, data=content_bytes, filename=file.filename)
            )
            resolved_source = "IMAGE_DOCUMENT"
        elif kind == "pdf":
            raw_text, is_scanned = extract_text_or_flag_scanned(content_bytes)
            if is_scanned:
                # Scanned PDF: hand the file itself over instead of empty text.
                raw_text = f"Taranmış belge: {file.filename or 'belge.pdf'}"
                media.append(
                    MediaAttachment(
                        mime_type="application/pdf",
                        data=content_bytes,
                        filename=file.filename,
                    )
                )
                resolved_source = "SCANNED_PDF"
        else:
            raw_text = content_bytes.decode("utf-8", errors="replace")

        # Build the typed request — schema validation enforces consent gate
        extract_req = ExtractRequest(
            payload=EvidencePayload(
                candidate_id=candidate_id,
                source_type=resolved_source,  # type: ignore[arg-type]
                raw_data=raw_text,
                media=media,
                consent_verified=consent_verified,
            ),
            requirement=SchemaRequirement(
                id=requirement_id,
                description=requirement_description,
                category=requirement_category,
            ),
        )

        if extract_req.payload.source_type == "CHATGPT_EXPORT":
            import json
            try:
                json.loads(extract_req.payload.raw_data)
            except json.JSONDecodeError:
                raise ValueError("CHATGPT_EXPORT source_type requires valid JSON raw_data")

        if extract_req.requirement.category is None:
            extract_req.requirement.category = _category_for_requirement(
                extract_req.requirement.id, session
            )

        result = await llm_service.extract_evidence(extract_req)

        db_evidence = Evidence(
            candidate_external_id=extract_req.payload.candidate_id,
            requirement_external_id=extract_req.requirement.id,
            source_type=extract_req.payload.source_type,
            status=result.status,
            confidence_score=result.confidence_score,
            reasoning=result.reasoning,
            evidence_pointer=result.evidence_pointer,
        )
        session.add(db_evidence)
        session.commit()
        session.refresh(db_evidence)

        return result

    except HTTPException:
        raise
    except ValidationError as e:
        # Pydantic's ValidationError does NOT inherit from ValueError, so the
        # branch below never caught it: a submission without consent — the one
        # case the gate exists for — surfaced as a 500 instead of a rejection.
        # Only the messages are forwarded; e.errors() carries the original
        # exception objects, which are not JSON-serializable.
        raise HTTPException(
            status_code=422,
            detail=[{"msg": err["msg"], "loc": list(err["loc"])} for err in e.errors()],
        )
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
