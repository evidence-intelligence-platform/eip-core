from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlmodel import Session
from src.models.schemas import ExtractRequest, ExtractionResult
from src.services.llm_service import GeminiLLMService
from src.db.database import create_db_and_tables, get_session
from src.db.models import Candidate, Requirement, Evidence  # Import them so SQLModel registers them
from src.routers import candidates, requirements

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(
    title="EIP Evidence Extractor API",
    description="Strictly typed Isolated Intelligence Zone API for extracting evidence.",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(candidates.router)
app.include_router(requirements.router)

# Servis başlatılırken sistem ortamından API KEY aranacak
llm_service = GeminiLLMService()

@app.post("/api/v1/extract", response_model=ExtractionResult)
def extract_evidence(request: ExtractRequest, session: Session = Depends(get_session)):
    """
    Takes a candidate's raw evidence payload and a requirement,
    returns a strictly formatted ExtractionResult,
    and SAVES the evidence to the database.
    """
    try:
        # Call the LLM service to extract evidence
        result = llm_service.extract_evidence(request)
        
        # Save to Database
        db_evidence = Evidence(
            candidate_external_id=request.payload.candidate_id,
            requirement_external_id=request.requirement.id,
            source_type=request.payload.source_type,
            status=result.status,
            reasoning=result.reasoning,
            evidence_pointer=result.evidence_pointer
        )
        session.add(db_evidence)
        session.commit()
        session.refresh(db_evidence)
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

from fastapi import File, UploadFile, Form
from src.services.pdf_service import extract_text_from_pdf_bytes

@app.post("/api/v1/extract/file", response_model=ExtractionResult)
async def extract_evidence_from_file(
    candidate_id: str = Form(...),
    requirement_id: str = Form(...),
    source_type: str = Form("PDF_RESUME"),
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    """
    Takes a file (PDF/TXT), candidate ID, and requirement ID.
    Parses the file, calls LLM, and SAVES the evidence to the database.
    """
    try:
        # Fetch the requirement from DB to get its description
        # We need the requirement object to pass to ExtractRequest
        from sqlmodel import select
        req_db = session.exec(select(Requirement).where(Requirement.external_id == requirement_id)).first()
        if not req_db:
            raise HTTPException(status_code=404, detail=f"Requirement {requirement_id} not found in DB")
        
        # Read file contents
        content_bytes = await file.read()
        
        # Parse text based on file type
        if file.filename.lower().endswith(".pdf") or file.content_type == "application/pdf":
            raw_text = extract_text_from_pdf_bytes(content_bytes)
        else:
            # Assume text
            raw_text = content_bytes.decode("utf-8", errors="ignore")
            
        # Build ExtractRequest
        from src.models.schemas import EvidencePayload, Requirement as SchemaRequirement
        request = ExtractRequest(
            payload=EvidencePayload(
                candidate_id=candidate_id,
                source_type=source_type, # type: ignore
                raw_data=raw_text
            ),
            requirement=SchemaRequirement(
                id=req_db.external_id,
                description=req_db.description
            )
        )
        
        # Call LLM and save
        result = llm_service.extract_evidence(request)
        
        db_evidence = Evidence(
            candidate_external_id=request.payload.candidate_id,
            requirement_external_id=request.requirement.id,
            source_type=request.payload.source_type,
            status=result.status,
            reasoning=result.reasoning,
            evidence_pointer=result.evidence_pointer
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

@app.get("/health")
async def health_check():
    return {"status": "healthy", "zone": "Isolated Intelligence Zone"}
