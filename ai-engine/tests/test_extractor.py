from src.models.schemas import ExtractRequest, EvidencePayload, Requirement
from src.services.llm_mock import MockLLMService

def test_react_context_verification():
    llm = MockLLMService()
    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="GITHUB",
            raw_data="import React, { useContext } from 'react'; const auth = useContext(AuthContext);"
        ),
        requirement=Requirement(id="req_1", description="Must know React state management")
    )
    res = llm.extract_evidence(req)
    assert res.status == "VERIFIED"
    assert res.evidence_pointer is not None
    print("✅ TEST PASSED: React Context verified with evidence.")

def test_insufficient_evidence():
    llm = MockLLMService()
    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="GITHUB",
            raw_data="print('hello world')"
        ),
        requirement=Requirement(id="req_2", description="Must know React state management")
    )
    res = llm.extract_evidence(req)
    assert res.status == "INSUFFICIENT EVIDENCE"
    print("✅ TEST PASSED: Refused to guess on missing evidence.")

def test_no_psychoanalysis_on_leadership():
    llm = MockLLMService()
    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="CHATGPT",
            raw_data="I am a very good leader and people love me."
        ),
        requirement=Requirement(id="req_3", description="Leadership skills")
    )
    res = llm.extract_evidence(req)
    # The rule says we shouldn't psychoanalyze, we need tangible evidence like "reviewed 50 prs"
    assert res.status == "INSUFFICIENT EVIDENCE"
    print("✅ TEST PASSED: Refused to accept non-tangible psychological claims of leadership.")

if __name__ == "__main__":
    print("Running EIP Rules Extractor Tests...\n")
    test_react_context_verification()
    test_insufficient_evidence()
    test_no_psychoanalysis_on_leadership()
    print("\nAll tests passed successfully.")
