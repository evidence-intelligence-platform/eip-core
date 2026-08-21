"""
EIF: Privacy & Compliance Tests (Consent Log, Audit Trail, KVKK Deletion)
---
Covers the three legally-relevant gaps found by the launch audit:

1. ConsentLog rows are written on every successful extraction (same
   transaction as the Evidence insert) and never without consent.
2. AuditTrail rows are written for moderation verdicts, account deletion and
   admin promotion.
3. DELETE /api/v1/auth/me erases the account and all owned data — including
   media blobs on disk — while deliberately KEEPING ConsentLog rows and
   recording only an anonymized identifier in the audit trail.
"""

import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta

from sqlmodel import Session, select

from src.db.models import (
    AuditTrail,
    Candidate,
    ConsentLog,
    Evidence,
    ExplainabilityReport,
    JobApplication,
    JobPosting,
    PasswordResetToken,
    Requirement,
    UserAccount,
)
from tests.conftest import TEST_ENGINE, _token_for, create_candidate_profile
from tests.test_moderation import MINIMAL_PNG

# The candidate_client fixture's account.
CANDIDATE_USER_ID = 901

# ── Helpers ──────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(keyed_client, role: str) -> tuple[str, str, str]:
    """Registers a fresh user via the public endpoint; returns (email, password, token)."""
    email = f"{role}_{uuid.uuid4().hex[:8]}@kvkk.eip.dev"
    password = "cok-gizli-parola-123"
    body = {"email": email, "password": password, "role": role, "full_name": "KVKK Testi"}
    if role == "employer":
        # Employers now must attach a company profile at sign-up.
        body |= {
            "company_name": "KVKK Test Şirketi",
            "tax_number": "1234567890",
            "company_size": "1-5",
        }
    resp = keyed_client.post("/api/v1/auth/register", json=body)
    assert resp.status_code == 201, resp.text
    return email, password, resp.json()["access_token"]


def _mock_llm(main_module):
    from src.models.schemas import ExtractionResult

    class MockLLMService:
        async def extract_evidence(self, request):
            return ExtractionResult(
                status="VERIFIED",
                confidence_score=96,
                reasoning="Mock: the document clearly demonstrates the requirement.",
                evidence_pointer="mock://evidence/pointer/privacy",
            )

    main_module.app.dependency_overrides[main_module.get_llm_service] = lambda: MockLLMService()


def _extract_json(client, candidate_id: str, consent: bool, headers=None):
    """POST /extract with a mocked LLM, restoring only the LLM override."""
    import src.main as main_module

    _mock_llm(main_module)
    try:
        return client.post(
            "/api/v1/extract",
            headers=headers,
            json={
                "payload": {
                    "candidate_id": candidate_id,
                    "source_type": "GITHUB",
                    "raw_data": "import React from 'react';",
                    "consent_verified": consent,
                },
                "requirement": {"id": "req_privacy_1", "description": "React bilgisi"},
            },
        )
    finally:
        main_module.app.dependency_overrides.pop(main_module.get_llm_service, None)


def _extract_file(client, candidate_id: str, consent: str, filename="cv.txt",
                  data=b"5 yil yogun bakim hemsiresi olarak calistim.",
                  content_type="text/plain", headers=None):
    """POST /extract/file with a mocked LLM, restoring only the LLM override."""
    import src.main as main_module

    _mock_llm(main_module)
    try:
        return client.post(
            "/api/v1/extract/file",
            data={
                "candidate_id": candidate_id,
                "requirement_id": "req_privacy_file_1",
                "consent_verified": consent,
            },
            files={"file": (filename, data, content_type)},
            headers=headers,
        )
    finally:
        main_module.app.dependency_overrides.pop(main_module.get_llm_service, None)


@contextmanager
def _foreign_keys_enforced():
    """
    Runs the app's requests on a SQLite connection with foreign keys ON.

    The test database has them off by default (SQLite's default), so a row
    left pointing at a deleted parent passes unnoticed — on PostgreSQL, the
    documented production target, the same DELETE raises IntegrityError.
    """
    import src.main as main_module
    from src.db.database import get_session
    from tests.conftest import get_test_session

    def fk_session():
        with Session(TEST_ENGINE) as session:
            session.connection().exec_driver_sql("PRAGMA foreign_keys=ON")
            try:
                yield session
            finally:
                # The connection goes back to the pool shared with every other
                # test; it must not carry the pragma with it.
                session.connection().exec_driver_sql("PRAGMA foreign_keys=OFF")

    main_module.app.dependency_overrides[get_session] = fk_session
    try:
        yield
    finally:
        main_module.app.dependency_overrides[get_session] = get_test_session


def _consent_rows(candidate_id: str) -> list[ConsentLog]:
    with Session(TEST_ENGINE) as session:
        return session.exec(
            select(ConsentLog).where(ConsentLog.candidate_external_id == candidate_id)
        ).all()


def _insert_evidence(**overrides) -> int:
    """Creates an Evidence row directly, bypassing the endpoint."""
    fields = dict(
        candidate_external_id=f"cand_priv_{uuid.uuid4().hex[:8]}",
        requirement_external_id="req_priv_seed",
        source_type="IMAGE_DOCUMENT",
        status="VERIFIED",
        confidence_score=90,
        reasoning="Seeded row for privacy compliance tests.",
        review_status="pending",
    )
    fields.update(overrides)
    with Session(TEST_ENGINE) as session:
        evidence = Evidence(**fields)
        session.add(evidence)
        session.commit()
        session.refresh(evidence)
        return evidence.id


# ── 1. Consent log writes ────────────────────────────────────────────────────


def test_extract_with_consent_writes_consent_log(candidate_client):
    candidate_id = f"cand_consent_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)

    resp = _extract_json(candidate_client, candidate_id, consent=True)
    assert resp.status_code == 200, resp.text

    rows = _consent_rows(candidate_id)
    assert len(rows) == 1, "exactly one consent row per successful extraction"
    assert rows[0].consent_granted is True
    assert rows[0].consent_timestamp is not None
    assert rows[0].ip_address is not None


def test_consent_log_records_the_callers_address_not_the_proxys(candidate_client):
    """
    Every request reaches the engine through the Next.js server-side proxy, so
    the socket address is that proxy's — identical for every candidate, which
    made the column that is supposed to substantiate WHO consented useless.
    The proxy passes X-Forwarded-For on verbatim, and a conforming ingress
    APPENDS the address it actually saw the client connect from — so the
    right-most entry is the client; anything left of it is caller-chosen.
    """
    candidate_id = f"cand_ip_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)

    resp = _extract_json(
        candidate_client, candidate_id, consent=True,
        headers={"X-Forwarded-For": "203.0.113.7"},
    )
    assert resp.status_code == 200, resp.text

    rows = _consent_rows(candidate_id)
    assert len(rows) == 1
    assert rows[0].ip_address == "203.0.113.7"


def test_consent_log_ignores_the_forgeable_forwarded_entries(candidate_client):
    """
    The left-most X-Forwarded-For entries are supplied by the caller's own
    browser and survive the proxy chain untouched; a conforming ingress only
    APPENDS the address it saw. Recording anything but the right-most entry
    would let a candidate write an arbitrary address — even an uninvolved
    third party's — into the permanent KVKK consent record, then repudiate
    their own consent by pointing at it.
    """
    candidate_id = f"cand_spoof_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)

    resp = _extract_json(
        candidate_client, candidate_id, consent=True,
        # "8.8.8.8" is what the attacker sent; "203.0.113.7" is what the
        # ingress appended after actually seeing the connection.
        headers={"X-Forwarded-For": "8.8.8.8, 203.0.113.7"},
    )
    assert resp.status_code == 200, resp.text

    rows = _consent_rows(candidate_id)
    assert len(rows) == 1
    assert rows[0].ip_address == "203.0.113.7", (
        "the right-most forwarded entry is ingress-written; the left-most is forgeable"
    )


def test_extract_without_consent_writes_no_consent_log(candidate_client):
    candidate_id = f"cand_noconsent_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)

    resp = _extract_json(candidate_client, candidate_id, consent=False)
    assert resp.status_code == 422, "the consent gate must reject the request"

    assert _consent_rows(candidate_id) == [], "a refused extraction must not log consent"
    with Session(TEST_ENGINE) as session:
        evidences = session.exec(
            select(Evidence).where(Evidence.candidate_external_id == candidate_id)
        ).all()
    assert evidences == [], "a refused extraction must not persist evidence"


def test_file_extract_with_consent_writes_consent_log(candidate_client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    candidate_id = f"cand_fconsent_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)

    resp = _extract_file(candidate_client, candidate_id, consent="true")
    assert resp.status_code == 200, resp.text

    rows = _consent_rows(candidate_id)
    assert len(rows) == 1
    assert rows[0].consent_granted is True


def test_file_extract_without_consent_writes_no_consent_log(candidate_client, tmp_path, monkeypatch):
    """Consent is checked ahead of everything else, ownership included."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    candidate_id = f"cand_fnoconsent_{uuid.uuid4().hex[:8]}"

    resp = _extract_file(candidate_client, candidate_id, consent="false")
    assert resp.status_code == 422, resp.text

    assert _consent_rows(candidate_id) == []


# ── 1b. Extraction is bound to the caller's own identity ─────────────────────


def test_extract_refuses_someone_elses_candidate_id(candidate_client):
    """
    Registration is public and external ids are predictable, so without an
    ownership check any signed-in caller could file evidence — text evidence
    is stored "approved" and reaches the employer's report directly — under a
    rival's identity, and leave a ConsentLog row asserting that person
    authorized it. The consent log survives KVKK erasure as legal proof, so a
    forged row is unimpeachable: it has no actor column.
    """
    victim_id = f"cand_victim_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(victim_id, user_id=77777)  # somebody else's profile

    resp = _extract_json(candidate_client, victim_id, consent=True)
    assert resp.status_code == 403, resp.text

    assert _consent_rows(victim_id) == [], "a refused extraction must not log consent"
    with Session(TEST_ENGINE) as session:
        assert session.exec(
            select(Evidence).where(Evidence.candidate_external_id == victim_id)
        ).all() == []


def test_file_extract_refuses_someone_elses_candidate_id(
    candidate_client, tmp_path, monkeypatch
):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    victim_id = f"cand_fvictim_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(victim_id, user_id=77777)

    resp = _extract_file(candidate_client, victim_id, consent="true")
    assert resp.status_code == 403, resp.text

    assert _consent_rows(victim_id) == []
    with Session(TEST_ENGINE) as session:
        assert session.exec(
            select(Evidence).where(Evidence.candidate_external_id == victim_id)
        ).all() == []


def test_extract_refuses_unclaimed_candidate_id(candidate_client):
    """
    An id with no profile behind it is refused too: evidence parked under one
    is exactly what a later, self-made profile for that id would inherit.
    """
    orphan_id = f"cand_orphan_{uuid.uuid4().hex[:8]}"

    resp = _extract_json(candidate_client, orphan_id, consent=True)
    assert resp.status_code == 403, resp.text
    assert _consent_rows(orphan_id) == []


# ── 2. Audit trail writes ────────────────────────────────────────────────────


def test_moderation_approval_writes_audit_row(admin_client):
    evidence_id = _insert_evidence()

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "approved", "note": "Belge okunakli."},
    )
    assert resp.status_code == 200, resp.text

    with Session(TEST_ENGINE) as session:
        rows = session.exec(
            select(AuditTrail).where(AuditTrail.target_entity == f"evidence:{evidence_id}")
        ).all()
    assert len(rows) == 1, "exactly one audit row per decision"
    row = rows[0]
    assert row.actor_id == "admin@test.local", "actor must be the JWT sub"
    assert row.action == "moderation.review.approved"
    assert row.details == "Belge okunakli."
    assert row.created_at is not None


def test_moderation_rejection_writes_audit_row(admin_client):
    evidence_id = _insert_evidence()

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "rejected"},
    )
    assert resp.status_code == 200, resp.text

    with Session(TEST_ENGINE) as session:
        rows = session.exec(
            select(AuditTrail).where(AuditTrail.target_entity == f"evidence:{evidence_id}")
        ).all()
    assert len(rows) == 1
    assert rows[0].action == "moderation.review.rejected"


def test_promote_admin_writes_audit_row(keyed_client):
    email, _password, _token = _register(keyed_client, "candidate")

    from scripts.promote_admin import promote

    promote(email)

    with Session(TEST_ENGINE) as session:
        user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
        assert user is not None and user.role == "admin"
        rows = session.exec(
            select(AuditTrail).where(
                AuditTrail.target_entity == f"useraccount:{user.id}",
                AuditTrail.action == "user.promote_admin",
            )
        ).all()
    assert len(rows) == 1
    assert rows[0].actor_id == "cli:promote_admin"
    assert "candidate -> admin" in (rows[0].details or "")


# ── 3. KVKK account deletion ─────────────────────────────────────────────────


def test_candidate_deletion_erases_all_owned_data(keyed_client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    email, _password, token = _register(keyed_client, "candidate")
    me = keyed_client.get("/api/v1/auth/me", headers=_auth(token)).json()
    ext_id = me["candidate_external_id"]
    user_id = me["id"]
    assert ext_id, "registering a candidate must create a profile"

    # Upload an image evidence: stored on disk, review_status pending.
    resp = _extract_file(
        keyed_client, ext_id, consent="true",
        filename="sertifika.png", data=MINIMAL_PNG, content_type="image/png",
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text

    with Session(TEST_ENGINE) as session:
        candidate = session.exec(
            select(Candidate).where(Candidate.external_id == ext_id)
        ).first()
        evidence = session.exec(
            select(Evidence).where(Evidence.candidate_external_id == ext_id)
        ).first()
        assert candidate is not None and evidence is not None
        stored_file = tmp_path / evidence.media_path
        assert stored_file.is_file()

        # A second evidence row whose blob is already gone from disk —
        # deletion must tolerate it, not abort.
        session.add(Evidence(
            candidate_external_id=ext_id,
            requirement_external_id="req_privacy_file_1",
            source_type="IMAGE_DOCUMENT",
            status="VERIFIED",
            reasoning="Seed: blob missing on disk.",
            review_status="pending",
            media_path=f"missing_{uuid.uuid4().hex}.png",
            media_mime="image/png",
        ))
        # An application and an explainability report owned by the candidate.
        job = JobPosting(title="Yogun Bakim Hemsiresi", description="Diploma sart.", category="HEALTH")
        session.add(job)
        session.commit()
        session.refresh(job)
        job_id = job.id
        session.add(JobApplication(candidate_id=candidate.id, job_id=job_id))
        session.add(ExplainabilityReport(
            candidate_external_id=ext_id, match_matrix="{}", final_summary="Ozet.",
        ))
        session.commit()

    resp = keyed_client.delete("/api/v1/auth/me", headers=_auth(token))
    assert resp.status_code == 204, resp.text

    with Session(TEST_ENGINE) as session:
        assert session.exec(select(UserAccount).where(UserAccount.email == email)).first() is None
        assert session.exec(select(Candidate).where(Candidate.external_id == ext_id)).first() is None
        assert session.exec(
            select(Evidence).where(Evidence.candidate_external_id == ext_id)
        ).all() == []
        assert session.exec(
            select(ExplainabilityReport).where(ExplainabilityReport.candidate_external_id == ext_id)
        ).all() == []
        assert session.exec(
            select(JobApplication).where(JobApplication.job_id == job_id)
        ).all() == []
        # The posting was NOT owned by the candidate — it must survive.
        assert session.get(JobPosting, job_id) is not None

        # ConsentLog rows are legal proof of authorization and must be KEPT.
        assert len(session.exec(
            select(ConsentLog).where(ConsentLog.candidate_external_id == ext_id)
        ).all()) >= 1

        # Audit row exists and never stores the deleted e-mail in plaintext.
        audit_rows = session.exec(
            select(AuditTrail).where(
                AuditTrail.action == "account.delete",
                AuditTrail.target_entity == f"useraccount:{user_id}",
            )
        ).all()
        assert len(audit_rows) == 1
        audit = audit_rows[0]
        assert audit.actor_id.startswith("sha256:")
        for value in (audit.actor_id, audit.action, audit.target_entity, audit.details or ""):
            assert email not in value, "the audit trail must not retain the deleted e-mail"

    assert not stored_file.exists(), "the media blob must be removed from disk"

    # The old token now points at nothing and must be rejected outright.
    assert keyed_client.get("/api/v1/auth/me", headers=_auth(token)).status_code == 401


def test_login_after_deletion_fails(keyed_client):
    email, password, token = _register(keyed_client, "candidate")

    assert keyed_client.delete("/api/v1/auth/me", headers=_auth(token)).status_code == 204

    resp = keyed_client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert resp.status_code == 401, "a deleted account must not be able to sign in again"


def test_deleted_account_token_is_rejected_everywhere(keyed_client, tmp_path, monkeypatch):
    """
    Regression guard: tokens are stateless with a 24h expiry, so after KVKK
    erasure the old JWT kept working on every guarded endpoint — and could
    even recreate Evidence and ConsentLog rows for the erased identity.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    email, _password, token = _register(keyed_client, "candidate")
    ext_id = keyed_client.get(
        "/api/v1/auth/me", headers=_auth(token)
    ).json()["candidate_external_id"]

    assert keyed_client.delete("/api/v1/auth/me", headers=_auth(token)).status_code == 204

    # ConsentLog rows survive erasure by design, and SQLite may even hand a
    # later registration the same external id — so compare against a snapshot
    # taken after deletion rather than expecting emptiness.
    with Session(TEST_ENGINE) as session:
        evidence_before = len(session.exec(
            select(Evidence).where(Evidence.candidate_external_id == ext_id)
        ).all())
    consent_before = len(_consent_rows(ext_id))
    assert evidence_before == 0, "erasure must have removed the candidate's evidence"

    # The very token that deleted the account must now be dead everywhere.
    assert keyed_client.get("/api/v1/auth/me", headers=_auth(token)).status_code == 401
    resp = _extract_file(keyed_client, ext_id, consent="true", headers=_auth(token))
    assert resp.status_code == 401, "a deleted account's token must not extract evidence"

    # The refused call must not have recreated data for the erased identity.
    with Session(TEST_ENGINE) as session:
        assert len(session.exec(
            select(Evidence).where(Evidence.candidate_external_id == ext_id)
        ).all()) == evidence_before
    assert len(_consent_rows(ext_id)) == consent_before


def test_employer_deletion_removes_postings_and_their_applications(keyed_client):
    email, _password, token = _register(keyed_client, "employer")
    employer_id = keyed_client.get("/api/v1/auth/me", headers=_auth(token)).json()["id"]

    job_resp = keyed_client.post(
        "/api/v1/jobs/",
        json={
            "title": "Santiye Sefi",
            "description": "Is guvenligi belgesi zorunlu.",
            "company_name": f"KVKK Insaat {uuid.uuid4().hex[:6]}",
            "category": "CONSTRUCTION",
        },
        headers=_auth(token),
    )
    assert job_resp.status_code == 201, job_resp.text
    job_id = job_resp.json()["id"]

    with Session(TEST_ENGINE) as session:
        assert session.get(JobPosting, job_id).created_by_user_id == employer_id

    # An unrelated candidate applies to the employer's posting.
    cand_email, cand_password, cand_token = _register(keyed_client, "candidate")
    cand_ext = keyed_client.get(
        "/api/v1/auth/me", headers=_auth(cand_token)
    ).json()["candidate_external_id"]
    with Session(TEST_ENGINE) as session:
        candidate = session.exec(
            select(Candidate).where(Candidate.external_id == cand_ext)
        ).first()
        session.add(JobApplication(candidate_id=candidate.id, job_id=job_id))
        session.commit()

    assert keyed_client.delete("/api/v1/auth/me", headers=_auth(token)).status_code == 204

    with Session(TEST_ENGINE) as session:
        # Chosen policy: the employer's postings, those postings' applications
        # and the per-posting auto-generated requirement are erased with them.
        assert session.get(JobPosting, job_id) is None
        assert session.exec(
            select(JobApplication).where(JobApplication.job_id == job_id)
        ).all() == []
        assert session.exec(
            select(Requirement).where(Requirement.external_id == f"req_job_{job_id}")
        ).first() is None
        # The applicant's own account and profile are untouched.
        assert session.exec(
            select(Candidate).where(Candidate.external_id == cand_ext)
        ).first() is not None
        assert session.exec(
            select(UserAccount).where(UserAccount.email == cand_email)
        ).first() is not None

    # The employer is gone; the candidate can still sign in.
    assert keyed_client.post(
        "/api/v1/auth/login", json={"email": email, "password": _password}
    ).status_code == 401
    assert keyed_client.post(
        "/api/v1/auth/login", json={"email": cand_email, "password": cand_password}
    ).status_code == 200


def test_employer_deletion_erases_reports_and_requirement_keyed_evidence(keyed_client):
    """
    Two links nothing else can clean up once the posting is gone:

    - ExplainabilityReport.application_id is a foreign key with no cascade, so
      a surviving report aborts the whole erasure on PostgreSQL (and dangles
      on SQLite).
    - The applicants' Evidence rows point at the auto-generated requirement by
      a plain string ("req_job_<id>"): left behind, the candidate keeps seeing
      a verdict against a job that no longer resolves, and on SQLite a later
      posting reusing the id would silently inherit them.
    """
    _email, _password, token = _register(keyed_client, "employer")
    job_resp = keyed_client.post(
        "/api/v1/jobs/",
        json={
            "title": "Kaynakci",
            "description": "Sertifika zorunlu.",
            "company_name": f"KVKK Metal {uuid.uuid4().hex[:6]}",
            "category": "CONSTRUCTION",
        },
        headers=_auth(token),
    )
    assert job_resp.status_code == 201, job_resp.text
    job_id = job_resp.json()["id"]
    requirement_id = f"req_job_{job_id}"

    _cand_email, _cand_password, cand_token = _register(keyed_client, "candidate")
    cand_ext = keyed_client.get(
        "/api/v1/auth/me", headers=_auth(cand_token)
    ).json()["candidate_external_id"]

    with Session(TEST_ENGINE) as session:
        candidate = session.exec(
            select(Candidate).where(Candidate.external_id == cand_ext)
        ).first()
        application = JobApplication(candidate_id=candidate.id, job_id=job_id)
        session.add(application)
        session.commit()
        session.refresh(application)
        session.add(ExplainabilityReport(
            application_id=application.id,
            candidate_external_id=cand_ext,
            match_matrix="{}",
            final_summary="Ozet.",
        ))
        # Judged against this posting's requirement…
        session.add(Evidence(
            candidate_external_id=cand_ext,
            requirement_external_id=requirement_id,
            source_type="PDF_RESUME",
            status="VERIFIED",
            reasoning="Kaynak sertifikasi dogrulandi.",
        ))
        # …and against an unrelated one, which must survive.
        session.add(Evidence(
            candidate_external_id=cand_ext,
            requirement_external_id="req_general_cv",
            source_type="PDF_RESUME",
            status="VERIFIED",
            reasoning="Genel CV degerlendirmesi.",
        ))
        session.commit()

    assert keyed_client.delete("/api/v1/auth/me", headers=_auth(token)).status_code == 204

    with Session(TEST_ENGINE) as session:
        assert session.exec(
            select(ExplainabilityReport).where(
                ExplainabilityReport.candidate_external_id == cand_ext
            )
        ).all() == [], "a report pointing at a deleted application must go with it"
        assert session.exec(
            select(Evidence).where(Evidence.requirement_external_id == requirement_id)
        ).all() == [], "verdicts against the erased requirement must not linger"
        surviving = session.exec(
            select(Evidence).where(Evidence.candidate_external_id == cand_ext)
        ).all()
        assert [e.requirement_external_id for e in surviving] == ["req_general_cv"], (
            "evidence unrelated to the employer's posting belongs to the candidate"
        )


def test_candidate_deletion_erases_application_linked_report(keyed_client):
    """
    Same foreign key from the other side: the candidate's own application is
    deleted, so the report pointing at it has to go first.
    """
    _email, _password, token = _register(keyed_client, "candidate")
    ext_id = keyed_client.get(
        "/api/v1/auth/me", headers=_auth(token)
    ).json()["candidate_external_id"]

    with Session(TEST_ENGINE) as session:
        candidate = session.exec(
            select(Candidate).where(Candidate.external_id == ext_id)
        ).first()
        job = JobPosting(title="Asci", description="Mutfak deneyimi.", category="GASTRONOMY")
        session.add(job)
        session.commit()
        session.refresh(job)
        application = JobApplication(candidate_id=candidate.id, job_id=job.id)
        session.add(application)
        session.commit()
        session.refresh(application)
        application_id = application.id
        session.add(ExplainabilityReport(
            application_id=application_id,
            candidate_external_id=ext_id,
            match_matrix="{}",
            final_summary="Ozet.",
        ))
        session.commit()

    assert keyed_client.delete("/api/v1/auth/me", headers=_auth(token)).status_code == 204

    with Session(TEST_ENGINE) as session:
        assert session.get(JobApplication, application_id) is None
        assert session.exec(
            select(ExplainabilityReport).where(
                ExplainabilityReport.application_id == application_id
            )
        ).all() == []


def test_deletion_survives_enforced_foreign_keys(keyed_client):
    """
    Runs the erasure with SQLite foreign keys ON — PostgreSQL semantics, which
    is the documented production target. The order the rows are deleted in
    only matters here: with keys off, deleting an application before the
    report that references it merely orphans the report; with keys on it
    raises IntegrityError and the right to be forgotten silently fails.

    The scenario also plants the two account-scoped rows nothing else cleans
    up — a PasswordResetToken (forgot/reset only ever marks rows used) and a
    free-form Requirement (external_id outside the "req_job_" namespace) —
    both cascade-less foreign keys to useraccount that used to abort the
    erasure on PostgreSQL.
    """
    _email, _password, token = _register(keyed_client, "employer")
    employer_id = keyed_client.get("/api/v1/auth/me", headers=_auth(token)).json()["id"]
    job_resp = keyed_client.post(
        "/api/v1/jobs/",
        json={
            "title": "Tir Soforu",
            "description": "SRC belgesi zorunlu.",
            "company_name": f"KVKK Lojistik {uuid.uuid4().hex[:6]}",
            "category": "LOGISTICS",
        },
        headers=_auth(token),
    )
    assert job_resp.status_code == 201, job_resp.text
    job_id = job_resp.json()["id"]

    _cand_email, _cand_password, cand_token = _register(keyed_client, "candidate")
    cand_ext = keyed_client.get(
        "/api/v1/auth/me", headers=_auth(cand_token)
    ).json()["candidate_external_id"]

    with Session(TEST_ENGINE) as session:
        candidate = session.exec(
            select(Candidate).where(Candidate.external_id == cand_ext)
        ).first()
        application = JobApplication(candidate_id=candidate.id, job_id=job_id)
        session.add(application)
        session.commit()
        session.refresh(application)
        session.add(ExplainabilityReport(
            application_id=application.id,
            candidate_external_id=cand_ext,
            match_matrix="{}",
            final_summary="Ozet.",
        ))
        # An outstanding reset token, as any user who ever hit
        # /forgot-password would have.
        session.add(PasswordResetToken(
            user_id=employer_id,
            token_hash=uuid.uuid4().hex,
            expires_at=datetime.utcnow() + timedelta(minutes=30),
        ))
        # A requirement created via POST /api/v1/requirements rather than by
        # publishing a posting: not in the "req_job_" namespace.
        session.add(Requirement(
            external_id=f"req_custom_{uuid.uuid4().hex[:8]}",
            description="Serbest kriter: forklift ehliyeti.",
            created_by_user_id=employer_id,
        ))
        session.commit()

    with _foreign_keys_enforced():
        resp = keyed_client.delete("/api/v1/auth/me", headers=_auth(token))
    assert resp.status_code == 204, resp.text

    with Session(TEST_ENGINE) as session:
        assert session.get(JobPosting, job_id) is None
        assert session.exec(
            select(ExplainabilityReport).where(
                ExplainabilityReport.candidate_external_id == cand_ext
            )
        ).all() == []
        assert session.exec(
            select(PasswordResetToken).where(PasswordResetToken.user_id == employer_id)
        ).all() == [], "reset tokens must not outlive the erased account"
        assert session.exec(
            select(Requirement).where(Requirement.created_by_user_id == employer_id)
        ).all() == [], "free-form requirements must not outlive the erased account"


def test_delete_me_requires_user_token(keyed_client):
    assert keyed_client.delete("/api/v1/auth/me").status_code == 401


def test_delete_me_requires_internal_api_key(unauthenticated_client):
    token = _token_for("candidate", 999, "hayalet@kvkk.eip.dev")
    resp = unauthenticated_client.delete("/api/v1/auth/me", headers=_auth(token))
    assert resp.status_code == 403, "the internal API key is required like everywhere else"
