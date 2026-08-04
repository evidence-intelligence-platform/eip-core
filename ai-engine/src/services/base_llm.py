"""
EIF: LLM Abstraction Layer
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 02_FOUNDATION_MANIFEST.md Section 2 — "AI models must be accessed via
            strictly typed abstraction layers. Direct, hardcoded calls to specific
            LLM models are forbidden to prevent vendor lock-in."
---
This module defines the contract (interface) that ALL LLM providers must implement.
Swapping providers (e.g., Gemini → OpenAI → Local) requires only a new implementation
class, not changes to business logic.
"""

from abc import ABC, abstractmethod

from src.models.schemas import ExtractionResult, ExtractRequest


class BaseLLMService(ABC):
    """
    Abstract contract for all LLM Evidence Extractor services.

    Any LLM provider integration MUST inherit from this class and implement
    the `extract_evidence` method. This enforces the Engineering Constitution's
    requirement for explainability and prevents architectural drift.
    """

    @abstractmethod
    async def extract_evidence(self, request: ExtractRequest) -> ExtractionResult:
        """
        Analyzes a candidate's evidence payload against a single requirement.

        Args:
            request: A strictly typed ExtractRequest containing the evidence
                     payload and the requirement to evaluate against.

        Returns:
            An ExtractionResult with:
            - status: VERIFIED | INSUFFICIENT EVIDENCE | CONTRADICTION
            - reasoning: Human-readable explanation (required, non-empty)
            - evidence_pointer: Link or reference to the source evidence

        Raises:
            ValueError: If the request is malformed or the provider rejects it.
            RuntimeError: If the underlying LLM provider fails unexpectedly.

        EIF Rule: This method MUST NEVER return a result without a non-empty
        `reasoning` field. Violating this is a Constitution violation.
        """
        raise NotImplementedError
