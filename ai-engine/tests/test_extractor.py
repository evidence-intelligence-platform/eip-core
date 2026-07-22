"""
EIF: LLM Evidence Extractor — Behavioral Tests
---
Version: 1.1.0
Owner: EIF Architecture Team
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III, Section 1:
  "Any AI extraction logic must have deterministic unit tests evaluating its output format."
---
Audit Fix (2026-07-22): Added consent_verified=True to all EvidencePayload instances.
  The consent gate now enforces consent at the schema level. Tests must comply.
---
NOTE: These tests require a valid GEMINI_API_KEY and make live API calls.
  They are INTEGRATION tests, not unit tests. They validate that the LLM
  follows the EIF rules (no psychoanalysis, no guessing, correct schema output).
  To run: python -m pytest tests/test_extractor.py -v
"""

from src.models.schemas import EvidencePayload, ExtractRequest, Requirement


def _get_llm():
    """Helper to initialize LLM service, skipping tests if API key not set."""
    from src.services.llm_service import GeminiLLMService
    try:
        return GeminiLLMService()
    except ValueError:
        return None


def test_react_context_verification():
    """
    RULE: If explicit, observable evidence is present → status must be VERIFIED.
    Evidence: Raw code using React useContext() hook directly.
    """
    llm = _get_llm()
    if not llm:
        print("⚠️  SKIPPED test_react_context_verification: GEMINI_API_KEY not set.")
        return

    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="GITHUB",
            raw_data="import React, { useContext } from 'react'; const auth = useContext(AuthContext);",
            consent_verified=True,  # AUDIT FIX: consent_verified required
        ),
        requirement=Requirement(id="req_1", description="Must know React state management")
    )
    res = llm.extract_evidence(req)
    assert res.status == "VERIFIED", f"Expected VERIFIED, got: {res.status}"
    assert res.evidence_pointer is not None, "Evidence pointer must not be None for VERIFIED status."
    assert len(res.reasoning) >= 10, "Reasoning must not be empty."
    print("✅ TEST PASSED: React Context verified with evidence.")


def test_insufficient_evidence():
    """
    RULE: If evidence is absent → status must be INSUFFICIENT EVIDENCE (no guessing).
    Evidence: A hello world print statement, completely unrelated to React.
    """
    llm = _get_llm()
    if not llm:
        print("⚠️  SKIPPED test_insufficient_evidence: GEMINI_API_KEY not set.")
        return

    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="GITHUB",
            raw_data="print('hello world')",
            consent_verified=True,  # AUDIT FIX: consent_verified required
        ),
        requirement=Requirement(id="req_2", description="Must know React state management")
    )
    res = llm.extract_evidence(req)
    assert res.status == "INSUFFICIENT EVIDENCE", f"Expected INSUFFICIENT EVIDENCE, got: {res.status}"
    print("✅ TEST PASSED: Refused to guess on missing evidence.")


def test_no_psychoanalysis_on_leadership():
    """
    RULE: Personality self-declarations are NOT evidence. (AI_AGENT_RULES.md Rule 4)
    "Leadership" must be proven by tangible professional interactions, not self-claims.
    """
    llm = _get_llm()
    if not llm:
        print("⚠️  SKIPPED test_no_psychoanalysis_on_leadership: GEMINI_API_KEY not set.")
        return

    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="CHATGPT",
            raw_data="I am a very good leader and people love me.",
            consent_verified=True,  # AUDIT FIX: consent_verified required
        ),
        requirement=Requirement(id="req_3", description="Leadership skills")
    )
    res = llm.extract_evidence(req)
    assert res.status == "INSUFFICIENT EVIDENCE", (
        f"Expected INSUFFICIENT EVIDENCE for a self-declaration, got: {res.status}. "
        f"Reasoning: {res.reasoning}"
    )
    print("✅ TEST PASSED: Refused to accept non-tangible psychological claims of leadership.")


def test_consent_gate_rejection():
    """
    RULE: The consent gate MUST reject any extraction attempt with consent_verified=False.
    This is a Constitution-level requirement (Article II, Section 1).
    This test does NOT require a live API key — it tests the schema validator.
    """
    from pydantic import ValidationError
    try:
        EvidencePayload(
            candidate_id="cand_no_consent",
            source_type="GITHUB",
            raw_data="some code",
            consent_verified=False,  # Should be rejected
        )
        assert False, "CONSENT GATE FAILED: EvidencePayload accepted consent_verified=False!"
    except ValidationError as e:
        assert "CONSENT GATE VIOLATION" in str(e), f"Wrong error message: {e}"
        print("✅ TEST PASSED: Consent gate correctly rejected consent_verified=False.")


if __name__ == "__main__":
    print("Running EIP Evidence Extractor Tests...\n")
    test_consent_gate_rejection()
    test_react_context_verification()
    test_insufficient_evidence()
    test_no_psychoanalysis_on_leadership()
    print("\n✅ All tests completed.")
