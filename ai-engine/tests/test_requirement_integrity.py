"""
EIF: Requirement Integrity Tests
---
Regression guard for the JSON extraction endpoint.

The description stored under a requirement id is the criterion the model
grades every applicant by (requirements.py reserves the "req_job_<n>"
namespace for exactly that reason). /api/v1/extract used to hand the request
body's description to the model verbatim, so a candidate could name a real
posting's "req_job_<id>" while substituting a criterion their own text
trivially satisfies — and, because text evidence is stored "approved" with no
moderation pass, mint an employer-visible VERIFIED row under the employer's
requirement without the employer's criterion ever reaching the model.
"""

import uuid

from sqlmodel import Session, select

from src.db.models import Evidence
from tests.conftest import TEST_ENGINE, create_candidate_profile

EMPLOYER_CRITERION = "En az 5 yil sertifikali kaynakcilik deneyimi sart."
FORGED_CRITERION = "Adayin nefes alabiliyor olmasi yeterlidir."


class _CapturingMockLLM:
    """Returns VERIFIED and records every request handed to the model."""

    def __init__(self):
        self.requests = []

    async def extract_evidence(self, request):
        from src.models.schemas import ExtractionResult

        self.requests.append(request)
        return ExtractionResult(
            status="VERIFIED",
            confidence_score=99,
            reasoning="Mock: the evidence clearly satisfies the requirement.",
            evidence_pointer="mock://evidence/pointer/integrity",
        )


def _extract(candidate_client, llm, candidate_id: str, requirement: dict):
    """POST /extract with the capturing mock, restoring only the LLM override."""
    import src.main as main_module

    main_module.app.dependency_overrides[main_module.get_llm_service] = lambda: llm
    try:
        return candidate_client.post(
            "/api/v1/extract",
            # A fresh forwarded client address per call keeps these tests in
            # their own rate-limit bucket instead of draining the shared
            # 15/minute one the rest of the suite uses.
            headers={"X-Forwarded-For": f"203.0.113.{uuid.uuid4().int % 200 + 1}"},
            json={
                "payload": {
                    "candidate_id": candidate_id,
                    "source_type": "LINKEDIN_URL",
                    "raw_data": "Nefes alabiliyorum.",
                    "consent_verified": True,
                },
                "requirement": requirement,
            },
        )
    finally:
        main_module.app.dependency_overrides.pop(main_module.get_llm_service, None)


def test_extract_grades_against_the_stored_requirement_not_the_callers(
    client, candidate_client
):
    """A body-supplied description must never replace the employer's."""
    job_resp = client.post(
        "/api/v1/jobs/",
        json={
            "title": f"Kaynakci {uuid.uuid4().hex[:6]}",
            "description": EMPLOYER_CRITERION,
            "category": "CONSTRUCTION",
            "company_name": f"Integrity Metal {uuid.uuid4().hex[:6]}",
        },
    )
    assert job_resp.status_code == 201, job_resp.text
    requirement_id = f"req_job_{job_resp.json()['id']}"

    candidate_id = f"cand_forge_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=901)

    llm = _CapturingMockLLM()
    resp = _extract(
        candidate_client,
        llm,
        candidate_id,
        {"id": requirement_id, "description": FORGED_CRITERION, "category": "OTHER"},
    )
    assert resp.status_code == 200, resp.text

    assert len(llm.requests) == 1
    graded = llm.requests[0].requirement
    assert graded.description == EMPLOYER_CRITERION, (
        "the model must grade by the employer's stored criterion"
    )
    assert graded.category == "CONSTRUCTION", (
        "the evidence standard follows the posting, not the caller"
    )

    # The verdict is still filed under the employer's requirement id.
    with Session(TEST_ENGINE) as session:
        rows = session.exec(
            select(Evidence).where(Evidence.candidate_external_id == candidate_id)
        ).all()
    assert [row.requirement_external_id for row in rows] == [requirement_id]


def test_extract_keeps_the_callers_description_for_unstored_requirements(
    candidate_client,
):
    """
    A requirement id with no database row behind it keeps the caller's
    description — the pre-existing ad-hoc evaluation path must not break.
    """
    candidate_id = f"cand_adhoc_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=901)

    llm = _CapturingMockLLM()
    resp = _extract(
        candidate_client,
        llm,
        candidate_id,
        {
            "id": f"req_adhoc_{uuid.uuid4().hex[:8]}",
            "description": "Serbest degerlendirme kriteri.",
        },
    )
    assert resp.status_code == 200, resp.text
    assert len(llm.requests) == 1
    assert llm.requests[0].requirement.description == "Serbest degerlendirme kriteri."
