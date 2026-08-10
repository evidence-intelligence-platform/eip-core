"""
EIF: Job Posting Router
---
Version: 1.0.1
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md — JOBS Entity
"""


from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import Company, JobPosting, Requirement, UserAccount
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_employer

router = APIRouter(
    prefix="/api/v1/jobs",
    tags=["job-postings"],
    dependencies=[Depends(verify_api_key)],
)


class JobCreate(BaseModel):
    company_name: str | None = None
    company_id: int | None = None
    title: str
    description: str
    status: str | None = "active"
    # Was missing entirely, so Pydantic dropped whatever the dashboard sent
    # and every sector filter returned nothing.
    category: str | None = "OTHER"


class JobPostingRead(BaseModel):
    """A posting plus its company name, which the UI showed as a placeholder."""
    id: int
    company_id: int | None = None
    company_name: str | None = None
    title: str
    description: str
    category: str
    status: str
    created_at: datetime


def _to_read(job: JobPosting, company: Company | None) -> JobPostingRead:
    return JobPostingRead(
        id=job.id,
        company_id=job.company_id,
        company_name=company.name if company else None,
        title=job.title,
        description=job.description,
        category=job.category,
        status=job.status,
        created_at=job.created_at,
    )


@router.get("/", response_model=list[JobPostingRead], summary="List all active job postings")
def list_jobs(session: Session = Depends(get_session)) -> list[JobPostingRead]:
    """Returns all active job postings. Public: job seekers browse before signing up."""
    rows = session.exec(
        select(JobPosting, Company)
        .join(Company, Company.id == JobPosting.company_id, isouter=True)
        .where(JobPosting.status == "active")
    ).all()
    return [_to_read(job, company) for job, company in rows]


@router.post("/", response_model=JobPostingRead, status_code=status.HTTP_201_CREATED, summary="Create a new job posting")
def create_job(
    job_in: JobCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
) -> JobPostingRead:
    """Creates a new job posting. Employers only."""
    company_id = job_in.company_id

    # Single company identity: the posting is published as the company the
    # employer REGISTERED (with its tax number), never a free-text name typed
    # at posting time. Otherwise "Acme A.Ş." could register and then post as
    # "Başka Şirket", and the verifiable-entity promise would be a lie. The
    # request body's company_name is ignored for employers with a profile.
    account = session.get(UserAccount, user.get("user_id"))
    registered_name = account.company_name if account and account.company_name else None
    company_name = registered_name or job_in.company_name

    if not company_id and company_name:
        company = session.exec(select(Company).where(Company.name == company_name)).first()
        if not company:
            # No hardcoded "Technology": this platform serves every sector.
            company = Company(name=company_name, industry=job_in.category or "OTHER")
            session.add(company)
            session.commit()
            session.refresh(company)
        company_id = company.id

    job = JobPosting(
        company_id=company_id,
        # Ownership is recorded so KVKK account deletion can find the
        # employer's postings later; company_name alone proves nothing.
        created_by_user_id=user.get("user_id"),
        title=job_in.title,
        description=job_in.description,
        category=job_in.category or "OTHER",
        status=job_in.status or "active",
    )
    session.add(job)
    # Flush, don't commit: the id is needed to key the requirement, but the
    # posting and the criterion it is graded by are one fact. Committing them
    # separately meant anything that broke the second insert — a colliding
    # "req_job_<id>" row — left a live, publicly listed posting behind whose
    # evaluation criterion was somebody else's text.
    session.flush()

    # The AI needs something job-specific to evaluate against; without this the
    # engine fell back to a generic "technical requirement" for every applicant.
    requirement = Requirement(
        external_id=f"req_job_{job.id}",
        description=job.description,
    )
    session.add(requirement)
    session.commit()
    session.refresh(job)

    company = session.get(Company, job.company_id) if job.company_id else None
    return _to_read(job, company)


@router.get("/{job_id}", response_model=JobPostingRead, summary="Get single job posting by ID")
def get_job(job_id: int, session: Session = Depends(get_session)) -> JobPostingRead:
    """Retrieves a single job posting by ID."""
    job = session.exec(select(JobPosting).where(JobPosting.id == job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job posting {job_id} not found.")
    company = session.get(Company, job.company_id) if job.company_id else None
    return _to_read(job, company)
