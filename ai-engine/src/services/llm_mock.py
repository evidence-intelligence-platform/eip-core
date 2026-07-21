from src.models.schemas import ExtractRequest, ExtractionResult
import time

class MockLLMService:
    def __init__(self):
        # We simulate the constraints of AI_AGENT_RULES here
        pass

    def extract_evidence(self, request: ExtractRequest) -> ExtractionResult:
        # Simulate processing time
        time.sleep(1)
        
        raw = request.payload.raw_data.lower()
        req_desc = request.requirement.description.lower()
        
        # Rule 2: Golden Rule of Explanation & Rule 3: Dealing with Uncertainty
        if "react" in req_desc and "usecontext" in raw:
            return ExtractionResult(
                status="VERIFIED",
                reasoning=f"Candidate's {request.payload.source_type} data shows explicit usage of React Context API.",
                evidence_pointer="github.com/candidate/repo/commit/mock_hash"
            )
        elif "leadership" in req_desc:
            # Rule 4: Prohibition on Psychological Profiling
            if "reviewed 50 prs" in raw:
                return ExtractionResult(
                    status="VERIFIED",
                    reasoning="Candidate tangibly leads by performing extensive code reviews, not based on personality traits.",
                    evidence_pointer="github.com/candidate/repo/pulls"
                )
            else:
                return ExtractionResult(
                    status="INSUFFICIENT EVIDENCE",
                    reasoning="No tangible evidence of code review or team coordination found. Cannot psychoanalyze leadership.",
                    evidence_pointer=None
                )
        else:
            return ExtractionResult(
                status="INSUFFICIENT EVIDENCE",
                reasoning="The provided payload does not contain keywords or patterns matching the requirement.",
                evidence_pointer=None
            )
