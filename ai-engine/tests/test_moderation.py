"""
EIF: Moderation Layer Tests
---
Covers the human-review pipeline for uploaded documents.

A photographed certificate or a scanned diploma is trivial to doctor, so the
platform no longer takes the model's word for it: those uploads are stored on
disk, their Evidence row starts as "pending", and an admin approves or
rejects it while looking at the very file the model judged. Plain text needs
no human pass and must keep its old behaviour.
"""

import base64
import io
import uuid

import pytest
from fastapi import HTTPException
from pypdf import PdfWriter
from sqlmodel import Session, select

from src.db.models import Candidate, Evidence
from src.security.permissions import require_admin
from src.services.storage import load_upload, sanitize_filename, save_upload
from tests.conftest import TEST_ENGINE, create_candidate_profile

# The candidate_client fixture's account — uploads are only accepted for a
# profile the caller owns.
CANDIDATE_USER_ID = 901

# Smallest well-formed PNG (1x1 pixel) — real magic bytes, not just a header,
# so it passes MediaAttachment's content check the way a phone photo would.
MINIMAL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
    "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _scanned_pdf() -> bytes:
    """A valid PDF with no text layer — what a scanner produces."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _mock_llm(main_module):
    from src.models.schemas import ExtractionResult

    class MockLLMService:
        async def extract_evidence(self, request):
            return ExtractionResult(
                status="VERIFIED",
                confidence_score=97,
                reasoning="Mock: the document clearly demonstrates the requirement.",
                evidence_pointer="mock://evidence/pointer/moderation",
            )

    main_module.app.dependency_overrides[main_module.get_llm_service] = lambda: MockLLMService()


def _upload(client, candidate_id: str, filename: str, data: bytes, content_type: str):
    """POST /extract/file with a mocked LLM, restoring only the LLM override."""
    import src.main as main_module

    _mock_llm(main_module)
    try:
        return client.post(
            "/api/v1/extract/file",
            data={
                "candidate_id": candidate_id,
                "requirement_id": "req_moderation_1",
                "consent_verified": "true",
            },
            files={"file": (filename, data, content_type)},
        )
    finally:
        main_module.app.dependency_overrides.pop(main_module.get_llm_service, None)


def _evidence_for(candidate_id: str) -> Evidence:
    with Session(TEST_ENGINE) as session:
        evidence = session.exec(
            select(Evidence).where(Evidence.candidate_external_id == candidate_id)
        ).first()
    assert evidence is not None, "Evidence row was not persisted"
    return evidence


def _insert_evidence(**overrides) -> int:
    """Creates an Evidence row directly, bypassing the endpoint."""
    fields = dict(
        candidate_external_id=f"cand_mod_{uuid.uuid4().hex[:8]}",
        requirement_external_id="req_mod_seed",
        source_type="IMAGE_DOCUMENT",
        status="VERIFIED",
        confidence_score=90,
        reasoning="Seeded row for moderation endpoint tests.",
        review_status="pending",
    )
    fields.update(overrides)
    with Session(TEST_ENGINE) as session:
        evidence = Evidence(**fields)
        session.add(evidence)
        session.commit()
        session.refresh(evidence)
        return evidence.id


# ── Upload pipeline: what goes to review and what does not ──────────────────

def test_image_upload_is_stored_and_pending(candidate_client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    candidate_id = f"cand_png_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)

    resp = _upload(candidate_client, candidate_id, "sertifika.png", MINIMAL_PNG, "image/png")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "VERIFIED"
    assert body["review_status"] == "pending", "an uploaded image must await review"

    evidence = _evidence_for(candidate_id)
    assert evidence.review_status == "pending"
    assert evidence.media_mime == "image/png"
    assert evidence.media_filename == "sertifika.png"
    assert evidence.media_path, "media_path must record where the file lives"
    stored = tmp_path / evidence.media_path
    assert stored.is_file(), "the uploaded file must actually be on disk"
    assert stored.read_bytes() == MINIMAL_PNG


def test_scanned_pdf_is_stored_and_pending(candidate_client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    candidate_id = f"cand_scan_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)
    pdf_bytes = _scanned_pdf()

    resp = _upload(candidate_client, candidate_id, "diploma.pdf", pdf_bytes, "application/pdf")

    assert resp.status_code == 200, resp.text
    assert resp.json()["review_status"] == "pending"

    evidence = _evidence_for(candidate_id)
    assert evidence.review_status == "pending"
    assert evidence.source_type == "SCANNED_PDF"
    assert evidence.media_mime == "application/pdf"
    assert (tmp_path / evidence.media_path).read_bytes() == pdf_bytes


def test_plain_text_upload_stays_approved_and_unstored(candidate_client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    candidate_id = f"cand_txt_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)

    resp = _upload(
        candidate_client, candidate_id, "cv.txt",
        "5 yıl yoğun bakım hemşiresi olarak çalıştım.".encode(), "text/plain",
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["review_status"] == "approved"

    evidence = _evidence_for(candidate_id)
    assert evidence.review_status == "approved"
    assert evidence.media_path is None
    assert list(tmp_path.iterdir()) == [], "text uploads must not persist files"


def test_json_extract_refuses_media_attachments(candidate_client):
    """
    Only /extract/file stores the document and starts its row "pending"; the
    JSON endpoint persists no file, so an attachment posted there used to come
    out "approved" with nothing left for a moderator to inspect — a straight
    bypass of the review queue via the very proxy the browser already uses.
    Media must be refused on the JSON endpoint outright.
    """
    import src.main as main_module

    candidate_id = f"cand_jsonmedia_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(candidate_id, user_id=CANDIDATE_USER_ID)

    _mock_llm(main_module)
    try:
        resp = candidate_client.post(
            "/api/v1/extract",
            json={
                "payload": {
                    "candidate_id": candidate_id,
                    "source_type": "SCANNED_PDF",
                    "raw_data": "Taranmış belge: diploma.pdf",
                    # Valid per MediaAttachment: pydantic coerces the string
                    # to bytes and "%PDF-" satisfies the magic-byte check.
                    "media": [{
                        "mime_type": "application/pdf",
                        "data": "%PDF-1.4 sahte diploma",
                        "filename": "diploma.pdf",
                    }],
                    "consent_verified": True,
                },
                "requirement": {"id": "req_moderation_1", "description": "Diploma şartı"},
            },
        )
    finally:
        main_module.app.dependency_overrides.pop(main_module.get_llm_service, None)

    assert resp.status_code == 400, resp.text

    with Session(TEST_ENGINE) as session:
        rows = session.exec(
            select(Evidence).where(Evidence.candidate_external_id == candidate_id)
        ).all()
    assert rows == [], "a refused media submission must not persist evidence"


# ── Moderation endpoints: queue, decisions, media ───────────────────────────

def test_list_pending_requires_admin(admin_client, client, candidate_client):
    pending_id = _insert_evidence()

    resp = admin_client.get("/api/v1/moderation/evidences?review_status=pending&limit=50&offset=0")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    listed = {item["id"] for item in body["items"]}
    assert pending_id in listed
    assert all(item["review_status"] == "pending" for item in body["items"])
    # Contract shape: the moderation UI relies on these exact keys.
    item = body["items"][0]
    for key in (
        "id", "candidate_external_id", "requirement_external_id", "source_type",
        "status", "confidence_score", "reasoning", "evidence_pointer",
        "review_status", "media_filename", "media_mime", "has_media",
        "reviewed_by", "reviewed_at", "review_note",
    ):
        assert key in item, f"missing contract field: {key}"

    # An employer moderating their own applicants' evidence defeats the point.
    assert client.get("/api/v1/moderation/evidences").status_code == 403
    assert candidate_client.get("/api/v1/moderation/evidences").status_code == 403


def test_patch_approve_records_reviewer(admin_client):
    evidence_id = _insert_evidence()

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "approved", "note": "Belge net ve okunaklı."},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["review_status"] == "approved"
    assert body["reviewed_by"] == "admin@test.local"
    assert body["reviewed_at"] is not None
    assert body["review_note"] == "Belge net ve okunaklı."


def test_patch_reject_records_reviewer(admin_client):
    evidence_id = _insert_evidence()

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "rejected"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["review_status"] == "rejected"
    assert body["reviewed_by"] == "admin@test.local"
    assert body["reviewed_at"] is not None

    with Session(TEST_ENGINE) as session:
        row = session.get(Evidence, evidence_id)
        assert row.review_status == "rejected"
        assert row.reviewed_at is not None


def test_patch_unknown_id_is_404_and_bad_status_is_422(admin_client):
    assert admin_client.patch(
        "/api/v1/moderation/evidences/999999", json={"review_status": "approved"}
    ).status_code == 404

    evidence_id = _insert_evidence()
    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "maybe"},
    )
    assert resp.status_code == 422, "an unknown verdict must never be written"


def test_patch_requires_admin(client, candidate_client):
    evidence_id = _insert_evidence()
    for non_admin in (client, candidate_client):
        resp = non_admin.patch(
            f"/api/v1/moderation/evidences/{evidence_id}",
            json={"review_status": "approved"},
        )
        assert resp.status_code == 403


def test_media_endpoint_returns_exact_bytes(admin_client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    relative = save_upload(MINIMAL_PNG, "image/png", "sertifika.png")
    evidence_id = _insert_evidence(media_path=relative, media_mime="image/png")

    resp = admin_client.get(f"/api/v1/moderation/evidences/{evidence_id}/media")
    assert resp.status_code == 200
    assert resp.content == MINIMAL_PNG
    assert resp.headers["content-type"].startswith("image/png")


def test_media_endpoint_404_cases(admin_client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))

    # Unknown evidence id.
    assert admin_client.get("/api/v1/moderation/evidences/999999/media").status_code == 404

    # Evidence without stored media (a text upload).
    no_media_id = _insert_evidence(media_path=None, source_type="PDF_RESUME")
    assert admin_client.get(f"/api/v1/moderation/evidences/{no_media_id}/media").status_code == 404

    # Stored file vanished from disk.
    gone_id = _insert_evidence(media_path="deadbeef.png", media_mime="image/png")
    assert admin_client.get(f"/api/v1/moderation/evidences/{gone_id}/media").status_code == 404


def test_media_endpoint_refuses_path_traversal(admin_client, tmp_path, monkeypatch):
    """A poisoned media_path must read as "gone", not leak arbitrary files."""
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setenv("UPLOAD_DIR", str(uploads))
    secret = tmp_path / "secret.txt"
    secret.write_bytes(b"jwt-secret-material")

    evil_id = _insert_evidence(media_path="../secret.txt", media_mime="text/plain")
    resp = admin_client.get(f"/api/v1/moderation/evidences/{evil_id}/media")
    assert resp.status_code == 404
    assert b"jwt-secret-material" not in resp.content


# ── Read path: the verdict must gate what non-admins see ────────────────────

# Columns the moderation feature added to Evidence that must never leave the
# server through the candidate-facing evidences endpoint.
MODERATION_INTERNAL_FIELDS = (
    "media_path", "media_mime", "media_filename",
    "reviewed_by", "reviewed_at", "review_note",
)


def _create_candidate(user_id: int | None = None) -> str:
    """Creates a Candidate profile directly; returns its external_id."""
    external_id = f"cand_read_{uuid.uuid4().hex[:8]}"
    with Session(TEST_ENGINE) as session:
        session.add(Candidate(external_id=external_id, user_id=user_id, name="Okuma Testi"))
        session.commit()
    return external_id


def test_employer_sees_only_approved_evidence(client):
    """Pending AND rejected uploads must never reach an employer's report."""
    ext_id = _create_candidate()
    approved_id = _insert_evidence(candidate_external_id=ext_id, review_status="approved")
    _insert_evidence(candidate_external_id=ext_id, review_status="pending")
    _insert_evidence(candidate_external_id=ext_id, review_status="rejected")

    resp = client.get(f"/api/v1/candidates/{ext_id}/evidences")
    assert resp.status_code == 200, resp.text
    assert [e["id"] for e in resp.json()] == [approved_id], (
        "employers must see approved evidence only — anything else inflates the score"
    )


def test_owner_candidate_still_sees_own_pending_evidence(candidate_client):
    """The hub tells the candidate their upload is under review — show it."""
    ext_id = _create_candidate(user_id=901)  # candidate_client's user_id
    _insert_evidence(candidate_external_id=ext_id, review_status="pending")
    _insert_evidence(candidate_external_id=ext_id, review_status="approved")

    resp = candidate_client.get(f"/api/v1/candidates/{ext_id}/evidences")
    assert resp.status_code == 200, resp.text
    statuses = {e["review_status"] for e in resp.json()}
    assert statuses == {"pending", "approved"}


def test_non_owner_candidate_is_refused_someone_elses_evidence(candidate_client):
    """
    external_ids are guessable, so a filtered view was never enough: the
    approved rows alone are the stranger's certificates, findings and source
    filenames. The roster is employer-only; a candidate reaching another
    candidate's record by id must be refused outright.
    """
    ext_id = _create_candidate(user_id=77777)  # someone else's profile
    _insert_evidence(candidate_external_id=ext_id, review_status="approved")

    resp = candidate_client.get(f"/api/v1/candidates/{ext_id}/evidences")
    assert resp.status_code == 403, resp.text


def test_admin_sees_all_review_states(admin_client):
    ext_id = _create_candidate()
    _insert_evidence(candidate_external_id=ext_id, review_status="pending")
    _insert_evidence(candidate_external_id=ext_id, review_status="rejected")
    _insert_evidence(candidate_external_id=ext_id, review_status="approved")

    resp = admin_client.get(f"/api/v1/candidates/{ext_id}/evidences")
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 3


def test_evidences_endpoint_hides_moderation_internals(client, candidate_client):
    """
    The admin's e-mail, the internal review note and the on-disk storage path
    belong to the moderation panel only — the public endpoint must not
    serialize them, not even to the candidate who owns the evidence.
    """
    ext_id = _create_candidate(user_id=901)
    _insert_evidence(
        candidate_external_id=ext_id,
        review_status="approved",
        media_path="2026/08/deadbeef_diploma.png",
        media_mime="image/png",
        media_filename="diploma.png",
        reviewed_by="admin@test.local",
        review_note="INTERNAL: sahte belge şüphesi, hukuka iletildi.",
    )

    for caller in (client, candidate_client):
        resp = caller.get(f"/api/v1/candidates/{ext_id}/evidences")
        assert resp.status_code == 200, resp.text
        items = resp.json()
        assert items, "the approved row itself must still be visible"
        for item in items:
            for field in MODERATION_INTERNAL_FIELDS:
                assert field not in item, f"moderation-internal field leaked: {field}"
        # What callers legitimately need stays intact.
        assert items[0]["status"] == "VERIFIED"
        assert items[0]["review_status"] == "approved"


# ── Storage unit behaviour ──────────────────────────────────────────────────

def test_save_upload_names_by_mime_not_filename(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    relative = save_upload(MINIMAL_PNG, "image/png", "..\\..\\hain.pdf")

    assert relative.endswith(".png"), "extension must follow the sniffed mime"
    assert "/" not in relative and "\\" not in relative
    assert "hain" not in relative, "user filename must not influence storage"
    assert load_upload(relative) == MINIMAL_PNG


def test_load_upload_refuses_traversal(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setenv("UPLOAD_DIR", str(uploads))
    (tmp_path / "outside.txt").write_bytes(b"secret")

    with pytest.raises(ValueError):
        load_upload("../outside.txt")


def test_sanitize_filename_strips_paths():
    assert sanitize_filename("C:\\Users\\aday\\Belgeler\\diploma.png") == "diploma.png"
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename(None) is None
    assert sanitize_filename("") is None


# ── require_admin ───────────────────────────────────────────────────────────

def test_require_admin_accepts_only_admin_role():
    payload = {"role": "admin", "sub": "admin@test.local"}
    assert require_admin(payload) is payload

    for role in ("employer", "candidate", "", None):
        with pytest.raises(HTTPException) as exc:
            require_admin({"role": role})
        assert exc.value.status_code == 403
