from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from src.models.schemas import ExtractRequest, ExtractionResult
from src.services.llm_mock import MockLLMService

app = FastAPI(
    title="EIP Evidence Extractor API",
    description="Strictly typed Isolated Intelligence Zone API for extracting evidence.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm_service = MockLLMService()

@app.post("/api/v1/extract", response_model=ExtractionResult)
async def extract_evidence(request: ExtractRequest):
    """
    Takes a candidate's raw evidence payload and a requirement,
    and returns a strictly formatted ExtractionResult.
    """
    try:
        result = llm_service.extract_evidence(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "zone": "Isolated Intelligence Zone"}
