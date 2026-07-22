"""
EIF: Database Integration Tests
---
Version: 1.2.0
Owner: EIF Architecture Team
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III — Test-Driven AI Integration
---
Verifies that evidence is correctly persisted to the database after extraction.
Uses mock LLM service — no API key required.
Uses the shared test engine from conftest.py.
To run: python -m pytest tests/test_db_integration.py -v
"""

from sqlmodel import Session, select

from src.db.models import Evidence
from tests.conftest import TEST_ENGINE


def test_extract_evidence_saves_to_db(client):
    """
    Verify the full extraction pipeline:
    1. POST /api/v1/extract with valid authenticated request
    2. Assert 200 OK response with correct ExtractionResult
    3. Assert the Evidence record was persisted to the shared test database
    4. Assert persisted data matches the API response

    Uses a MockLLMService — no live API call is made.
    """
    import src.main as main_module
    from src.models.schemas import ExtractionResult

    original_llm_service = main_module.llm_service

    class MockLLMService:
        """Deterministic mock — always returns VERIFIED for testability."""
        def extract_evidence(self, request):
            return ExtractionResult(
                status="VERIFIED",
                reasoning="Mock: Candidate demonstrated the required skill clearly in the provided data.",
                evidence_pointer="mock://evidence/pointer/123"
            )

    main_module.llm_service = MockLLMService()

    try:
        payload = {
            "payload": {
                "candidate_id": "cand_db_test_456",
                "source_type": "GITHUB",
                "raw_data": "import React, { useContext } from 'react'; const auth = useContext(AuthContext);",
                "consent_verified": True,
            },
            "requirement": {
                "id": "req_db_test_1",
                "description": "Must know React state management"
            }
        }

        response = client.post("/api/v1/extract", json=payload)

    finally:
        # Always restore — test isolation
        main_module.llm_service = original_llm_service

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.json()}"
    data = response.json()
    assert data["status"] == "VERIFIED"
    assert len(data["reasoning"]) > 0

    # Verify database persistence in the shared test engine
    with Session(TEST_ENGINE) as session:
        statement = select(Evidence).where(Evidence.candidate_external_id == "cand_db_test_456")
        evidence = session.exec(statement).first()

    assert evidence is not None, "Evidence was NOT saved to the database."
    assert evidence.requirement_external_id == "req_db_test_1"
    assert evidence.status == "VERIFIED"
    assert evidence.reasoning == data["reasoning"]
    assert evidence.evidence_pointer == data["evidence_pointer"]

    print("✅ TEST PASSED: Evidence correctly saved to database after extraction.")
