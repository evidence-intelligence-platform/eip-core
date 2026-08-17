"""
EIF: Explainability Report Tests
---
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III — Test-Driven AI Integration
---
GET /api/v1/reports/{application_id} is the endpoint 06_API_CONTRACTS.md
promised and the code never had. Until it existed the report was assembled in
the browser from two candidate-keyed calls, which is why the same candidate's
two applications rendered the same report and why the match percentage an
employer hired on was a number only the client could produce.

These tests lock the three things that must never regress: who may open a
report, that unreviewed evidence stays invisible to employers and outside the
score, and that a report belongs to an application rather than to a person.
"""

import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import (
    Candidate,
    Company,
    Evidence,
    ExplainabilityReport,
    JobApplication,
    JobPosting,
    Requirement,
    UserAccount,
)
from src.main import app
from tests.conftest import TEST_API_KEY, TEST_ENGINE, _token_for, get_test_session


def _client_for(email: str, role: str) -> TestClient:
    """
    Signs in as a purpose-built account.

    The account id is the database's to hand out, never this file's: the
    registration tests elsewhere in the suite consume the same id sequence, so
    a pinned id eventually lands on a real account — the token then names an
    e-mail nobody owns and every request 401s instead of exercising the rule
    under test.
    """
    with Session(TEST_ENGINE) as session:
        account = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
        if account is None:
            account = UserAccount(
                email=email,
                hashed_password="test-fixture-account-no-login",
                role=role,
            )
            session.add(account)
            session.commit()
            session.refresh(account)
        user_id = account.id

    return TestClient(app, headers={
        "X-Internal-API-Key": TEST_API_KEY,
        "Authorization": f"Bearer {_token_for(role, user_id, email)}",
    })


@pytest.fixture(scope="module")
def outsider_employer_client():
    """An employer account with no posting in any of these scenarios."""
    with _client_for("outsider-employer@reports.test.local", "employer") as c:
        yield c


@pytest.fixture(scope="module")
def outsider_candidate_client():
    """A candidate account that is not the subject of any report here."""
    with _client_for("outsider-candidate@reports.test.local", "candidate") as c:
        yield c


def _new_candidate(user_id: int = 901, name: str = "Rapor Adayı") -> str:
    external_id = f"cand_report_{uuid.uuid4().hex[:12]}"
    with Session(TEST_ENGINE) as session:
        session.add(Candidate(external_id=external_id, user_id=user_id, name=name))
        session.commit()
    return external_id


def _new_job(employer_user_id: int = 900, title: str = "Rapor Testi İlanı", company_name: str | None = None) -> int:
    """Publishes a posting the same way jobs.py does: with its own criterion."""
    with Session(TEST_ENGINE) as session:
        company_id = None
        if company_name:
            company = Company(name=company_name, industry="OTHER")
            session.add(company)
            session.flush()
            company_id = company.id
        job = JobPosting(
            title=title,
            description="Kanıta dayalı değerlendirme için ilan.",
            created_by_user_id=employer_user_id,
            company_id=company_id,
        )
        session.add(job)
        session.flush()
        job_id = job.id
        session.add(Requirement(
            external_id=f"req_job_{job_id}",
            description=f"{title} için aranan mesleki yeterlilik.",
        ))
        session.commit()
    return job_id


def _new_application(candidate_external_id: str, job_id: int, status: str = "submitted") -> int:
    with Session(TEST_ENGINE) as session:
        candidate = session.exec(
            select(Candidate).where(Candidate.external_id == candidate_external_id)
        ).first()
        application = JobApplication(candidate_id=candidate.id, job_id=job_id, status=status)
        session.add(application)
        session.flush()
        application_id = application.id
        session.commit()
    return application_id


def _add_evidence(
    candidate_external_id: str,
    requirement_external_id: str,
    status: str,
    review_status: str = "approved",
    confidence_score: int | None = 80,
) -> None:
    with Session(TEST_ENGINE) as session:
        session.add(Evidence(
            candidate_external_id=candidate_external_id,
            requirement_external_id=requirement_external_id,
            source_type="PDF_RESUME",
            status=status,
            confidence_score=confidence_score,
            reasoning=f"{requirement_external_id} için gerekçe.",
            evidence_pointer="pdf://belge.pdf#page=1",
            review_status=review_status,
        ))
        session.commit()


def _scored_application() -> tuple[str, int, int]:
    """
    One application with a deliberate mix: three approved rows (two VERIFIED)
    and one still awaiting review. 2/3 approved rows verified — 67%, and the
    pending row must not drag it to 50%.
    """
    external_id = _new_candidate()
    job_id = _new_job(title="Kanıt Puanı İlanı")
    application_id = _new_application(external_id, job_id)

    _add_evidence(external_id, f"req_job_{job_id}", "VERIFIED")
    _add_evidence(external_id, "req_general_cv", "VERIFIED")
    _add_evidence(external_id, "req_general_accomplishment", "INSUFFICIENT EVIDENCE")
    _add_evidence(external_id, "req_general_certificate", "VERIFIED", review_status="pending")

    return external_id, job_id, application_id


def test_application_owner_candidate_sees_every_row(candidate_client):
    """
    The candidate the report is about sees their pending upload — that row is
    exactly what explains why their percentage has not moved.
    """
    external_id, job_id, application_id = _scored_application()

    resp = candidate_client.get(f"/api/v1/reports/{application_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["application_id"] == application_id
    assert body["job_id"] == job_id
    assert body["candidate_external_id"] == external_id
    assert body["job_title"] == "Kanıt Puanı İlanı"
    assert body["application_status"] == "submitted"
    assert body["generated_at"]
    assert len(body["items"]) == 4, "the subject of the report sees every row"

    pending = [i for i in body["items"] if i["review_status"] == "pending"]
    assert len(pending) == 1
    assert pending[0]["counted"] is False, "an unreviewed row must not enter the score"
    assert all(i["counted"] for i in body["items"] if i["review_status"] == "approved")


def test_employer_never_sees_rows_awaiting_or_refused_review(client):
    """
    The moderation promise made at upload time: nothing reaches the employer's
    report until a human has cleared it, and a rejected document never does.
    """
    external_id = _new_candidate()
    job_id = _new_job(title="Moderasyon Görünürlüğü İlanı")
    application_id = _new_application(external_id, job_id)
    _add_evidence(external_id, f"req_job_{job_id}", "VERIFIED")
    _add_evidence(external_id, "req_general_cv", "VERIFIED", review_status="pending")
    _add_evidence(external_id, "req_general_accomplishment", "CONTRADICTION", review_status="rejected")

    resp = client.get(f"/api/v1/reports/{application_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert [i["review_status"] for i in body["items"]] == ["approved"]
    assert body["counted_count"] == 1
    assert body["verified_count"] == 1
    assert body["evidence_score"] == 100


def test_admin_sees_every_row(admin_client):
    """Moderation needs the full matrix, unreviewed rows included."""
    external_id, _, application_id = _scored_application()

    resp = admin_client.get(f"/api/v1/reports/{application_id}")
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["items"]) == 4


def test_unrelated_employer_is_refused(outsider_employer_client):
    """
    BOLA guard: application ids are sequential and the report carries a named
    person's documents, so counting upwards must not walk a competitor's
    pipeline.
    """
    _, _, application_id = _scored_application()

    resp = outsider_employer_client.get(f"/api/v1/reports/{application_id}")
    assert resp.status_code == 403, resp.text


def test_unrelated_candidate_is_refused(outsider_candidate_client):
    """A signed-in candidate may read their own report, and nobody else's."""
    _, _, application_id = _scored_application()

    resp = outsider_candidate_client.get(f"/api/v1/reports/{application_id}")
    assert resp.status_code == 403, resp.text


def test_unknown_application_is_not_found(candidate_client):
    resp = candidate_client.get("/api/v1/reports/98765432")
    assert resp.status_code == 404, resp.text


def test_report_requires_a_signed_in_user(keyed_client):
    """
    The frontend proxy attaches the internal key to every request, so the key
    alone is a browser that never signed in.
    """
    _, _, application_id = _scored_application()

    resp = keyed_client.get(f"/api/v1/reports/{application_id}")
    assert resp.status_code == 401, resp.text


def test_score_is_computed_on_the_server_and_ignores_unreviewed_rows(candidate_client, client):
    """
    Two verified rows out of three approved ones: 67, not 50 (which counting
    the pending row would give) and not 75. Employer and candidate must be
    quoted the same number over the same denominator — a report whose score
    depended on who opened it would be worthless as an audit record.
    """
    _, _, application_id = _scored_application()

    candidate_body = candidate_client.get(f"/api/v1/reports/{application_id}").json()
    assert candidate_body["counted_count"] == 3
    assert candidate_body["verified_count"] == 2
    assert candidate_body["evidence_score"] == 67

    employer_body = client.get(f"/api/v1/reports/{application_id}").json()
    assert employer_body["evidence_score"] == candidate_body["evidence_score"]
    assert employer_body["counted_count"] == candidate_body["counted_count"]


def test_score_is_zero_when_nothing_has_been_approved_yet(candidate_client):
    """An empty denominator reports 0, never a crash and never a free 100."""
    external_id = _new_candidate()
    job_id = _new_job(title="Onay Bekleyen İlan")
    application_id = _new_application(external_id, job_id)
    _add_evidence(external_id, f"req_job_{job_id}", "VERIFIED", review_status="pending")

    body = candidate_client.get(f"/api/v1/reports/{application_id}").json()
    assert body["counted_count"] == 0
    assert body["verified_count"] == 0
    assert body["evidence_score"] == 0


def test_two_applications_of_one_candidate_get_different_reports(candidate_client):
    """
    The defect this endpoint exists to end: the report used to be keyed by
    candidate, so applying to two postings produced one report shown twice —
    the same score handed to two employers about two different jobs. Evidence
    filed against another posting's criterion must not appear here either; it
    was submitted to a different employer.
    """
    external_id = _new_candidate()
    first_job = _new_job(title="Birinci İlan")
    second_job = _new_job(title="İkinci İlan")
    first_application = _new_application(external_id, first_job)
    second_application = _new_application(external_id, second_job)

    _add_evidence(external_id, "req_general_cv", "VERIFIED")
    _add_evidence(external_id, f"req_job_{first_job}", "VERIFIED")
    _add_evidence(external_id, f"req_job_{second_job}", "INSUFFICIENT EVIDENCE")

    first = candidate_client.get(f"/api/v1/reports/{first_application}").json()
    second = candidate_client.get(f"/api/v1/reports/{second_application}").json()

    assert first["application_id"] != second["application_id"]
    assert first["job_id"] == first_job and second["job_id"] == second_job
    assert first["job_title"] == "Birinci İlan" and second["job_title"] == "İkinci İlan"
    assert first["evidence_score"] == 100
    assert second["evidence_score"] == 50

    first_requirements = {i["requirement_external_id"] for i in first["items"]}
    second_requirements = {i["requirement_external_id"] for i in second["items"]}
    assert f"req_job_{second_job}" not in first_requirements, (
        "another posting's criterion must never leak into this report"
    )
    assert f"req_job_{first_job}" not in second_requirements
    assert "req_general_cv" in first_requirements and "req_general_cv" in second_requirements


def test_report_row_is_persisted_once_per_application(candidate_client):
    """
    The ExplainabilityReport table was declared and then left dead — only the
    seed script ever wrote to it. Every generation must record what was shown,
    and refreshing the page must update that record rather than pile up rows.
    """
    external_id, job_id, application_id = _scored_application()

    assert candidate_client.get(f"/api/v1/reports/{application_id}").status_code == 200
    assert candidate_client.get(f"/api/v1/reports/{application_id}").status_code == 200

    with Session(TEST_ENGINE) as session:
        rows = session.exec(
            select(ExplainabilityReport).where(
                ExplainabilityReport.application_id == application_id
            )
        ).all()

    assert len(rows) == 1, "a second read must update the record, not duplicate it"
    row = rows[0]
    assert row.candidate_external_id == external_id
    assert "%67" in row.final_summary

    matrix = json.loads(row.match_matrix)
    assert matrix["application_id"] == application_id
    assert matrix["job_id"] == job_id
    assert matrix["evidence_score"] == 67
    assert len(matrix["items"]) == 4, "the stored matrix is the full record, not a filtered view"


def test_employer_read_does_not_overwrite_the_record_with_its_filtered_view(client, candidate_client):
    """
    The audit record is the complete matrix. If an employer's request stored
    only the rows they may see, the moderation history of a report would be
    rewritten by whoever happened to open it last.
    """
    _, _, application_id = _scored_application()

    assert candidate_client.get(f"/api/v1/reports/{application_id}").status_code == 200
    assert client.get(f"/api/v1/reports/{application_id}").status_code == 200

    with Session(TEST_ENGINE) as session:
        row = session.exec(
            select(ExplainabilityReport).where(
                ExplainabilityReport.application_id == application_id
            )
        ).one()

    assert len(json.loads(row.match_matrix)["items"]) == 4


def test_report_carries_the_posting_company(candidate_client):
    """The report names the employer the candidate applied to."""
    external_id = _new_candidate()
    job_id = _new_job(title="Şirketli İlan", company_name=f"Test Şirketi {uuid.uuid4().hex[:6]}")
    application_id = _new_application(external_id, job_id)

    body = candidate_client.get(f"/api/v1/reports/{application_id}").json()
    assert body["company_name"].startswith("Test Şirketi")


# ─────────────────────────────────────────────────────────────────────────────
# Health probe
# ─────────────────────────────────────────────────────────────────────────────


class _UnreachableDatabaseSession:
    """
    Stands in for a session whose database cannot be reached. SQLAlchemy does
    not connect when the Session is opened — it connects on the first
    statement — so a real outage surfaces exactly here, at the probe query.
    """

    def execute(self, *args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))


def _unreachable_session():
    yield _UnreachableDatabaseSession()


def test_health_reports_ready_and_keeps_its_original_body(unauthenticated_client):
    """The three original fields are what monitoring may already match on."""
    resp = unauthenticated_client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert body["zone"] == "Isolated Intelligence Zone"
    assert body["version"] == "1.2.0"
    assert body["database"] == "up"


def test_health_reports_503_when_the_database_is_unreachable(unauthenticated_client):
    """
    A deploy that cannot reach its database used to answer "healthy" from
    process memory and was handed live traffic it could only fail. The probe
    must fail with it — and must not echo the driver's message, which carries
    the connection string, on a public endpoint.
    """
    app.dependency_overrides[get_session] = _unreachable_session
    try:
        resp = unauthenticated_client.get("/health")
    finally:
        app.dependency_overrides[get_session] = get_test_session

    assert resp.status_code == 503, resp.text
    body = resp.json()
    assert body["status"] == "unhealthy"
    assert body["database"] == "down"
    assert body["zone"] == "Isolated Intelligence Zone"
    assert "connection refused" not in resp.text

    assert unauthenticated_client.get("/health").status_code == 200, (
        "the probe must recover once the database answers again"
    )
