"""
EIF: Job Posting Router
---
Version: 1.0.1
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md — JOBS Entity
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import List, Optional
from src.db.database import get_session
from src.db.models import JobPosting, Company

router = APIRouter(
    prefix="/api/v1/jobs",
    tags=["job-postings"],
)


class JobCreate(BaseModel):
    company_name: Optional[str] = "Acme Corp"
    company_id: Optional[int] = None
    title: str
    description: str
    status: Optional[str] = "active"


@router.get("/", response_model=List[JobPosting], summary="List all active job postings")
def list_jobs(session: Session = Depends(get_session)) -> List[JobPosting]:
    """Returns all active job postings."""
    jobs = session.exec(select(JobPosting).where(JobPosting.status == "active")).all()
    return jobs


@router.post("/", response_model=JobPosting, status_code=status.HTTP_201_CREATED, summary="Create a new job posting")
def create_job(job_in: JobCreate, session: Session = Depends(get_session)) -> JobPosting:
    """Creates a new job posting."""
    company_id = job_in.company_id

    # Ensure company exists if name given and company_id not explicitly provided
    if not company_id and job_in.company_name:
        company = session.exec(select(Company).where(Company.name == job_in.company_name)).first()
        if not company:
            company = Company(name=job_in.company_name, industry="Technology")
            session.add(company)
            session.commit()
            session.refresh(company)
        company_id = company.id

    job = JobPosting(
        company_id=company_id,
        title=job_in.title,
        description=job_in.description,
        status=job_in.status or "active",
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobPosting, summary="Get single job posting by ID")
def get_job(job_id: int, session: Session = Depends(get_session)) -> JobPosting:
    """Retrieves a single job posting by ID."""
    job = session.exec(select(JobPosting).where(JobPosting.id == job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job posting {job_id} not found.")
    return job
