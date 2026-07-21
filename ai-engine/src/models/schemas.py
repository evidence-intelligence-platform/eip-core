from pydantic import BaseModel, Field
from typing import Optional, Literal, List

class EvidencePayload(BaseModel):
    candidate_id: str
    source_type: Literal["GITHUB", "CHATGPT", "LINKEDIN"]
    raw_data: str

class Requirement(BaseModel):
    id: str
    description: str

class ExtractionResult(BaseModel):
    status: Literal["VERIFIED", "INSUFFICIENT EVIDENCE", "CONTRADICTION"] = Field(
        ..., description="The definitive status of the extraction."
    )
    reasoning: str = Field(
        ..., description="Explanation of why this status was chosen. Must not psychoanalyze."
    )
    evidence_pointer: Optional[str] = Field(
        None, description="URL or exact pointer to the evidence. Required if status is VERIFIED or CONTRADICTION."
    )

class ExtractRequest(BaseModel):
    payload: EvidencePayload
    requirement: Requirement
