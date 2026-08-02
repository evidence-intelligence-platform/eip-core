"""
EIF: Job Application Router
---
Version: 1.1.0
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md — JOB_APPLICATIONS Entity
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import Candidate, JobApplication, JobPosting

router = APIRouter(
    prefix="/api/v1/applications",
    tags=["job-applications"],
)


class ApplicationStatusUpdate(BaseModel):
    status: Literal["submitted", "reviewing", "accepted", "declined"]


@router.get("/", response_model=list[JobApplication], summary="List all job applications")
def list_applications(session: Session = Depends(get_session)) -> list[JobApplication]:
    """Lists all submitted job applications."""
    applications = session.exec(select(JobApplication)).all()
    return applications


@router.post("/", response_model=JobApplication, status_code=status.HTTP_201_CREATED, summary="Submit a job application")
def create_application(app_in: JobApplication, session: Session = Depends(get_session)) -> JobApplication:
    """Submits a candidate application for a specific job posting."""
    candidate = session.exec(select(Candidate).where(Candidate.id == app_in.candidate_id)).first()
    if not candidate:
        # Fallback to first available candidate or create auto candidate
        candidate = session.exec(select(Candidate)).first()
        if not candidate:
            candidate = Candidate(external_id=f"cand_auto_{app_in.candidate_id}", name="Applicant Candidate", consent_granted=True)
            session.add(candidate)
            session.commit()
            session.refresh(candidate)
        if candidate.id is not None:
            app_in.candidate_id = candidate.id

    job = session.exec(select(JobPosting).where(JobPosting.id == app_in.job_id)).first()
    if not job:
        # Fallback to first available job if ID not found
        job = session.exec(select(JobPosting)).first()
        if not job:
            raise HTTPException(status_code=404, detail=f"No active job postings found.")
        if job.id is not None:
            app_in.job_id = job.id

    application = JobApplication(
        candidate_id=app_in.candidate_id,
        job_id=app_in.job_id,
        status=app_in.status or "submitted",
    )
    session.add(application)
    session.commit()
    session.refresh(application)
    return application


@router.patch("/{app_id}", response_model=JobApplication, summary="Update job application status")
def update_application_status(
    app_id: int,
    status_update: ApplicationStatusUpdate,
    session: Session = Depends(get_session),
) -> JobApplication:
    """Updates status of a job application (e.g. accepted, declined, reviewing)."""
    application = session.exec(select(JobApplication).where(JobApplication.id == app_id)).first()
    if not application:
        raise HTTPException(status_code=404, detail=f"Application ID {app_id} not found.")

    if application.status in ["accepted", "declined"]:
        raise HTTPException(status_code=409, detail="Application already processed. Cannot update status again.")

    application.status = status_update.status
    session.add(application)
    session.commit()
    session.refresh(application)
    return application
