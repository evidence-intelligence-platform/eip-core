
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import Candidate, Evidence
from src.security.auth import verify_api_key

router = APIRouter(
    prefix="/api/v1/candidates",
    tags=["candidates"],
    dependencies=[Depends(verify_api_key)],
)

@router.get("/", response_model=list[Candidate])
def list_candidates(session: Session = Depends(get_session)):
    candidates = session.exec(select(Candidate)).all()
    return candidates

@router.post("/", response_model=Candidate)
def create_candidate(candidate: Candidate, session: Session = Depends(get_session)):
    existing = session.exec(select(Candidate).where(Candidate.external_id == candidate.external_id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Candidate with this external_id already exists")
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate

@router.get("/{external_id}", response_model=Candidate)
def get_candidate(external_id: str, session: Session = Depends(get_session)):
    """
    Looks up a single candidate. Without this, the UI had to download the
    whole roster just to check whether one record already existed.
    """
    candidate = session.exec(select(Candidate).where(Candidate.external_id == external_id)).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


@router.get("/{external_id}/evidences", response_model=list[Evidence])
def get_candidate_evidences(external_id: str, session: Session = Depends(get_session)):
    candidate = session.exec(select(Candidate).where(Candidate.external_id == external_id)).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    evidences = session.exec(select(Evidence).where(Evidence.candidate_external_id == external_id)).all()
    return evidences
