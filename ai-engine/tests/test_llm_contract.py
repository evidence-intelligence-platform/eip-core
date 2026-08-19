"""
EIF: LLM Provider Contract — Deterministic Tests
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance:
  - 01_ENGINEERING_CONSTITUTION.md Article III, Section 1: "Any AI extraction logic
    must have deterministic unit tests evaluating its output format."
  - 02_FOUNDATION_MANIFEST.md Section 2: providers are reached only through the
    BaseLLMService abstraction.
  - AI_AGENT_RULES.md Rule 2: never output a result without reasoning + evidence_pointer.
---
The core promise of this platform is that a claim about a candidate without
traceable evidence is a violation, not a minor formatting slip. That promise
was previously checked only by tests that need a live API key — meaning it went
unverified on every machine and every CI run that has no key.

These tests lock the provider-independent half of the contract down offline: a
scripted BaseLLMService stands in for the model and parses its canned response
through the exact same call production uses (ExtractionResult.model_validate_json),
so the schema being exercised is the real one. No network, no key, no timing.
"""

import pytest
from pydantic import ValidationError

from src.models.schemas import EvidencePayload, ExtractionResult, ExtractRequest, Requirement
from src.services.base_llm import BaseLLMService
from src.services.llm_factory import get_llm_service


@pytest.fixture
def anyio_backend():
    return 'asyncio'


class _ScriptedLLMService(BaseLLMService):
    """
    A provider that replays a canned model response instead of calling a model.

    It parses that response through ExtractionResult.model_validate_json — the
    same line GeminiLLMService runs on a live response — so a schema rule that
    would reject the real model's output rejects this one identically.
    """

    def __init__(self, raw_response: str):
        self.raw_response = raw_response
        self.received: list[ExtractRequest] = []

    async def extract_evidence(self, request: ExtractRequest) -> ExtractionResult:
        self.received.append(request)
        return ExtractionResult.model_validate_json(self.raw_response)


def _request(raw_data: str = "const auth = useContext(AuthContext);") -> ExtractRequest:
    """A minimal, consent-cleared request — the payload is irrelevant to a scripted provider."""
    return ExtractRequest(
        payload=EvidencePayload(
            candidate_id="cand_contract",
            source_type="GITHUB",
            raw_data=raw_data,
            consent_verified=True,
        ),
        requirement=Requirement(id="req_contract", description="Must know React state management"),
    )


def _response(**overrides: object) -> str:
    """Serializes a well-formed VERIFIED response with the given fields replaced."""
    import json

    body: dict[str, object] = {
        "status": "VERIFIED",
        "confidence_score": 92,
        "reasoning": "The snippet calls useContext directly, which demonstrates React state management.",
        "evidence_pointer": "raw_data:1 — const auth = useContext(AuthContext);",
    }
    body.update(overrides)
    return json.dumps(body)


# ─────────────────────────────────────────────────────────────────────────────
# The abstraction itself
# ─────────────────────────────────────────────────────────────────────────────


def test_scripted_provider_satisfies_the_llm_abstraction():
    """A stand-in provider is only a valid stand-in if it is a BaseLLMService."""
    llm = _ScriptedLLMService(_response())
    assert isinstance(llm, BaseLLMService)


def test_provider_without_extract_evidence_cannot_be_instantiated():
    """
    The abstract method is the contract's teeth: a provider that skips evidence
    extraction must fail at construction, not at the first candidate request.
    """
    class _IncompleteProvider(BaseLLMService):
        pass

    with pytest.raises(TypeError):
        _IncompleteProvider()


def test_summarize_traits_degrades_to_empty_by_default():
    """
    Providers are not required to summarize traits. The inherited no-op lets the
    caller fall back to deterministic tags instead of breaking the dashboard.
    """
    llm = _ScriptedLLMService(_response())
    assert llm.summarize_traits(["Doğrulanmış kanıt gerekçesi."]) == []


def test_standout_traits_exclude_evidence_from_a_different_employers_job(monkeypatch):
    """
    Regression test for the standout-trait cross-employer leak: traits.py used
    to fetch ALL of a candidate's VERIFIED evidence by candidate_external_id
    alone, with no filter on which job/requirement it was submitted against —
    so an employer's dashboard could have a competitor's job-specific evidence
    (a shift report, an incident description, a client name) summarized into a
    trait tag and shown on their own posting. traits.py must scope the same
    way reports.py's `_concerns_job` does: job-neutral evidence is visible
    everywhere, but evidence tied to another posting's own "req_job_<id>"
    requirement must never reach the summarizer for THIS application.
    """
    import uuid

    from sqlmodel import Session

    from src.db.models import Candidate, Evidence, JobApplication, JobPosting, Requirement
    from src.services import traits as traits_module
    from tests.conftest import TEST_ENGINE

    external_id = f"cand_traits_{uuid.uuid4().hex[:12]}"
    with Session(TEST_ENGINE) as session:
        candidate = Candidate(external_id=external_id, name="Trait Testi")
        session.add(candidate)
        session.flush()

        job_a = JobPosting(title="İşveren A İlanı", description="A ilanı için açıklama.")
        job_b = JobPosting(title="İşveren B İlanı", description="B ilanı için açıklama.")
        session.add(job_a)
        session.add(job_b)
        session.flush()
        job_a_id, job_b_id = job_a.id, job_b.id

        session.add(Requirement(external_id=f"req_job_{job_a_id}", description="A gereksinimi"))
        session.add(Requirement(external_id=f"req_job_{job_b_id}", description="B gereksinimi"))

        application_a = JobApplication(candidate_id=candidate.id, job_id=job_a_id, status="submitted")
        session.add(application_a)
        session.flush()
        application_a_id = application_a.id

        # Evidence filed against job B's own requirement — this is what must
        # never surface on employer A's dashboard.
        session.add(Evidence(
            candidate_external_id=external_id,
            requirement_external_id=f"req_job_{job_b_id}",
            source_type="PDF_RESUME",
            status="VERIFIED",
            confidence_score=95,
            reasoning="B işvereninin gizli vardiya raporunu doğrulayan özel gerekçe.",
            evidence_pointer="pdf://b-vardiya.pdf#page=1",
            review_status="approved",
        ))
        # Job-neutral evidence — describes the person, must stay visible everywhere.
        session.add(Evidence(
            candidate_external_id=external_id,
            requirement_external_id="req_general_cv",
            source_type="CERTIFICATE_LICENSE",
            status="VERIFIED",
            confidence_score=90,
            reasoning="Genel CV doğrulama gerekçesi.",
            evidence_pointer="pdf://cv.pdf#page=1",
            review_status="approved",
        ))
        session.commit()

    captured: dict[str, list[str]] = {}

    class _RecordingLLM:
        def summarize_traits(self, reasoning_texts):
            captured["reasoning_texts"] = list(reasoning_texts)
            return ["Test Etiketi"]

    # Bypasses any real network call — this test locks the scoping, not the
    # (already-covered) LLM plumbing.
    monkeypatch.setattr(traits_module, "_get_llm", lambda: _RecordingLLM())

    with Session(TEST_ENGINE) as session:
        application_a = session.get(JobApplication, application_a_id)
        traits = traits_module.standout_traits_for(session, application_a, external_id)

    assert traits == ["Test Etiketi"]
    assert "reasoning_texts" in captured, "the LLM summarizer must have been called"
    assert not any("vardiya" in text for text in captured["reasoning_texts"]), (
        "evidence submitted against another employer's job-specific requirement "
        "must never reach the trait summarizer for this application"
    )
    assert any("Genel CV" in text for text in captured["reasoning_texts"]), (
        "job-neutral evidence must still be visible"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Output schema conformance
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_verified_result_conforms_to_the_output_schema():
    """A VERIFIED verdict carries every mandatory field, within its declared bounds."""
    llm = _ScriptedLLMService(_response())
    request = _request()

    result = await llm.extract_evidence(request)

    assert llm.received == [request], "The provider must receive the typed request unchanged."
    assert isinstance(result, ExtractionResult)
    assert result.status == "VERIFIED"
    assert 0 <= result.confidence_score <= 100
    assert len(result.reasoning) >= 10
    assert result.evidence_pointer and result.evidence_pointer.strip()


@pytest.mark.anyio
async def test_status_outside_the_enum_is_rejected():
    """
    Only three verdicts exist. A model that invents "PROBABLY_VERIFIED" — or that
    reports a confident guess under any other name — is refused at the boundary.
    """
    llm = _ScriptedLLMService(_response(status="PROBABLY_VERIFIED"))

    with pytest.raises(ValidationError) as exc_info:
        await llm.extract_evidence(_request())
    assert "status" in str(exc_info.value)


@pytest.mark.anyio
async def test_missing_reasoning_is_rejected():
    """An unexplained verdict is not a verdict (AI_AGENT_RULES.md Rule 2)."""
    import json

    body = json.loads(_response())
    del body["reasoning"]
    llm = _ScriptedLLMService(json.dumps(body))

    with pytest.raises(ValidationError) as exc_info:
        await llm.extract_evidence(_request())
    assert "reasoning" in str(exc_info.value)


@pytest.mark.anyio
async def test_reasoning_below_minimum_length_is_rejected():
    """
    "OK" is not an explanation. The minimum length is the cheapest available
    guard against a model that technically fills the field and says nothing.
    """
    llm = _ScriptedLLMService(_response(reasoning="Evet."))

    with pytest.raises(ValidationError) as exc_info:
        await llm.extract_evidence(_request())
    assert "reasoning" in str(exc_info.value)


@pytest.mark.anyio
async def test_confidence_score_outside_bounds_is_rejected():
    """The score feeds the human-review threshold, so an out-of-range value is meaningless."""
    llm = _ScriptedLLMService(_response(confidence_score=140))

    with pytest.raises(ValidationError) as exc_info:
        await llm.extract_evidence(_request())
    assert "confidence_score" in str(exc_info.value)


# ─────────────────────────────────────────────────────────────────────────────
# The evidence gate — an AI claim without evidence is a violation
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
@pytest.mark.parametrize("status", ["VERIFIED", "CONTRADICTION"])
async def test_evidence_pointer_is_mandatory_for_asserted_verdicts(status):
    """
    Both verdicts make a factual claim about a candidate, so both must point at
    the evidence behind it. Null pointer → the result never leaves the provider.
    """
    llm = _ScriptedLLMService(_response(status=status, evidence_pointer=None))

    with pytest.raises(ValidationError) as exc_info:
        await llm.extract_evidence(_request())
    assert "EVIDENCE POINTER VIOLATION" in str(exc_info.value)


@pytest.mark.anyio
@pytest.mark.parametrize("blank_pointer", ["", "   ", "\n\t"])
async def test_blank_evidence_pointer_does_not_count_as_evidence(blank_pointer):
    """
    A whitespace string passes an `is not None` check while pointing at nothing;
    that is precisely how an evidence-free VERIFIED would reach the audit trail.
    """
    llm = _ScriptedLLMService(_response(evidence_pointer=blank_pointer))

    with pytest.raises(ValidationError) as exc_info:
        await llm.extract_evidence(_request())
    assert "EVIDENCE POINTER VIOLATION" in str(exc_info.value)


@pytest.mark.anyio
async def test_insufficient_evidence_may_omit_the_evidence_pointer():
    """
    The mirror image of the rule above: when there is nothing to point at, the
    honest verdict must remain expressible. Otherwise the gate would push the
    model toward inventing a pointer — the failure it exists to prevent.
    """
    llm = _ScriptedLLMService(
        _response(
            status="INSUFFICIENT EVIDENCE",
            confidence_score=12,
            reasoning="The raw data contains no observable trace of the requirement.",
            evidence_pointer=None,
        )
    )

    result = await llm.extract_evidence(_request(raw_data="print('hello world')"))

    assert result.status == "INSUFFICIENT EVIDENCE"
    assert result.evidence_pointer is None


@pytest.mark.anyio
async def test_contradiction_with_evidence_pointer_is_accepted():
    """CONTRADICTION is a legitimate verdict — the gate constrains it, never blocks it."""
    llm = _ScriptedLLMService(
        _response(
            status="CONTRADICTION",
            reasoning="The candidate claims 5 years of React while the repository history starts 3 months ago.",
            evidence_pointer="repo:first-commit 2026-05-11",
        )
    )

    result = await llm.extract_evidence(_request())

    assert result.status == "CONTRADICTION"
    assert result.evidence_pointer == "repo:first-commit 2026-05-11"


# ─────────────────────────────────────────────────────────────────────────────
# Provider selection seam
# ─────────────────────────────────────────────────────────────────────────────


def test_live_provider_implements_the_abstraction():
    """
    Checked at class level, so it holds without an API key: the shipping provider
    is bound by the same contract the scripted one is tested against.
    """
    from src.services.llm_service import GeminiLLMService

    assert issubclass(GeminiLLMService, BaseLLMService)


def test_factory_rejects_an_unknown_provider(monkeypatch):
    """A typo in LLM_PROVIDER must fail loudly at startup, not silently pick a default."""
    monkeypatch.setenv("LLM_PROVIDER", "gemeni")

    with pytest.raises(RuntimeError) as exc_info:
        get_llm_service()
    assert "gemeni" in str(exc_info.value)


@pytest.mark.parametrize("provider", ["openai", "anthropic"])
def test_factory_reports_dormant_providers_as_unavailable(provider, monkeypatch):
    """
    The dormant partner slots must announce what is missing. An obscure ImportError
    at request time would look like an outage rather than a configuration gap.
    """
    monkeypatch.setenv("LLM_PROVIDER", provider)

    with pytest.raises(RuntimeError) as exc_info:
        get_llm_service()
    assert provider in str(exc_info.value)
