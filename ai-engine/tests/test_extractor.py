"""
EIF: LLM Evidence Extractor — Behavioral Tests
---
Version: 1.2.0
Owner: EIF Architecture Team
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III, Section 1:
  "Any AI extraction logic must have deterministic unit tests evaluating its output format."
---
NOTE: The async tests below are INTEGRATION tests, not unit tests: they need a
  real GEMINI_API_KEY and make live API calls to check that the model obeys the
  EIF rules (no psychoanalysis, no guessing, correct schema output).

  Without a key they SKIP — loudly. conftest.py installs a placeholder key so
  the app can boot, so a test that merely returned early here would report
  PASSED without having verified anything, and the suite would claim coverage
  of the extraction contract it never exercised. Skips are visible in the CI
  summary; silent passes are not. The provider-independent half of that
  contract is locked down offline in test_llm_contract.py.

  To run against the live model: GEMINI_API_KEY=<key> python -m pytest tests/test_extractor.py -v
"""

import pytest

from src.models.schemas import EvidencePayload, ExtractRequest, Requirement

# The placeholder conftest.py sets when no real key is present. Treated as
# "no key" — GeminiLLMService constructs fine with it, then fails at call time.
_PLACEHOLDER_KEY = "test-placeholder-key-not-used-in-unit-tests"

_SKIP_REASON = (
    "GEMINI_API_KEY tanımlı değil: canlı LLM entegrasyon testi çalıştırılamıyor."
)


@pytest.fixture
def anyio_backend():
    return 'asyncio'


def _get_llm():
    """Returns a live LLM service, or skips the calling test when no key is set."""
    import os

    from src.services.llm_service import GeminiLLMService

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == _PLACEHOLDER_KEY:
        pytest.skip(_SKIP_REASON)
    try:
        return GeminiLLMService()
    except ValueError as e:
        pytest.skip(f"{_SKIP_REASON} ({e})")


@pytest.mark.anyio
async def test_react_context_verification():
    """
    RULE: If explicit, observable evidence is present → status must be VERIFIED.
    Evidence: Raw code using React useContext() hook directly.
    """
    llm = _get_llm()

    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="GITHUB",
            raw_data="import React, { useContext } from 'react'; const auth = useContext(AuthContext);",
            consent_verified=True,
        ),
        requirement=Requirement(id="req_1", description="Must know React state management")
    )
    res = await llm.extract_evidence(req)
    assert res.status == "VERIFIED", f"Expected VERIFIED, got: {res.status}"
    assert res.evidence_pointer is not None, "Evidence pointer must not be None for VERIFIED status."
    assert len(res.reasoning) >= 10, "Reasoning must not be empty."


@pytest.mark.anyio
async def test_insufficient_evidence():
    """
    RULE: If evidence is absent → status must be INSUFFICIENT EVIDENCE (no guessing).
    Evidence: A hello world print statement, completely unrelated to React.
    """
    llm = _get_llm()

    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="GITHUB",
            raw_data="print('hello world')",
            consent_verified=True,
        ),
        requirement=Requirement(id="req_2", description="Must know React state management")
    )
    res = await llm.extract_evidence(req)
    assert res.status == "INSUFFICIENT EVIDENCE", f"Expected INSUFFICIENT EVIDENCE, got: {res.status}"


@pytest.mark.anyio
async def test_no_psychoanalysis_on_leadership():
    """
    RULE: Personality self-declarations are NOT evidence. (AI_AGENT_RULES.md Rule 4)
    "Leadership" must be proven by tangible professional interactions, not self-claims.
    """
    llm = _get_llm()

    req = ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_123",
            source_type="CHATGPT",
            raw_data="I am a very good leader and people love me.",
            consent_verified=True,
        ),
        requirement=Requirement(id="req_3", description="Leadership skills")
    )
    res = await llm.extract_evidence(req)
    assert res.status == "INSUFFICIENT EVIDENCE", (
        f"Expected INSUFFICIENT EVIDENCE for a self-declaration, got: {res.status}. "
        f"Reasoning: {res.reasoning}"
    )


def test_consent_gate_rejection():
    """
    RULE: The consent gate MUST reject any extraction attempt with consent_verified=False.
    This is a Constitution-level requirement (Article II, Section 1).
    This test does NOT require a live API key — it tests the schema validator.
    """
    from pydantic import ValidationError

    with pytest.raises(ValidationError) as exc_info:
        EvidencePayload(
            candidate_id="cand_no_consent",
            source_type="GITHUB",
            raw_data="some code",
            consent_verified=False,
        )
    assert "CONSENT GATE VIOLATION" in str(exc_info.value)
