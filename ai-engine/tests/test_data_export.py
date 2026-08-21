"""
EIF: KVKK md. 11 Data Portability Tests (GET /api/v1/auth/me/export)

Erasure was already covered (test_privacy_compliance.py); access is the other
half of the same right, and it fails in the opposite direction: a too-small
export is merely incomplete, a too-large one hands out data that is not the
caller's. These tests pin both edges.

  1. Each role's export actually contains that role's own records.
  2. Credentials and secrets — the password, its hash, reset token hashes, the
     on-disk storage path of an upload — never appear in the document.
  3. An employer's export summarizes incoming applications as COUNTS only:
     an applicant's name, e-mail, candidate id or evidence must never cross
     into a different person's KVKK document.
  4. The export is bound to the token's account; nothing in it is addressable
     by a caller-supplied identifier.
"""

import json
import uuid
from datetime import datetime, timedelta

from sqlmodel import Session, select

from src.db.models import (
    AuditTrail,
    Candidate,
    Evidence,
    ExplainabilityReport,
    JobApplication,
    JobPosting,
    PasswordResetToken,
    UserAccount,
)
from tests.conftest import TEST_ENGINE, _token_for
from tests.test_moderation import MINIMAL_PNG

EXPORT_URL = "/api/v1/auth/me/export"

# Every registration below uses this password, so "the plaintext password must
# not be in the export" is a real assertion rather than a coincidence.
TEST_PASSWORD = "cok-gizli-parola-123"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(keyed_client, role: str, full_name: str) -> tuple[str, str]:
    """Registers a fresh user through the public endpoint; returns (email, token)."""
    email = f"{role}_{uuid.uuid4().hex[:8]}@export.eip.dev"
    body = {
        "email": email,
        "password": TEST_PASSWORD,
        "role": role,
        "full_name": full_name,
    }
    if role == "employer":
        body |= {
            "company_name": f"Dışa Aktarım A.Ş. {uuid.uuid4().hex[:6]}",
            "tax_number": "1234567890",
            "company_size": "1-5",
        }
    resp = keyed_client.post("/api/v1/auth/register", json=body)
    assert resp.status_code == 201, resp.text
    return email, resp.json()["access_token"]


def _upload_evidence(client, candidate_external_id: str, token: str, tmp_path, monkeypatch):
    """
    Files an image evidence through the real endpoint with a mocked LLM, so the
    export sees a row with media metadata and a "pending" review status.
    """
    import src.main as main_module
    from src.models.schemas import ExtractionResult

    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))

    class MockLLMService:
        async def extract_evidence(self, request):
            return ExtractionResult(
                status="VERIFIED",
                confidence_score=93,
                reasoning="Mock: belge gereksinimi açıkça karşılıyor.",
                evidence_pointer="mock://evidence/pointer/export",
            )

    main_module.app.dependency_overrides[main_module.get_llm_service] = lambda: MockLLMService()
    try:
        resp = client.post(
            "/api/v1/extract/file",
            data={
                "candidate_id": candidate_external_id,
                "requirement_id": "req_export_1",
                "consent_verified": "true",
            },
            files={"file": ("diploma.png", MINIMAL_PNG, "image/png")},
            headers=_auth(token),
        )
    finally:
        main_module.app.dependency_overrides.pop(main_module.get_llm_service, None)
    assert resp.status_code == 200, resp.text
    return resp


def _export(client, token: str) -> dict:
    resp = client.get(EXPORT_URL, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()


def _raw(document: dict) -> str:
    """
    The document as the user would actually download it.

    Asserting on the serialized text (not on individual fields) is what makes
    a leak test meaningful: a secret smuggled into a field nobody thought to
    check still shows up here.
    """
    return json.dumps(document, ensure_ascii=False)


def _category(document: dict, key: str) -> dict:
    matches = [row for row in document["categories"] if row["key"] == key]
    assert len(matches) == 1, f"category {key} missing from the export"
    return matches[0]


def _me(client, token: str) -> dict:
    resp = client.get("/api/v1/auth/me", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── 1. The export carries the caller's own data ──────────────────────────────


def test_candidate_export_contains_own_records(keyed_client, tmp_path, monkeypatch):
    name = f"Aday {uuid.uuid4().hex[:6]}"
    email, token = _register(keyed_client, "candidate", name)
    me = _me(keyed_client, token)
    ext_id = me["candidate_external_id"]

    _upload_evidence(keyed_client, ext_id, token, tmp_path, monkeypatch)

    # An application and an explainability report the candidate owns.
    with Session(TEST_ENGINE) as session:
        candidate = session.exec(
            select(Candidate).where(Candidate.external_id == ext_id)
        ).first()
        job = JobPosting(title="Hemşire", description="Diploma şart.", category="HEALTH")
        session.add(job)
        session.commit()
        session.refresh(job)
        application = JobApplication(candidate_id=candidate.id, job_id=job.id)
        session.add(application)
        session.commit()
        session.refresh(application)
        session.add(ExplainabilityReport(
            application_id=application.id,
            candidate_external_id=ext_id,
            match_matrix='{"rows": []}',
            final_summary="Aday özeti: kanıtlar doğrulandı.",
        ))
        session.commit()

    document = _export(keyed_client, token)

    # Account block: the caller's own identity.
    assert document["account"]["email"] == email
    assert document["account"]["role"] == "candidate"
    assert document["account"]["created_at"]

    # Profile, evidence, application, report, consent.
    assert [p["external_id"] for p in document["candidate_profiles"]] == [ext_id]
    assert document["candidate_profiles"][0]["name"] == name

    assert len(document["evidence"]) == 1
    evidence = document["evidence"][0]
    assert evidence["requirement_external_id"] == "req_export_1"
    assert evidence["status"] == "VERIFIED"
    assert evidence["review_status"] == "pending"
    # Metadata only — the file itself is out of scope by design.
    assert evidence["has_media"] is True
    assert evidence["media_filename"] == "diploma.png"
    assert evidence["media_mime"] == "image/png"

    assert [a["job_title"] for a in document["applications"]] == ["Hemşire"]
    assert document["reports"][0]["final_summary"] == "Aday özeti: kanıtlar doğrulandı."
    assert document["reports"][0]["job_title"] == "Hemşire"
    # Uploading with consent wrote a ConsentLog row; the access right covers it.
    assert len(document["consents"]) >= 1
    assert document["consents"][0]["candidate_external_id"] == ext_id

    # A candidate has no employer-side data.
    assert document["job_postings"] == []
    assert document["received_applications"] == []


def test_export_document_is_self_describing(keyed_client):
    """
    Whoever opens the downloaded file months later must be able to tell what it
    contains without reading the source — so date, platform and the category
    inventory are part of the contract, not decoration.
    """
    _email, token = _register(keyed_client, "candidate", "Belge Okuru")
    document = _export(keyed_client, token)

    assert document["format_version"]
    assert "EİP" in document["platform"]
    # Parses as a real timestamp, not a free-text label.
    datetime.fromisoformat(document["exported_at"])

    keys = {row["key"] for row in document["categories"]}
    assert keys == {
        "account",
        "candidate_profiles",
        "evidence",
        "applications",
        "reports",
        "consents",
        "password_reset_events",
        "job_postings",
        "requirements",
        "received_applications",
    }
    assert all(row["label"] for row in document["categories"])
    assert _category(document, "candidate_profiles")["count"] == 1

    # The two things the user cannot infer from the payload alone are spelled
    # out in the notes: why the document exists, and that file contents are not
    # in it (only their metadata).
    notes = " ".join(document["notes"])
    assert "KVKK" in notes
    assert "İÇERİĞİ" in notes and "üst veri" in notes


def test_export_category_counts_match_the_payload(keyed_client, tmp_path, monkeypatch):
    """A count that disagrees with the list would misinform the data subject."""
    _email, token = _register(keyed_client, "candidate", "Sayım Adayı")
    ext_id = _me(keyed_client, token)["candidate_external_id"]
    _upload_evidence(keyed_client, ext_id, token, tmp_path, monkeypatch)

    document = _export(keyed_client, token)
    for key in (
        "candidate_profiles",
        "evidence",
        "applications",
        "reports",
        "consents",
        "password_reset_events",
        "job_postings",
        "requirements",
        "received_applications",
    ):
        assert _category(document, key)["count"] == len(document[key]), key


def test_employer_export_contains_own_postings_and_requirements(keyed_client):
    _email, token = _register(keyed_client, "employer", "İşveren Yetkilisi")

    job_resp = keyed_client.post(
        "/api/v1/jobs/",
        json={
            "title": "Kaynakçı",
            "description": "Sertifika zorunlu.",
            "category": "CONSTRUCTION",
        },
        headers=_auth(token),
    )
    assert job_resp.status_code == 201, job_resp.text
    job_id = job_resp.json()["id"]

    document = _export(keyed_client, token)

    assert [p["id"] for p in document["job_postings"]] == [job_id]
    assert document["job_postings"][0]["title"] == "Kaynakçı"
    assert document["account"]["company_name"]
    # Publishing a posting mints its grading criterion; it is the employer's data.
    assert f"req_job_{job_id}" in [r["external_id"] for r in document["requirements"]]

    # An employer has no candidate-side data.
    assert document["candidate_profiles"] == []
    assert document["evidence"] == []
    assert document["applications"] == []


# ── 2. Secrets never cross the seam ──────────────────────────────────────────


def test_export_never_contains_password_or_its_hash(keyed_client):
    email, token = _register(keyed_client, "candidate", "Şifre Testi")
    document = _export(keyed_client, token)
    raw = _raw(document)

    with Session(TEST_ENGINE) as session:
        account = session.exec(
            select(UserAccount).where(UserAccount.email == email)
        ).first()
        stored_hash = account.hashed_password

    assert TEST_PASSWORD not in raw, "the plaintext password must never be exported"
    assert stored_hash not in raw, "the password hash must never be exported"
    assert "pbkdf2" not in raw.lower(), "no fragment of the credential may leak"
    assert "hashed_password" not in raw


def test_export_password_reset_events_carry_dates_but_no_token(keyed_client):
    """
    A live reset link inside a downloadable file would be a ready-made account
    takeover, so only the timing metadata is exported.
    """
    email, token = _register(keyed_client, "candidate", "Sıfırlama Testi")
    token_hash = uuid.uuid4().hex
    with Session(TEST_ENGINE) as session:
        account = session.exec(
            select(UserAccount).where(UserAccount.email == email)
        ).first()
        session.add(PasswordResetToken(
            user_id=account.id,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=30),
        ))
        session.commit()

    document = _export(keyed_client, token)

    assert len(document["password_reset_events"]) == 1
    event = document["password_reset_events"][0]
    assert event["created_at"] and event["expires_at"]
    assert event["used_at"] is None
    assert set(event) == {"created_at", "expires_at", "used_at"}
    assert token_hash not in _raw(document), "the reset token hash must not be exported"


def test_export_omits_internal_storage_and_moderation_internals(keyed_client, tmp_path, monkeypatch):
    """
    Same seam candidates.py draws for evidence: the path on disk, the deciding
    admin's e-mail and the internal review note are moderation internals, not
    the candidate's copy of their own record.
    """
    _email, token = _register(keyed_client, "candidate", "Medya Testi")
    ext_id = _me(keyed_client, token)["candidate_external_id"]
    _upload_evidence(keyed_client, ext_id, token, tmp_path, monkeypatch)

    with Session(TEST_ENGINE) as session:
        evidence = session.exec(
            select(Evidence).where(Evidence.candidate_external_id == ext_id)
        ).first()
        media_path = evidence.media_path
        evidence.reviewed_by = "moderator@eip.dev"
        evidence.review_note = "Dahili not: belge elle karşılaştırıldı."
        session.add(evidence)
        session.commit()

    raw = _raw(_export(keyed_client, token))
    assert media_path and media_path not in raw, "the on-disk path must not be exported"
    assert "moderator@eip.dev" not in raw
    assert "Dahili not" not in raw


# ── 3. An employer's export must not carry an applicant's personal data ──────


def test_employer_export_summarizes_applications_without_candidate_identity(keyed_client):
    """
    The hard boundary: an employer's own hiring activity is their data, but the
    people behind it are not. Dumping applicant identities into an employer's
    KVKK document would be a fresh KVKK violation, not compliance.
    """
    _email, employer_token = _register(keyed_client, "employer", "Gizlilik İşvereni")
    job_resp = keyed_client.post(
        "/api/v1/jobs/",
        json={
            "title": "Tır Şoförü",
            "description": "SRC belgesi zorunlu.",
            "category": "LOGISTICS",
        },
        headers=_auth(employer_token),
    )
    assert job_resp.status_code == 201, job_resp.text
    job_id = job_resp.json()["id"]

    applicant_name = f"Mahrem Aday {uuid.uuid4().hex[:6]}"
    applicant_email, applicant_token = _register(keyed_client, "candidate", applicant_name)
    applicant_ext = _me(keyed_client, applicant_token)["candidate_external_id"]

    applicant_reasoning = f"Aday gizli kanıt metni {uuid.uuid4().hex[:6]}"
    with Session(TEST_ENGINE) as session:
        candidate = session.exec(
            select(Candidate).where(Candidate.external_id == applicant_ext)
        ).first()
        candidate_row_id = candidate.id
        session.add(JobApplication(candidate_id=candidate_row_id, job_id=job_id))
        # Evidence judged against THIS employer's requirement — still the
        # applicant's personal data, so it stays out of the employer's export.
        session.add(Evidence(
            candidate_external_id=applicant_ext,
            requirement_external_id=f"req_job_{job_id}",
            source_type="PDF_RESUME",
            status="VERIFIED",
            reasoning=applicant_reasoning,
        ))
        session.commit()

    document = _export(keyed_client, employer_token)

    # The employer does learn their own pipeline — as counts.
    summaries = [s for s in document["received_applications"] if s["job_id"] == job_id]
    assert len(summaries) == 1
    summary = summaries[0]
    assert summary["job_title"] == "Tır Şoförü"
    assert summary["total"] == 1
    assert summary["by_status"] == {"submitted": 1}
    # …and nothing beyond counts: no identity fields exist on the summary at all.
    assert set(summary) == {"job_id", "job_title", "total", "by_status"}

    raw = _raw(document)
    assert applicant_name not in raw, "an applicant's name must not enter the employer's export"
    assert applicant_email not in raw
    assert applicant_ext not in raw, "the applicant's candidate id must not be exported"
    assert applicant_reasoning not in raw, "the applicant's evidence is not the employer's data"
    assert f'"candidate_id": {candidate_row_id}' not in raw
    # The applicant's own categories stay empty for an employer account.
    assert document["candidate_profiles"] == []
    assert document["evidence"] == []
    assert document["consents"] == []


# ── 4. Ownership: the export is bound to the token's account ─────────────────


def test_export_contains_nothing_from_another_account(keyed_client, tmp_path, monkeypatch):
    """
    There is no id to tamper with on this route, so the ownership guarantee is
    checked from the outside: a second candidate's records must be absent from
    the first candidate's document, and vice versa.
    """
    name_a = f"Birinci Aday {uuid.uuid4().hex[:6]}"
    name_b = f"İkinci Aday {uuid.uuid4().hex[:6]}"
    email_a, token_a = _register(keyed_client, "candidate", name_a)
    email_b, token_b = _register(keyed_client, "candidate", name_b)
    ext_a = _me(keyed_client, token_a)["candidate_external_id"]
    ext_b = _me(keyed_client, token_b)["candidate_external_id"]

    _upload_evidence(keyed_client, ext_b, token_b, tmp_path, monkeypatch)

    raw_a = _raw(_export(keyed_client, token_a))
    assert ext_a in raw_a
    assert name_b not in raw_a
    assert email_b not in raw_a
    assert ext_b not in raw_a, "another account's candidate id must never appear"

    raw_b = _raw(_export(keyed_client, token_b))
    assert ext_b in raw_b
    assert name_a not in raw_b
    assert email_a not in raw_b
    assert ext_a not in raw_b


def test_export_writes_an_audit_row(keyed_client):
    """A data-access request is legally relevant; it leaves a record."""
    email, token = _register(keyed_client, "candidate", "Denetim Adayı")
    user_id = _me(keyed_client, token)["id"]

    _export(keyed_client, token)

    with Session(TEST_ENGINE) as session:
        rows = session.exec(
            select(AuditTrail).where(
                AuditTrail.action == "account.export",
                AuditTrail.target_entity == f"useraccount:{user_id}",
            )
        ).all()
    assert len(rows) == 1
    # The account survives an export, so the actor is the plain address here —
    # unlike account.delete, which must hash it.
    assert rows[0].actor_id == email


def test_export_requires_user_token(keyed_client):
    assert keyed_client.get(EXPORT_URL).status_code == 401


def test_export_requires_internal_api_key(unauthenticated_client):
    token = _token_for("candidate", 999, "hayalet@export.eip.dev")
    resp = unauthenticated_client.get(EXPORT_URL, headers=_auth(token))
    assert resp.status_code == 403, "the internal API key is required like everywhere else"


def test_export_rejects_a_deleted_accounts_token(keyed_client):
    """
    Tokens are stateless for 24h, so erasure must kill the access right too —
    otherwise the deleted account's data could be pulled back out afterwards.
    """
    _email, token = _register(keyed_client, "candidate", "Silinmiş Aday")
    assert keyed_client.delete("/api/v1/auth/me", headers=_auth(token)).status_code == 204
    assert keyed_client.get(EXPORT_URL, headers=_auth(token)).status_code == 401
