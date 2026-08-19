"""
EIF: Explainability Report Router
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance:
  - 06_API_CONTRACTS.md Section 2.3 — Fetch Explainability Report
  - 01_ENGINEERING_CONSTITUTION.md Article I — auditable explainability instead
    of a black-box score
  - 08_SECURITY_ARCHITECTURE.md — Zero Trust, object-level authorization
---
The match report is what the product actually sells, yet it existed only in the
browser: the UI fetched a profile and an evidence list and did the arithmetic
itself. Two things follow from that, and this module is what ends them.

  - The report was keyed by candidate, so one candidate's two applications
    rendered the identical report — the same percentage shown to two different
    employers about two different jobs.
  - The percentage an employer made a hiring decision on was computed on the
    client, could not be reproduced server-side, and was never written down.

The score is therefore computed here, the rows that entered it are marked
`counted`, and every generation leaves an ExplainabilityReport row behind.
"""

import json
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
)
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_user

router = APIRouter(
    prefix="/api/v1/reports",
    tags=["reports"],
    dependencies=[Depends(verify_api_key)],
)

# Publishing a posting mints exactly one criterion, "req_job_<job id>"
# (jobs.py). Everything else — "req_general_cv" and friends — is job-neutral
# evidence about the person, not about one employer's opening.
_JOB_REQUIREMENT_PATTERN = re.compile(r"^req_job_(\d+)$")

# Legacy rows predate the moderation column and were always shown; the model
# default has said "approved" ever since, so a missing value means the same.
_APPROVED = "approved"

# A posting can exist without a resolved Company row (company_id is nullable),
# and the contract types company_name as a string — so the report carries a
# placeholder rather than a null the UI would render as a blank employer.
_UNKNOWN_COMPANY = "Şirket belirtilmemiş"

# ExtractionResult.confidence_score's own field description: "Below 85 should
# require human review." Nothing upstream currently routes a low-confidence
# VERIFIED/CONTRADICTION text extraction into the moderation queue, so a
# candidate, employer, or admin would otherwise never learn the score moved
# on an uncertain call — a straight Uncertainty Reporting violation. Until
# that routing exists, the report itself says so.
_CONFIDENCE_REVIEW_THRESHOLD = 85

# Shown to every reader (candidate, employer, admin) when at least one
# counted row's confidence sits below the threshold above — the AI is
# uncertain, and a human has not yet re-checked that specific row.
_LOW_CONFIDENCE_NOTE = (
    "Bu adayın onaylı kanıtlarından bazılarında modelin güven skoru düşük; "
    "bu satırlar henüz ayrıca insan incelemesinden geçmedi ve sonucu "
    "temkinli değerlendirmenizi öneririz."
)

# Shown to every reader when the candidate has evidence still sitting in the
# moderation queue — without revealing what it is — so a low or unchanged
# score is not mistaken for "nothing was submitted".
_PENDING_EVIDENCE_NOTE = (
    "Bu adayın incelenmekte olan ek belgeleri var; onaylandığında uyum "
    "oranı güncellenebilir."
)


class ReportItem(BaseModel):
    """One evidence row as it appears in the report matrix."""
    requirement_external_id: str
    requirement_description: str | None = None
    status: str
    confidence_score: int | None = None
    reasoning: str
    evidence_pointer: str | None = None
    review_status: str
    # Whether this row entered the denominator of evidence_score. Making the
    # arithmetic inspectable is the whole point: a candidate must be able to
    # see that their pending upload is the reason the percentage has not moved.
    counted: bool
    # True for a counted row whose model confidence sits below the
    # documented human-review threshold (see _CONFIDENCE_REVIEW_THRESHOLD) —
    # it was auto-approved as text evidence but the model itself was not sure.
    low_confidence: bool


class ExplainabilityReportRead(BaseModel):
    """
    The report as 06_API_CONTRACTS.md Section 2.3 promises it: the application,
    the job it is about, and the evidence matrix behind the score.
    """
    application_id: int
    job_id: int
    job_title: str
    company_name: str
    candidate_external_id: str
    candidate_name: str | None = None
    application_status: str
    generated_at: str
    evidence_score: int
    verified_count: int
    counted_count: int
    items: list[ReportItem]
    # Transparency flags, deliberately readable by the employer too (no
    # document content leaks — just "something else is happening here"), so
    # a low or 0% score is never mistaken for "the candidate submitted
    # nothing" or "the AI is certain this candidate falls short".
    has_pending_evidence: bool
    has_low_confidence_evidence: bool
    pending_evidence_note: str | None = None
    low_confidence_note: str | None = None


def _review_status(evidence: Evidence) -> str:
    """Normalizes the moderation state; see _APPROVED."""
    return evidence.review_status or _APPROVED


def _concerns_job(requirement_external_id: str, job_id: int) -> bool:
    """
    Whether a piece of evidence belongs in *this* job's report.

    Evidence filed against another posting's criterion is both irrelevant here
    and none of this employer's business — it was submitted to a competitor.
    Job-neutral evidence (a CV, a certificate) describes the person and counts
    everywhere, which is what keeps a fresh application from reading as 0%.
    """
    match = _JOB_REQUIREMENT_PATTERN.match(requirement_external_id)
    return match is None or int(match.group(1)) == job_id


def _evidence_score(verified_count: int, counted_count: int) -> int:
    """
    Verified share of the moderation-approved evidence, as a whole percent.

    Integer half-up rounding, deliberately: the client used Math.round, and a
    score that shifted by a point the day it moved to the server would look
    like the platform had re-judged people. Nothing to divide by — an
    application whose evidence is all still awaiting review — is 0, never a
    crash and never a flattering default.
    """
    if counted_count <= 0:
        return 0
    return (verified_count * 200 + counted_count) // (2 * counted_count)


def _assert_may_read_report(
    candidate: Candidate,
    job: JobPosting,
    user: CurrentUser,
) -> None:
    """
    Object-level authorization for one report (BOLA guard).

    Application ids are small sequential integers and the report carries a
    person's name, their documents' reasoning and their match percentage, so
    the role check alone would hand the entire pipeline of every employer to
    anyone who counted upwards. Three parties have business here: the candidate
    the report is about, the employer who published the posting, and admins.

    Postings with no recorded creator (created_by_user_id IS NULL — rows that
    predate ownership tracking) stay readable by any employer, exactly as the
    application list and the candidate roster already treat them. Those two
    surfaces are where a report link is opened from; a stricter rule here would
    403 on rows the employer's own dashboard is showing them.
    """
    if user.get("role") == "admin":
        return
    if candidate.user_id is not None and candidate.user_id == user.get("user_id"):
        return
    if user.get("role") == "employer":
        if job.created_by_user_id is None or job.created_by_user_id == user.get("user_id"):
            return
    raise HTTPException(
        status_code=403,
        detail="Bu başvuruya ait raporu görüntüleme yetkiniz yok.",
    )


def _persist_report(
    session: Session,
    application: JobApplication,
    candidate: Candidate,
    items: list[ReportItem],
    evidence_score: int,
    verified_count: int,
    counted_count: int,
    final_summary: str,
) -> None:
    """
    Writes the generated report down, one row per application.

    What is stored is the COMPLETE matrix, never the caller's filtered view: an
    employer opening the report must not overwrite the audit record with the
    redacted copy they are allowed to see. The row is keyed by application_id —
    keying it by candidate is the original defect, since a candidate's second
    application would then overwrite the first one's record — and any duplicate
    left behind by earlier writes is collapsed, so "the report of application N"
    stays a single fact.
    """
    rows = session.exec(
        select(ExplainabilityReport)
        .where(ExplainabilityReport.application_id == application.id)
        .order_by(ExplainabilityReport.id)
    ).all()

    matrix = json.dumps(
        {
            "application_id": application.id,
            "job_id": application.job_id,
            "evidence_score": evidence_score,
            "verified_count": verified_count,
            "counted_count": counted_count,
            "items": [item.model_dump() for item in items],
        },
        ensure_ascii=False,
    )

    if rows:
        report = rows[0]
        report.candidate_external_id = candidate.external_id
        report.match_matrix = matrix
        report.final_summary = final_summary
    else:
        report = ExplainabilityReport(
            application_id=application.id,
            candidate_external_id=candidate.external_id,
            match_matrix=matrix,
            final_summary=final_summary,
        )
    session.add(report)
    for duplicate in rows[1:]:
        session.delete(duplicate)
    session.commit()


def _final_summary(job_title: str, verified_count: int, counted_count: int, evidence_score: int) -> str:
    """The one-line verdict stored with the report and shown to the reader."""
    if counted_count == 0:
        return (
            f"{job_title} ilanı için değerlendirmeye giren onaylı kanıt bulunmuyor; "
            "uyum oranı %0 olarak raporlandı."
        )
    return (
        f"{job_title} ilanı için değerlendirmeye giren {counted_count} kanıt satırının "
        f"{verified_count} tanesi doğrulandı; kanıta dayalı uyum oranı %{evidence_score}."
    )


@router.get(
    "/{application_id}",
    response_model=ExplainabilityReportRead,
    summary="Explainability report for a single application",
)
def get_application_report(
    application_id: int,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
) -> ExplainabilityReportRead:
    """
    Builds — and records — the explainability report behind one application.

    The report is scoped to the application, so the same candidate applying to
    two postings gets two reports: each carries that posting's own evidence
    plus the job-neutral evidence about the person, never the criterion-bound
    evidence submitted to another employer.

    Visibility: an employer is shown approved evidence only, which is the
    promise made to the candidate at upload time (the moderation queue exists
    because a photographed document is trivial to doctor). The candidate and
    admins see every row, with the unreviewed ones marked counted=false. The
    score itself is identical for all three — only approved rows ever enter it,
    so nobody is quoted a percentage the employer cannot see.

    has_pending_evidence and has_low_confidence_evidence are the one exception
    to "employer sees approved rows only": they are booleans, not document
    content, and exist so a low or 0% score is never mistaken for "this
    candidate submitted nothing" (pending) or "the AI is sure this candidate
    falls short" (a counted row the model itself was not confident about).
    """
    application = session.get(JobApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Başvuru bulunamadı.")

    candidate = session.get(Candidate, application.candidate_id)
    job = session.get(JobPosting, application.job_id)
    # Neither is optional for a report: without the posting there is no owner
    # to authorize against, and without the profile there is no identity whose
    # evidence this would be. A dangling row is a missing report, not a
    # half-built one served to whoever asked.
    if candidate is None or job is None:
        raise HTTPException(status_code=404, detail="Başvuru bulunamadı.")

    _assert_may_read_report(candidate, job, user)

    evidences = session.exec(
        select(Evidence)
        .where(Evidence.candidate_external_id == candidate.external_id)
        .order_by(Evidence.created_at, Evidence.id)
    ).all()
    # The job filter runs here rather than in SQL: "not another posting's
    # criterion" is a pattern match, and a candidate's evidence set is small
    # enough that portability across SQLite and PostgreSQL is worth more.
    evidences = [e for e in evidences if _concerns_job(e.requirement_external_id, job.id)]

    descriptions: dict[str, str] = {}
    requirement_ids = {e.requirement_external_id for e in evidences}
    if requirement_ids:
        descriptions = {
            row.external_id: row.description
            for row in session.exec(
                select(Requirement).where(Requirement.external_id.in_(requirement_ids))
            ).all()
        }

    items = [
        ReportItem(
            requirement_external_id=e.requirement_external_id,
            requirement_description=descriptions.get(e.requirement_external_id),
            status=e.status,
            confidence_score=e.confidence_score,
            reasoning=e.reasoning,
            evidence_pointer=e.evidence_pointer,
            review_status=_review_status(e),
            # The denominator, stated once: a row counts when a human has
            # cleared it. Pending and rejected uploads describe nothing yet.
            counted=_review_status(e) == _APPROVED,
            # Counted rows are auto-approved when the source is plain text
            # (see Evidence.review_status default); a human has not looked at
            # this specific verdict if the model itself scored it low.
            low_confidence=(
                _review_status(e) == _APPROVED
                and e.confidence_score is not None
                and e.confidence_score < _CONFIDENCE_REVIEW_THRESHOLD
            ),
        )
        for e in evidences
    ]

    counted_count = sum(1 for item in items if item.counted)
    verified_count = sum(1 for item in items if item.counted and item.status == "VERIFIED")
    evidence_score = _evidence_score(verified_count, counted_count)

    has_pending_evidence = any(item.review_status == "pending" for item in items)
    has_low_confidence_evidence = any(item.counted and item.low_confidence for item in items)

    company = session.get(Company, job.company_id) if job.company_id else None
    company_name = company.name if company and company.name else _UNKNOWN_COMPANY
    summary = _final_summary(job.title, verified_count, counted_count, evidence_score)

    _persist_report(
        session,
        application=application,
        candidate=candidate,
        items=items,
        evidence_score=evidence_score,
        verified_count=verified_count,
        counted_count=counted_count,
        final_summary=summary,
    )

    # Same gate as GET /candidates/{id}/evidences: only the moderating admins
    # and the candidate the record is about may see a row human review has not
    # cleared. The counts above are deliberately computed BEFORE this filter —
    # unreviewed rows never entered them, so both readers are quoted the same
    # percentage over the same denominator.
    is_admin = user.get("role") == "admin"
    is_subject = candidate.user_id is not None and candidate.user_id == user.get("user_id")
    visible_items = items if (is_admin or is_subject) else [i for i in items if i.counted]

    return ExplainabilityReportRead(
        application_id=application.id,
        job_id=job.id,
        job_title=job.title,
        company_name=company_name,
        candidate_external_id=candidate.external_id,
        candidate_name=candidate.name,
        application_status=application.status,
        generated_at=datetime.now(UTC).isoformat(),
        evidence_score=evidence_score,
        verified_count=verified_count,
        counted_count=counted_count,
        items=visible_items,
        has_pending_evidence=has_pending_evidence,
        has_low_confidence_evidence=has_low_confidence_evidence,
        pending_evidence_note=_PENDING_EVIDENCE_NOTE if has_pending_evidence else None,
        low_confidence_note=_LOW_CONFIDENCE_NOTE if has_low_confidence_evidence else None,
    )
