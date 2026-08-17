"""
EIF: LLM provider factory.
---
One seam decides which model provider serves evidence extraction, chosen by
the LLM_PROVIDER environment variable. This is the integration point for a
model-provider partnership: pointing the platform at OpenAI or Anthropic
(e.g. "results powered by X", or a multi-model consensus offering) is a
one-line env change plus an adapter that implements BaseLLMService — no
business-logic change, per the Foundation Manifest's anti-lock-in rule.

  LLM_PROVIDER=gemini         (default; live today)
  LLM_PROVIDER=openai_compat  (live today — any OpenAI-wire-format provider:
                               NVIDIA NIM, Groq, OpenRouter, a local vLLM
                               server. See OpenAICompatLLMService.)
  LLM_PROVIDER=openai         (dormant — add OpenAILLMService + OPENAI_API_KEY)
  LLM_PROVIDER=anthropic      (dormant — add AnthropicLLMService + ANTHROPIC_API_KEY)

The dormant providers raise a clear, actionable error rather than failing
obscurely, so switching on a partner is a deliberate, documented step.
"""

import os

from src.services.base_llm import BaseLLMService


def get_llm_service() -> BaseLLMService:
    """Returns the configured LLM provider implementation."""
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()

    if provider == "gemini":
        from src.services.llm_service import GeminiLLMService

        return GeminiLLMService()

    if provider == "openai_compat":
        from src.services.openai_compat_llm_service import OpenAICompatLLMService

        return OpenAICompatLLMService()

    if provider in ("openai", "anthropic"):
        raise RuntimeError(
            f"LLM_PROVIDER='{provider}' seçildi ama bu sağlayıcının adaptörü "
            f"henüz etkin değil. Etkinleştirmek için {provider} SDK'sını kurun, "
            f"BaseLLMService'i uygulayan bir servis ekleyin ve API anahtarını "
            f"ortam değişkeni olarak verin. Şimdilik LLM_PROVIDER=gemini kullanın."
        )

    raise RuntimeError(
        f"Bilinmeyen LLM_PROVIDER='{provider}'. Geçerli değerler: "
        f"gemini | openai_compat | openai | anthropic."
    )
