
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import Requirement
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_employer

router = APIRouter(
    prefix="/api/v1/requirements",
    tags=["requirements"],
    dependencies=[Depends(verify_api_key)],
)

@router.get("/", response_model=list[Requirement])
def list_requirements(
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
):
    # Scoped to the caller's own requirements — an unfiltered global list let
    # any employer read every other employer's hiring criteria.
    requirements = session.exec(
        select(Requirement).where(Requirement.created_by_user_id == user.get("user_id"))
    ).all()
    return requirements

class RequirementCreate(BaseModel):
    """
    What a caller may set when creating a requirement.

    The table model must never be the request body (same rule as
    ApplicationCreate in applications.py): binding Requirement directly left
    `id` and `created_at` client-settable, so a caller could pick a primary
    key — colliding with (or squatting) the id the database would hand out
    next — and forge the creation timestamp.
    """
    external_id: str
    description: str


@router.post("/", response_model=Requirement)
def create_requirement(
    requirement: RequirementCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
):
    # "req_job_<n>" is the server-issued namespace: publishing a posting mints
    # exactly that id, and the extraction prompt grades every applicant against
    # the description stored under it. Left open, an employer could pre-claim a
    # competitor's next posting id — choosing the text the model judges by, and
    # breaking the publish that would have created it. Same rule as the
    # reserved "cand_<n>" namespace (candidates.py).
    if re.fullmatch(r"req_job_\d+", requirement.external_id):
        raise HTTPException(
            status_code=403,
            detail="This external_id is reserved for job postings.",
        )
    existing = session.exec(select(Requirement).where(Requirement.external_id == requirement.external_id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Requirement with this external_id already exists")
    row = Requirement(
        external_id=requirement.external_id,
        description=requirement.description,
        created_by_user_id=user.get("user_id"),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
