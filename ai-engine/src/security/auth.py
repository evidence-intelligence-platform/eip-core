"""
EIF: Internal API Key Authentication
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance:
  - 06_API_CONTRACTS.md: "Every endpoint requires a Bearer Token (JWT)"
  - 01_ENGINEERING_CONSTITUTION.md Article II, Section 3: Zero Trust Integration
  - ENGINEERING_STANDARDS.md Section 4: Least Privilege
---
ARCHITECTURE CONTEXT:
  The Isolated Intelligence Zone does NOT implement full user-facing JWT auth
  (that is the Core Zone API Gateway's responsibility per 04_SYSTEM_ARCHITECTURE.md).

  Instead, this module implements INTERNAL API KEY authentication:
  - The Core Zone API Gateway authenticates users via JWT.
  - The Core Zone then calls this AI Engine using a pre-shared INTERNAL_API_KEY.
  - The AI Engine trusts only requests carrying this key.
  - This implements the Zero Trust principle: the AI Engine trusts NO caller
    by default, including the Core Zone, without presenting the correct credential.

SETUP:
  Set INTERNAL_API_KEY in your .env file.
  Example: INTERNAL_API_KEY=eif-internal-super-secret-key-2026
"""

import os

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

# The header name used to pass the internal API key
_API_KEY_HEADER_NAME = "X-Internal-API-Key"

_api_key_header = APIKeyHeader(
    name=_API_KEY_HEADER_NAME,
    auto_error=False,
    description=(
        "Internal API Key required by the Isolated Intelligence Zone. "
        "Issued by the EIF Core Zone API Gateway. "
        "Set via INTERNAL_API_KEY environment variable."
    )
)


def verify_api_key(api_key: str = Security(_api_key_header)) -> str:
    """
    FastAPI dependency that validates the internal API key.

    Usage:
        @app.post("/endpoint", dependencies=[Depends(verify_api_key)])

    Raises:
        HTTPException 500: If INTERNAL_API_KEY is not configured on the server.
                           This is a server misconfiguration, not a client error.
        HTTPException 403: If the key is missing or does not match.

    Returns:
        The validated API key string (for audit logging purposes).
    """
    expected_key = os.getenv("INTERNAL_API_KEY")

    # Server-side misconfiguration — fail loudly, not silently
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Server configuration error: INTERNAL_API_KEY environment variable is not set. "
                "The Isolated Intelligence Zone cannot operate securely without it. "
                "Ref: ENGINEERING_STANDARDS.md Section 4 — Least Privilege."
            )
        )

    # Zero Trust: reject anything that doesn't present the exact key
    if not api_key or api_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Access denied. A valid '{_API_KEY_HEADER_NAME}' header is required. "
                "Ref: 06_API_CONTRACTS.md — Zero Trust Integration."
            )
        )

    return api_key
