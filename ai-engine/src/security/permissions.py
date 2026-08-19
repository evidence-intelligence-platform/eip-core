"""
EIF: Role-Based Access Dependencies
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 08_SECURITY_ARCHITECTURE.md — Zero Trust
---
`verify_api_key` only proves the caller is the frontend proxy; it says nothing
about *who* is asking. These dependencies add the missing half: they identify
the user from their JWT and enforce what that user's role is allowed to do.

Usage:
    @router.post("/", dependencies=[Depends(require_employer)])
    def create_job(...): ...

    def list_mine(user: CurrentUser = Depends(require_user)):
        user["user_id"]  # authenticated identity
"""

from typing import Any

from fastapi import Depends, HTTPException, status

from src.security.jwt import get_current_user_payload

CurrentUser = dict[str, Any]


def require_user(payload: CurrentUser = Depends(get_current_user_payload)) -> CurrentUser:
    """Any signed-in user. Raises 401 when the token is missing or invalid."""
    return payload


def _require_role(*allowed: str):
    def dependency(payload: CurrentUser = Depends(get_current_user_payload)) -> CurrentUser:
        role = payload.get("role")
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bu işlem için gereken roller: {', '.join(allowed)}.",
            )
        return payload

    return dependency


require_employer = _require_role("employer", "admin")
require_candidate = _require_role("candidate", "admin")
# Moderation decisions carry legal weight; no other role may make them.
require_admin = _require_role("admin")
