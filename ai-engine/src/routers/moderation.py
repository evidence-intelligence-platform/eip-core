"""
EIF: Evidence Moderation Router (Admin Only)
---
Version: 1.2.0
Owner: EIF Architecture Team
Compliance: 06_API_CONTRACTS.md — moderation layer;
01_ENGINEERING_CONSTITUTION.md Article II — an approval asserts that a human
actually examined the document.
---
Uploaded images and scanned PDFs enter the pipeline as review_status
"pending"; these endpoints are where a human accepts or rejects them.
Every endpoint requires role == "admin" — an employer moderating the
evidence of their own applicants would defeat the point.
"""

import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from src.db.database import get_session
from src.db.models import Candidate, Evidence, UserAccount
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_admin
from src.services.audit import record_audit
from src.services.email_service import evidence_review_email, send_email
from src.services.storage import load_upload, upload_exists

logger = logging.getLogger("eip.moderation")

router = APIRouter(
    prefix="/api/v1/moderation",
    tags=["moderation"],
    dependencies=[Depends(verify_api_key)],
)


class ModerationItem(BaseModel):
    """One evidence row as the moderation UI needs it — bytes stay on disk."""
    id: int
    candidate_external_id: str
    requirement_external_id: str
    source_type: str
    status: str
    confidence_score: int | None
    reasoning: str
    evidence_pointer: str | None
    review_status: str
    media_filename: str | None
    media_mime: str | None
    has_media: bool
    reviewed_by: str | None
    reviewed_at: datetime | None
    review_note: str | None


class ModerationListResponse(BaseModel):
    items: list[ModerationItem]
    total: int


class ReviewDecision(BaseModel):
    # Literal, not str: an unknown verdict must be a 422, never a silent write.
    review_status: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=2000)


# Shown to the admin when the document behind a row can no longer be opened.
MEDIA_UNAVAILABLE_DETAIL = (
    "Bu kanıtın belgesi sunucuda bulunamadı; görülemeyen bir belge "
    "onaylanamaz. Kaydı reddedebilir veya adaydan belgeyi yeniden "
    "yüklemesini isteyebilirsiniz."
)


def _candidate_account_email(session: Session, candidate_external_id: str) -> str | None:
    """
    The address behind the profile an evidence row was filed under, or None
    when there is nobody to reach: no profile with that external id, an
    unowned profile (user_id NULL), or an account deleted since the upload.
    Callers treat None as "skip the mail" — never as an error.
    """
    candidate = session.exec(
        select(Candidate).where(Candidate.external_id == candidate_external_id)
    ).first()
    if candidate is None or candidate.user_id is None:
        return None
    account = session.get(UserAccount, candidate.user_id)
    return account.email if account else None


def _send_review_email(to: str, document_label: str | None, decision: str, note: str | None) -> None:
    """
    Background task: tells the uploader what the moderator decided.

    Guarded end to end for the same reason as the application decision mail:
    the verdict and its audit row are already committed, so neither a template
    error nor a provider outage may surface in the request that queued it.
    Nothing logged here identifies the recipient.
    """
    try:
        subject, body_html = evidence_review_email(document_label, decision, note)
        send_email(to, subject, body_html)
    except Exception as exc:  # noqa: BLE001 — a notification may never escalate
        logger.warning("Kanıt inceleme bildirimi gönderilemedi. error=%r", exc)


def _to_item(evidence: Evidence) -> ModerationItem:
    return ModerationItem(
        id=evidence.id,
        candidate_external_id=evidence.candidate_external_id,
        requirement_external_id=evidence.requirement_external_id,
        source_type=evidence.source_type,
        status=evidence.status,
        confidence_score=evidence.confidence_score,
        reasoning=evidence.reasoning,
        evidence_pointer=evidence.evidence_pointer,
        review_status=evidence.review_status,
        media_filename=evidence.media_filename,
        media_mime=evidence.media_mime,
        has_media=evidence.media_path is not None,
        reviewed_by=evidence.reviewed_by,
        reviewed_at=evidence.reviewed_at,
        review_note=evidence.review_note,
    )


@router.get("/evidences", response_model=ModerationListResponse)
def list_evidences(
    review_status: Literal["pending", "approved", "rejected"] | None = Query(
        default=None, description="Filter by moderation state; omit for all."
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_admin),
) -> ModerationListResponse:
    """Paged moderation queue. `total` counts the filter, not the page."""
    filters = []
    if review_status is not None:
        filters.append(Evidence.review_status == review_status)

    total = session.exec(
        select(func.count()).select_from(Evidence).where(*filters)
    ).one()
    evidences = session.exec(
        select(Evidence)
        .where(*filters)
        .order_by(Evidence.created_at.desc(), Evidence.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return ModerationListResponse(items=[_to_item(e) for e in evidences], total=total)


@router.patch("/evidences/{evidence_id}", response_model=ModerationItem)
def review_evidence(
    evidence_id: int,
    decision: ReviewDecision,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_admin),
) -> ModerationItem:
    """
    Records the admin's verdict, along with who decided and when, and mails
    the uploader the outcome. A rejection reason used to exist only in this
    table: the candidate saw a document turn red with no way to learn what was
    wrong with it, which made re-uploading a guessing game.

    Approving is refused while the stored document cannot be opened: the
    verdict — and the AuditTrail row beside it — asserts that a human examined
    that file, and the panel's own media endpoint answers 404 for it, so the
    approval could only ever be blind. This is not hypothetical; every upload
    written to a non-persistent UPLOAD_DIR ends up exactly here after a
    redeploy (see src/services/storage.py), and "pending" is precisely the set
    that gets lost. Rejecting stays open — a record whose file is gone is
    legitimately rejectable, and blocking that would strand the queue.
    """
    evidence = session.get(Evidence, evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")

    # media_path is NULL for text extractions, which carry no document to look
    # at and are stored already approved; only rows that claim a file must
    # still have one. Checked before anything is written to the session, so a
    # refused approval leaves neither an Evidence update nor an audit row.
    if (
        decision.review_status == "approved"
        and evidence.media_path is not None
        and not upload_exists(evidence.media_path)
    ):
        # 409, not 404: the row exists and the caller may review it — the
        # server's state is what makes this particular verdict impossible.
        raise HTTPException(status_code=409, detail=MEDIA_UNAVAILABLE_DETAIL)

    evidence.review_status = decision.review_status
    evidence.reviewed_by = user.get("sub")
    evidence.reviewed_at = datetime.utcnow()
    evidence.review_note = decision.note
    session.add(evidence)
    # A moderation verdict carries legal weight: same-transaction audit row.
    record_audit(
        session,
        actor_id=user.get("sub", "unknown"),
        action=f"moderation.review.{decision.review_status}",
        target_entity=f"evidence:{evidence_id}",
        details=decision.note,
    )
    session.commit()
    session.refresh(evidence)

    # Queued after the commit, skipped when the profile has no reachable
    # account, and unable to fail the request (see _send_review_email).
    recipient = _candidate_account_email(session, evidence.candidate_external_id)
    if recipient:
        background_tasks.add_task(
            _send_review_email,
            recipient,
            # The uploader's own filename, so they know which document this is
            # about; text extractions carry none and the template says so.
            evidence.media_filename,
            evidence.review_status,
            evidence.review_note,
        )

    return _to_item(evidence)


@router.get("/evidences/{evidence_id}/media")
def get_evidence_media(
    evidence_id: int,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_admin),
) -> Response:
    """Streams the stored document so the admin can look at what they judge."""
    evidence = session.get(Evidence, evidence_id)
    if not evidence or not evidence.media_path:
        raise HTTPException(status_code=404, detail="Evidence has no stored media")

    try:
        data = load_upload(evidence.media_path)
    except (ValueError, FileNotFoundError, OSError):
        # A poisoned or stale media_path must read as "gone", not leak files.
        raise HTTPException(status_code=404, detail="Stored media not available")

    return Response(content=data, media_type=evidence.media_mime or "application/octet-stream")
