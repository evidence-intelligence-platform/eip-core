"""
EIF: Applicant standout traits.
---
The employer dashboard shows 2-3 short "standout traits" next to each
applicant so a recruiter reads the highlight before opening the CV. Two
layers, best-first:

  1. AI skill phrases — an LLM summarizes the applicant's VERIFIED evidence
     reasoning into concrete skills ("Güçlü React deneyimi"). This is the
     real signal, and the showcase for any model-provider partnership.
  2. Deterministic fallback — if no model is configured, quota is exhausted,
     or the call errors, fall back to which document types verified
     ("Sertifika/belge doğrulandı"). Always available, never blocks.

The result is cached on the JobApplication row (JSON string) so the model is
called at most once per applicant, not on every dashboard load.
"""

import json
import re

from sqlmodel import Session, or_, select

from src.db.models import Evidence, JobApplication

# Publishing a posting mints exactly one criterion, "req_job_<job id>"
# (jobs.py / routers/reports.py). Everything else — "req_general_cv" and
# friends — is job-neutral evidence about the person and is fair game for
# every employer's dashboard.
_JOB_REQUIREMENT_PATTERN = re.compile(r"^req_job_(\d+)$")


def _concerns_job(requirement_external_id: str, job_id: int) -> bool:
    """
    Same rule reports.py's `_concerns_job` enforces: evidence filed against
    another posting's job-specific criterion (a shift report, an incident
    description, a client name quoted in `reasoning`) was submitted to a
    competitor and must never be summarized onto this employer's dashboard.
    Job-neutral evidence (a CV, a certificate) describes the person and is
    visible everywhere.
    """
    match = _JOB_REQUIREMENT_PATTERN.match(requirement_external_id)
    return match is None or int(match.group(1)) == job_id


# What each verified source proves, in the employer's language — the
# deterministic fallback when no AI summary is available.
_SOURCE_TRAIT_LABELS: dict[str, str] = {
    "PDF_RESUME": "Özgeçmiş doğrulandı",
    "CERTIFICATE_LICENSE": "Sertifika/belge doğrulandı",
    "LINKEDIN_URL": "Profil doğrulandı",
    "PORTFOLIO_LINK": "Portföy doğrulandı",
    "CHATGPT_EXPORT": "Çalışma geçmişi doğrulandı",
}

# Lazily-created LLM service; None when GEMINI_API_KEY is unset (tests, local
# runs without a key) so trait enrichment silently uses the fallback.
_llm_service = None
_llm_tried = False


def _get_llm():
    global _llm_service, _llm_tried
    if _llm_tried:
        return _llm_service
    _llm_tried = True
    try:
        # Same provider seam as extraction, so a partnership switch applies to
        # standout traits too.
        from src.services.llm_factory import get_llm_service

        _llm_service = get_llm_service()
    except Exception:
        _llm_service = None
    return _llm_service


def _verified_evidence(session: Session, external_id: str, job_id: int) -> list[Evidence]:
    rows = session.exec(
        select(Evidence)
        .where(Evidence.candidate_external_id == external_id)
        .where(Evidence.status == "VERIFIED")
        .where(or_(Evidence.review_status == "approved", Evidence.review_status.is_(None)))
    ).all()
    # Same job-neutral-vs-job-specific scoping as reports.py: a trait derived
    # from evidence submitted against another employer's posting must not
    # surface here. Filtered in Python, not SQL, for the same reason
    # reports.py does — "not another posting's criterion" is a pattern match
    # over a small per-candidate row set.
    rows = [e for e in rows if _concerns_job(e.requirement_external_id, job_id)]
    rows.sort(key=lambda e: (e.confidence_score or 0), reverse=True)
    return rows


def _deterministic(evidences: list[Evidence]) -> list[str]:
    out: list[str] = []
    for ev in evidences:
        label = _SOURCE_TRAIT_LABELS.get(ev.source_type)
        if label and label not in out and len(out) < 3:
            out.append(label)
    return out


def standout_traits_for(session: Session, application: JobApplication, external_id: str) -> list[str]:
    """
    Returns (and caches) the standout traits for one application. Cached value
    is reused; otherwise the AI summary is tried, then the deterministic
    fallback. Commits the cache so the next load is instant.
    """
    if application.standout_traits is not None:
        try:
            return json.loads(application.standout_traits)
        except (ValueError, TypeError):
            pass  # corrupt cache — recompute below

    evidences = _verified_evidence(session, external_id, application.job_id)
    if not evidences:
        # Nothing verified yet; cache the empty result so we don't re-scan.
        application.standout_traits = "[]"
        session.add(application)
        session.commit()
        return []

    traits: list[str] = []
    llm = _get_llm()
    if llm is not None:
        traits = llm.summarize_traits([e.reasoning for e in evidences])
    if not traits:
        traits = _deterministic(evidences)

    application.standout_traits = json.dumps(traits, ensure_ascii=False)
    session.add(application)
    session.commit()
    return traits
