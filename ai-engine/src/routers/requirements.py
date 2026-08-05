
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import Requirement
from src.security.auth import verify_api_key
from src.security.permissions import CurrentUser, require_employer, require_user

router = APIRouter(
    prefix="/api/v1/requirements",
    tags=["requirements"],
    dependencies=[Depends(verify_api_key)],
)

@router.get("/", response_model=list[Requirement])
def list_requirements(
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_user),
):
    requirements = session.exec(select(Requirement)).all()
    return requirements

@router.post("/", response_model=Requirement)
def create_requirement(
    requirement: Requirement,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_employer),
):
    existing = session.exec(select(Requirement).where(Requirement.external_id == requirement.external_id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Requirement with this external_id already exists")
    session.add(requirement)
    session.commit()
    session.refresh(requirement)
    return requirement
