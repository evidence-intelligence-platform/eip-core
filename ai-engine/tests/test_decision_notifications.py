"""
EIF: Decision Notification Tests
---
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III — every behaviour is
pinned by a test; 08_SECURITY_ARCHITECTURE.md Section 6 — operational mail
carries no more than the person it is addressed to already knows.
---
Two verdicts used to live only inside the platform's own screens: the
employer's accept/decline, and the moderator's approve/reject on an uploaded
document. A candidate learned about the first by logging in and noticing, and
about the second not at all — a rejected document turned red with no reason
attached, which makes re-uploading a guessing game.

Both now mail the candidate. These tests pin the parts that are easy to break
later: the right template reaches the right address, the rejection reason
travels with the rejection, and — most importantly — the mail is a side effect
the decision does not depend on. An account with no address, a provider
outage, or no RESEND_API_KEY at all must leave the API answer and the stored
verdict exactly as they were.
"""

import logging
import uuid

import pytest
from sqlmodel import Session, select

from src.db.models import AuditTrail, Candidate, Evidence, JobApplication, JobPosting
from src.routers import applications as applications_router
from src.routers import moderation as moderation_router
from src.services.email_service import application_decision_email, evidence_review_email
from tests.conftest import TEST_ENGINE

# The employer fixture (`client`) owns the postings created below; the
# candidate fixture's account is the recipient every notification must reach.
EMPLOYER_USER_ID = 900
CANDIDATE_USER_ID = 901
CANDIDATE_EMAIL = "candidate@test.local"


@pytest.fixture(autouse=True)
def _no_provider_key(monkeypatch):
    """
    A developer's own RESEND_API_KEY would turn the unpatched paths below into
    real deliveries to a real inbox. Start without one, exactly as CI runs.
    """
    monkeypatch.delenv("RESEND_API_KEY", raising=False)


@pytest.fixture()
def outbox(monkeypatch):
    """
    Captures (to, subject, html) instead of delivering anything.

    Patched at each router's imported symbol — the same seam the password
    reset tests use — so the guard wrapper around the send still runs.
    """
    sent: list[tuple[str, str, str]] = []

    def _capture(to: str, subject: str, html: str) -> bool:
        sent.append((to, subject, html))
        return True

    monkeypatch.setattr(applications_router, "send_email", _capture)
    monkeypatch.setattr(moderation_router, "send_email", _capture)
    return sent


@pytest.fixture()
def broken_mailer(monkeypatch):
    """
    Every delivery raises. send_email never does in production, but a future
    provider swap could — and a decision that has already been committed must
    not be reported as a failure because a mail server was down.
    """

    def _explode(to: str, subject: str, html: str) -> bool:
        raise RuntimeError("provider unreachable")

    monkeypatch.setattr(applications_router, "send_email", _explode)
    monkeypatch.setattr(moderation_router, "send_email", _explode)


def _application_for(user_id: int | None, title: str = "Bildirim Testi İlanı") -> int:
    """
    One application into a posting the employer fixture owns, filed by a
    candidate profile owned by `user_id` (None = an unowned/legacy profile).
    """
    external_id = f"cand_notify_{uuid.uuid4().hex[:8]}"
    with Session(TEST_ENGINE) as session:
        candidate = Candidate(external_id=external_id, user_id=user_id, name="Bildirim Adayı")
        job = JobPosting(
            title=title,
            description="Karar bildirimi testleri için ilan.",
            created_by_user_id=EMPLOYER_USER_ID,
        )
        session.add(candidate)
        session.add(job)
        session.flush()
        application = JobApplication(candidate_id=candidate.id, job_id=job.id)
        session.add(application)
        session.commit()
        return application.id


def _pending_evidence_for(user_id: int | None, **overrides) -> int:
    """A pending evidence row plus the candidate profile it is filed under."""
    external_id = f"cand_review_{uuid.uuid4().hex[:8]}"
    fields = dict(
        candidate_external_id=external_id,
        requirement_external_id="req_notify_1",
        source_type="IMAGE_DOCUMENT",
        status="VERIFIED",
        confidence_score=91,
        reasoning="Bildirim testleri için eklenen kayıt.",
        review_status="pending",
    )
    fields.update(overrides)
    with Session(TEST_ENGINE) as session:
        session.add(Candidate(external_id=external_id, user_id=user_id, name="Bildirim Adayı"))
        evidence = Evidence(**fields)
        session.add(evidence)
        session.commit()
        return evidence.id


def _application_status(app_id: int) -> str:
    with Session(TEST_ENGINE) as session:
        return session.get(JobApplication, app_id).status


def _review_status(evidence_id: int) -> str:
    with Session(TEST_ENGINE) as session:
        return session.get(Evidence, evidence_id).review_status


# ── Application decisions ────────────────────────────────────────────────────


def test_accepted_application_mails_the_candidate(client, outbox):
    app_id = _application_for(CANDIDATE_USER_ID, title="Baş Aşçı")

    resp = client.patch(f"/api/v1/applications/{app_id}", json={"status": "accepted"})
    assert resp.status_code == 200, resp.text

    assert len(outbox) == 1
    to, subject, body = outbox[0]
    assert to == CANDIDATE_EMAIL
    assert "kabul edildi" in subject
    # The posting is named in the body, never in the subject: send_email logs
    # the subject on every path, and "masked address + named posting + verdict"
    # is a great deal more than the flow name that line exists to record.
    assert "Baş Aşçı" not in subject
    assert "Baş Aşçı" in body
    assert "/candidate/hub" in body


def test_declined_application_carries_the_employers_note(client, outbox):
    app_id = _application_for(CANDIDATE_USER_ID)

    resp = client.patch(
        f"/api/v1/applications/{app_id}",
        json={"status": "declined", "note": "Aradığımız deneyim süresi karşılanmıyor."},
    )
    assert resp.status_code == 200, resp.text

    to, subject, body = outbox[0]
    assert to == CANDIDATE_EMAIL
    assert "olumsuz" in subject
    assert "Aradığımız deneyim süresi karşılanmıyor." in body


def test_decision_note_is_kept_in_the_audit_trail(client, outbox):
    """
    The note is not a column on the application, so the audit row is the only
    place it survives — a decision and the reason given for it must stay
    together after the mail has been delivered and forgotten.
    """
    app_id = _application_for(CANDIDATE_USER_ID)

    resp = client.patch(
        f"/api/v1/applications/{app_id}",
        json={"status": "declined", "note": "Pozisyon dolduruldu."},
    )
    assert resp.status_code == 200, resp.text

    with Session(TEST_ENGINE) as session:
        entry = session.exec(
            select(AuditTrail).where(AuditTrail.target_entity == f"application:{app_id}")
        ).first()
    assert entry is not None
    assert entry.action == "application.decision.declined"
    assert entry.details == "Pozisyon dolduruldu."


def test_intermediate_status_change_sends_no_mail(client, outbox):
    """
    "reviewing" is pipeline bookkeeping the candidate cannot act on. Mailing it
    would train people to ignore the one message that decides their application.
    """
    app_id = _application_for(CANDIDATE_USER_ID)

    resp = client.patch(f"/api/v1/applications/{app_id}", json={"status": "reviewing"})
    assert resp.status_code == 200, resp.text
    assert outbox == []


def test_application_without_an_owning_account_is_still_decided(client, outbox):
    """Legacy profiles carry no user_id; there is nobody to mail, and that is fine."""
    app_id = _application_for(None)

    resp = client.patch(f"/api/v1/applications/{app_id}", json={"status": "accepted"})
    assert resp.status_code == 200, resp.text
    assert outbox == []
    assert _application_status(app_id) == "accepted"


def test_decision_survives_a_broken_mailer(client, broken_mailer):
    """The verdict is committed before the mail is queued; it must stand alone."""
    app_id = _application_for(CANDIDATE_USER_ID)

    resp = client.patch(f"/api/v1/applications/{app_id}", json={"status": "declined"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "declined"
    assert _application_status(app_id) == "declined"


def test_decision_completes_with_no_provider_key(client, caplog):
    """
    Nothing is patched here: the real e-mail service runs its no-provider
    fallback, which is what every local machine and the test suite itself use.
    """
    caplog.set_level(logging.INFO, logger="eip.email")
    app_id = _application_for(CANDIDATE_USER_ID)

    resp = client.patch(f"/api/v1/applications/{app_id}", json={"status": "accepted"})
    assert resp.status_code == 200, resp.text
    assert _application_status(app_id) == "accepted"
    # The attempt is visible, the recipient is not.
    assert "RESEND_API_KEY yok" in caplog.text
    assert CANDIDATE_EMAIL not in caplog.text


# ── Moderation verdicts ─────────────────────────────────────────────────────


def test_evidence_approval_mails_the_uploader(admin_client, outbox):
    # media_path NULL is a text extraction: nothing on disk to look at, so the
    # approval is not blocked by the missing-media guard.
    evidence_id = _pending_evidence_for(CANDIDATE_USER_ID, source_type="TEXT")

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}", json={"review_status": "approved"}
    )
    assert resp.status_code == 200, resp.text

    assert len(outbox) == 1
    to, subject, body = outbox[0]
    assert to == CANDIDATE_EMAIL
    assert "onaylandı" in subject
    assert "/candidate/hub" in body


def test_evidence_rejection_explains_why(admin_client, outbox):
    evidence_id = _pending_evidence_for(
        CANDIDATE_USER_ID,
        media_path="silinmis/diploma.pdf",
        media_filename="diploma.pdf",
        media_mime="application/pdf",
    )

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "rejected", "note": "Belgenin tarihi okunmuyor."},
    )
    assert resp.status_code == 200, resp.text

    to, subject, body = outbox[0]
    assert to == CANDIDATE_EMAIL
    assert "reddedildi" in subject
    # Which document, and what was wrong with it — the two things the candidate
    # previously had no way to learn.
    assert "diploma.pdf" in body
    assert "Belgenin tarihi okunmuyor." in body


def test_evidence_review_without_an_owning_account_still_succeeds(admin_client, outbox):
    evidence_id = _pending_evidence_for(None, source_type="TEXT")

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}", json={"review_status": "approved"}
    )
    assert resp.status_code == 200, resp.text
    assert outbox == []
    assert _review_status(evidence_id) == "approved"


def test_evidence_review_survives_a_broken_mailer(admin_client, broken_mailer):
    evidence_id = _pending_evidence_for(CANDIDATE_USER_ID, source_type="TEXT")

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}",
        json={"review_status": "rejected", "note": "Eksik belge."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["review_status"] == "rejected"
    assert _review_status(evidence_id) == "rejected"


def test_evidence_review_completes_with_no_provider_key(admin_client, caplog):
    caplog.set_level(logging.INFO, logger="eip.email")
    evidence_id = _pending_evidence_for(CANDIDATE_USER_ID, source_type="TEXT")

    resp = admin_client.patch(
        f"/api/v1/moderation/evidences/{evidence_id}", json={"review_status": "approved"}
    )
    assert resp.status_code == 200, resp.text
    assert _review_status(evidence_id) == "approved"
    assert "RESEND_API_KEY yok" in caplog.text
    assert CANDIDATE_EMAIL not in caplog.text


# ── Templates ───────────────────────────────────────────────────────────────


def test_templates_escape_text_written_by_other_users(monkeypatch):
    """
    A posting title and a review note are free text written by an employer or
    an admin, and the mail arrives from the platform's own sending domain —
    the same markup-injection vector welcome_email's display name closed.
    """
    payload = "<script>alert('x')</script>"

    _, decision_html = application_decision_email(payload, "accepted", note=payload)
    _, review_html = evidence_review_email(payload, "rejected", note=payload)

    for body in (decision_html, review_html):
        assert "<script>" not in body
        assert "&lt;script&gt;" in body


def test_notification_links_follow_the_configured_frontend(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://eip.example/")

    _, decision_html = application_decision_email("Aşçı", "declined")
    _, review_html = evidence_review_email("belge.pdf", "approved")

    assert 'href="https://eip.example/candidate/hub"' in decision_html
    assert 'href="https://eip.example/candidate/hub"' in review_html


def test_missing_job_title_still_reads_as_a_sentence():
    """A posting deleted between the decision and the mail leaves no title."""
    _, body = application_decision_email(None, "accepted")

    assert "Bir ilana yaptığınız başvuru" in body
    assert "&laquo;" not in body  # no empty quotation marks


def test_missing_document_label_still_reads_as_a_sentence():
    """Text extractions have no stored filename to name."""
    _, body = evidence_review_email(None, "approved")

    assert "Yüklediğiniz belge" in body
    assert "&laquo;" not in body
