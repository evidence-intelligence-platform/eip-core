from typing import Optional
from sqlmodel import Field, SQLModel
from datetime import datetime

class Candidate(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True, description="ID from the frontend/ATS system (e.g., cand_123)")
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Requirement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True, description="ID from the frontend (e.g., req_demo_1)")
    description: str

class Evidence(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    candidate_external_id: str = Field(index=True)
    requirement_external_id: str = Field(index=True)
    source_type: str
    status: str  # e.g., VERIFIED, INSUFFICIENT EVIDENCE, CONTRADICTION
    reasoning: str
    evidence_pointer: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
