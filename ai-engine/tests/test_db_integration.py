from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from src.main import app
from src.db.database import get_session
from src.db.models import Evidence

import os
sqlite_url = "sqlite:///test.db" # File-based test database
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

# Create tables for the in-memory DB
SQLModel.metadata.create_all(engine)

def get_session_override():
    with Session(engine) as session:
        yield session

app.dependency_overrides[get_session] = get_session_override

client = TestClient(app)

def test_extract_evidence_saves_to_db():
    # Mock LLM service
    from src.models.schemas import ExtractionResult
    app.dependency_overrides.clear()
    app.dependency_overrides[get_session] = get_session_override
    
    # We can mock the llm_service directly on the app module
    import src.main
    original_llm_service = src.main.llm_service
    
    class MockLLMService:
        def extract_evidence(self, request):
            return ExtractionResult(
                status="VERIFIED",
                reasoning="Test reasoning from mock",
                evidence_pointer="Test pointer"
            )
            
    src.main.llm_service = MockLLMService()
    
    try:
        payload = {
            "payload": {
                "candidate_id": "cand_test_123",
                "source_type": "GITHUB",
                "raw_data": "import React, { useContext } from 'react'; const auth = useContext(AuthContext);"
            },
            "requirement": {
                "id": "req_test_1",
                "description": "Must know React state management"
            }
        }
        
        response = client.post("/api/v1/extract", json=payload)
    finally:
        src.main.llm_service = original_llm_service
    if response.status_code != 200:
        print("ERROR:", response.json())
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "VERIFIED"
    
    # Check if it was saved to DB
    with Session(engine) as session:
        from sqlmodel import select
        statement = select(Evidence).where(Evidence.candidate_external_id == "cand_test_123")
        evidence = session.exec(statement).first()
        assert evidence is not None
    assert evidence.requirement_external_id == "req_test_1"
    assert evidence.status == "VERIFIED"
    assert evidence.reasoning == data["reasoning"]

    # Cleanup
    if os.path.exists("test.db"):
        try:
            os.remove("test.db")
        except Exception:
            pass
