import os
from google import genai
from src.models.schemas import ExtractRequest, ExtractionResult
from dotenv import load_dotenv

load_dotenv()

class GeminiLLMService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not set in the environment.")
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = "gemini-3.5-flash"
        
        self.system_prompt = """
        You are the EIP Evidence Extractor, part of the Isolated Intelligence Zone.
        Your only purpose is to read the raw data and strictly evaluate if the candidate meets the provided requirement.
        
        RULES:
        1. "Quality Before Speed. Evidence Before Opinion."
        2. You MUST NOT guess or assume skills (No psychoanalysis). If the raw data does not explicitly demonstrate the requirement with tangible evidence, you must output INSUFFICIENT EVIDENCE.
        3. If there is evidence, you must output VERIFIED and provide an 'evidence_pointer' (a snippet, quote, or location reference from the raw data).
        4. If there is a direct contradiction in the data, output CONTRADICTION.
        5. You must output strictly in the requested JSON schema.
        """

    def extract_evidence(self, request: ExtractRequest) -> ExtractionResult:
        prompt = f"""
        Requirement ID: {request.requirement.id}
        Requirement Description: {request.requirement.description}
        
        Candidate ID: {request.payload.candidate_id}
        Source Type: {request.payload.source_type}
        Raw Data:
        {request.payload.raw_data}
        """

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config={
                "system_instruction": self.system_prompt,
                "response_mime_type": "application/json",
                "response_schema": ExtractionResult,
                "temperature": 0.0,
            },
        )
        
        return ExtractionResult.model_validate_json(response.text)
