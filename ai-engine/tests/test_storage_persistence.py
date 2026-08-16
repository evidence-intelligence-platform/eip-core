"""
EIF: Evidence Storage Durability Tests
---
Compliance: 01_ENGINEERING_CONSTITUTION.md Article II — an "approved" verdict
is the platform's claim that a human examined the document.
---
Uploaded documents live on disk under UPLOAD_DIR while their Evidence row
waits at review_status "pending". When that directory is the container's
writable layer instead of a mounted volume, a redeploy deletes exactly those
files and leaves the media_path rows behind — so the moderation panel offers
an admin a row whose document 404s, and approving it would write an
AuditTrail entry attesting to a review that could not have happened.

These tests lock both halves of the fix: the router refuses a blind approval
(while keeping rejection available, since a record whose file is gone is
legitimately rejectable), and the storage layer says so out loud at startup
rather than losing evidence quietly.
"""

import base64
import logging
import os
import uuid
from pathlib import Path

import pytest
from sqlmodel import Session, select

from src.db.models import AuditTrail, Evidence
from src.services.storage import (
    UploadDirUnwritableError,
    check_upload_dir_at_startup,
    save_upload,
    upload_exists,
    verify_upload_dir_writable,
)
from tests.conftest import TEST_ENGINE

# Smallest well-formed PNG (1x1 pixel) — a stand-in for a photographed
# certificate, with real magic bytes.
MINIMAL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
    "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _insert_pending_evidence(**overrides) -> int:
    """Creates a pending Evidence row directly, bypassing the upload endpoint."""
    fields = dict(
        candidate_external_id=f"cand_persist_{uuid.uuid4().hex[:8]}",
        requirement_external_id="req_persist_seed",
        source_type="IMAGE_DOCUMENT",
        status="VERIFIED",
        confidence_score=93,
        reasoning="Seeded row for storage durability tests.",
        review_status="pending",
        media_mime="image/png",
        media_filename="diploma.png",
    )
    fields.update(overrides)
    with Session(TEST_ENGINE) as session:
        evidence = Evidence(**fields)
        session.add(evidence)
        session.commit()
        session.refresh(evidence)
        return evidence.id


def _reload(evidence_id: int) -> Evidence:
    with Session(TEST_ENGINE) as session:
        return session.get(Evidence, evidence_id)


def _audit_actions(evidence_id: int) -> list[str]:
    """Every audit action recorded against this evidence row."""
    with Session(TEST_ENGINE) as session:
        rows = session.exec(
            select(AuditTrail).where(AuditTrail.target_entity == f"evidence:{evidence_id}")
        ).all()
    return [row.action for row in rows]


@pytest.fixture
def storage_logs(caplog):
    """
    caplog, wired to catch eip.storage records wherever this module runs.

    The migration tests call alembic's env.py, whose logging.config.fileConfig()
    disables every logger the ini does not name — this one included — for the
    rest of the process. Production never sees that: migrations run as their
    own process before uvicorn imports the app.
    """
    logger = logging.getLogger("eip.storage")
    was_disabled = logger.disabled
    logger.disabled = False
    try:
        with caplog.at_level(logging.INFO, logger="eip.storage"):
            yield caplog
    finally:
        logger.disabled = was_disabled


def _unwritable_upload_dir(tmp_path: Path) -> Path:
    """
    A UPLOAD_DIR that cannot become a directory, because a file blocks the path.

    Stands in for the deployment failures that matter — a volume that was
    never mounted, a mount point that is not what the operator thought — and
    behaves the same on POSIX and Windows, unlike permission bits.
    """
    blocker = tmp_path / "not-a-directory"
    blocker.write_bytes(b"bu bir dizin degil")
    return blocker / "uploads"


# ── Blind approval: the verdict must not outlive the document ───────────────

def test_approval_refused_after_stored_file_vanishes(admin_client, tmp_path, monkeypatch):
    """The redeploy scenario: the row survives, the file does not."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    relative = save_upload(MINIMAL_PNG, "image/png", "diploma.png")
    evidence_id = _insert_pending_evidence(media_path=relative)

    (tmp_path / relative).unlink()  # what a wiped writable layer looks like

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "approved", "note": "Belgeye bakmadan onay."},
    )

    assert resp.status_code == 409, resp.text
    assert "onaylanamaz" in resp.json()["detail"], "the admin must learn why"

    row = _reload(evidence_id)
    assert row.review_status == "pending", "a refused verdict must not be written"
    assert row.reviewed_by is None
    assert row.reviewed_at is None
    assert row.review_note is None


def test_rejection_still_works_when_stored_file_vanishes(admin_client, tmp_path, monkeypatch):
    """
    Rejection must stay open. Blocking it too would strand every row whose
    file was lost in the queue forever, with no way to tell the candidate to
    upload the document again.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    relative = save_upload(MINIMAL_PNG, "image/png", "ehliyet.png")
    evidence_id = _insert_pending_evidence(media_path=relative)

    (tmp_path / relative).unlink()

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "rejected", "note": "Belge sunucuda bulunamadı."},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["review_status"] == "rejected"
    assert body["reviewed_by"] == "admin@test.local"
    assert body["reviewed_at"] is not None

    assert _reload(evidence_id).review_status == "rejected"
    assert _audit_actions(evidence_id) == ["moderation.review.rejected"]


def test_refused_approval_leaves_no_audit_trail(admin_client, tmp_path, monkeypatch):
    """
    An audit row is what the platform would later show a court. A refused
    approval must leave nothing behind — not the Evidence update, not the
    AuditTrail entry that would assert the review took place.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    evidence_id = _insert_pending_evidence(media_path="silinmis-belge.png")

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "approved"},
    )

    assert resp.status_code == 409, resp.text
    assert _audit_actions(evidence_id) == [], "no verdict happened, so no audit row"


def test_approval_refused_for_media_path_outside_the_store(admin_client, tmp_path, monkeypatch):
    """
    A poisoned media_path resolves outside UPLOAD_DIR, and the media endpoint
    already refuses to serve it — so the admin cannot have seen it either.
    """
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setenv("UPLOAD_DIR", str(uploads))
    (tmp_path / "disarida.png").write_bytes(MINIMAL_PNG)

    evidence_id = _insert_pending_evidence(media_path="../disarida.png")

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "approved"},
    )

    assert resp.status_code == 409, resp.text
    assert _reload(evidence_id).review_status == "pending"
    assert _audit_actions(evidence_id) == []


def test_approval_works_while_the_document_is_still_there(admin_client, tmp_path, monkeypatch):
    """The guard must not stand in the way of the normal review."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    relative = save_upload(MINIMAL_PNG, "image/png", "sertifika.png")
    evidence_id = _insert_pending_evidence(media_path=relative)

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "approved", "note": "Belge net ve okunaklı."},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["review_status"] == "approved"
    assert _reload(evidence_id).review_status == "approved"
    assert _audit_actions(evidence_id) == ["moderation.review.approved"]


def test_evidence_without_media_is_unaffected(admin_client, tmp_path, monkeypatch):
    """
    Text extractions carry no document and are stored approved already; a row
    that never claimed a file has nothing to look at, so the guard must not
    fire on it.
    """
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    evidence_id = _insert_pending_evidence(
        source_type="PDF_RESUME", media_path=None, media_mime=None, media_filename=None
    )

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "approved"},
    )

    assert resp.status_code == 200, resp.text
    assert _reload(evidence_id).review_status == "approved"


# ── upload_exists: the existence check the guard is built on ────────────────

def test_upload_exists_answers_for_stored_missing_and_escaping_paths(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setenv("UPLOAD_DIR", str(uploads))
    (tmp_path / "gizli.txt").write_bytes(b"jwt-secret-material")

    relative = save_upload(MINIMAL_PNG, "image/png", "sertifika.png")

    assert upload_exists(relative) is True
    assert upload_exists("hic-yazilmadi.png") is False
    assert upload_exists(None) is False
    assert upload_exists("") is False
    # Traversal answers "not there" instead of confirming an outside file.
    assert upload_exists("../gizli.txt") is False


# ── Startup check: loud about a directory that will lose evidence ───────────

def test_startup_check_reports_a_directory_it_cannot_create(tmp_path, monkeypatch, storage_logs):
    monkeypatch.setenv("UPLOAD_DIR", str(_unwritable_upload_dir(tmp_path)))

    assert check_upload_dir_at_startup() is False

    errors = [r for r in storage_logs.records if r.levelno >= logging.ERROR]
    assert errors, "an unusable evidence store must not be a silent condition"
    assert "yazılabilir değil" in errors[0].getMessage()


def test_verify_upload_dir_writable_raises_when_the_path_is_blocked(tmp_path, monkeypatch):
    """The strict form, for callers that want the boot to fail rather than warn."""
    monkeypatch.setenv("UPLOAD_DIR", str(_unwritable_upload_dir(tmp_path)))

    with pytest.raises(UploadDirUnwritableError):
        verify_upload_dir_writable()


def test_startup_check_warns_when_upload_dir_is_unset(monkeypatch, storage_logs):
    """
    The live failure mode has no error to catch: the default directory IS
    writable, it just does not survive a redeploy. Only a warning can tell an
    operator that.
    """
    monkeypatch.delenv("UPLOAD_DIR", raising=False)

    assert check_upload_dir_at_startup() is False

    warnings = [r for r in storage_logs.records if r.levelno == logging.WARNING]
    assert warnings, "an ephemeral evidence store must be announced"
    message = warnings[0].getMessage()
    assert "UPLOAD_DIR" in message
    assert "silinecek" in message, "the warning must name the consequence"


def test_startup_check_accepts_a_mounted_volume(tmp_path, monkeypatch, storage_logs):
    volume = tmp_path / "data" / "uploads"
    monkeypatch.setenv("UPLOAD_DIR", str(volume))

    assert check_upload_dir_at_startup() is True

    assert volume.is_dir(), "the check must leave a usable directory behind"
    assert list(volume.iterdir()) == [], "the write probe must clean up after itself"
    assert not [r for r in storage_logs.records if r.levelno >= logging.WARNING]


# Permission bits do not stop the owner on Windows, and root ignores them
# everywhere — in both cases the read-only mount cannot be simulated.
_CAN_SIMULATE_READ_ONLY = os.name != "nt" and getattr(os, "geteuid", lambda: 0)() != 0


@pytest.mark.skipif(
    not _CAN_SIMULATE_READ_ONLY, reason="read-only directory not simulable here"
)
def test_startup_check_detects_a_read_only_volume(tmp_path, monkeypatch, storage_logs):
    """A mount that exists but refuses writes — os.path.isdir() would pass it."""
    mount = tmp_path / "readonly"
    mount.mkdir()
    mount.chmod(0o500)
    monkeypatch.setenv("UPLOAD_DIR", str(mount))

    try:
        assert check_upload_dir_at_startup() is False
        assert [r for r in storage_logs.records if r.levelno >= logging.ERROR]
    finally:
        # Otherwise pytest cannot clean the tmp directory up.
        mount.chmod(0o700)
