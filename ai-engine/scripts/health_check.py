"""
EIF Live System Health & Diagnostic CLI Tool
---
Version: 2.0.0
Owner: EIF Architecture Team
Compliance: 08_SECURITY_ARCHITECTURE.md — Zero Trust enforcement is verified,
not assumed.
---
Performs 5 real-time diagnostic audits:
1. Environment variables & security credentials (the names the code reads)
2. Database connectivity & SQLModel table record counts
3. FastAPI gateway router health, called with a real JWT
4. Zero Trust enforcement: unauthenticated, key-only, tampered, expired and
   wrong-role requests must all be refused
5. LLM provider configuration — the service is constructed, not described

The tool observes the environment it runs in; it never injects a fallback
credential of its own. A default would make audit 1 unable to fail and audit 4
unable to notice a broken wall, which is precisely the failure this tool
exists to catch.

Exit code is 0 only when every audit passed. Errors exit 1; warnings (a
degraded but working configuration) keep the exit code at 0 and are listed in
the summary.

Usage:
  python scripts/health_check.py
"""

import base64
import json
import os
import sys
from datetime import timedelta

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, func, select  # noqa: E402

from src.db.database import engine  # noqa: E402
from src.db.models import Candidate, Evidence, JobApplication, JobPosting, UserAccount  # noqa: E402
from src.main import app  # noqa: E402
from src.security.jwt import create_access_token  # noqa: E402

# HS256 with a short key is brute-forceable offline; anything below this is a
# real finding, not a style note.
MIN_JWT_SECRET_LENGTH = 32

_ERRORS: list[str] = []
_WARNINGS: list[str] = []


def log_header(title: str):
    print("\n==================================================")
    print(f" DIAGNOSTIC AUDIT: {title}")
    print("==================================================")


def log_ok(msg: str):
    print(f"  [OK] {msg}")


def log_warn(msg: str):
    _WARNINGS.append(msg)
    print(f"  [WARN] {msg}")


def log_err(msg: str):
    _ERRORS.append(msg)
    print(f"  [ERROR] {msg}")


def mask(value: str) -> str:
    """
    Secrets belong in the environment, never in a diagnostic log — the length
    is enough to tell "set" from "set to something empty".
    """
    return f"set ({len(value)} characters)"


def describe_database_url(value: str) -> str:
    """Scheme and host only: a production DSN carries the database password."""
    scheme, _, rest = value.partition("://")
    if not rest:
        return scheme or "unknown"
    host = rest.rsplit("@", 1)[-1]
    return f"{scheme}://{host}"


def tamper_token(token: str) -> str:
    """
    Rewrites a valid token's role claim to "admin" and keeps the original
    signature.

    This is the privilege-escalation attempt the signature exists to stop: if
    the API answers 200, the HMAC is not being verified and every role boundary
    in the platform is decorative.
    """
    header_b64, payload_b64, signature_b64 = token.split(".")
    padding = "=" * (4 - (len(payload_b64) % 4))
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
    payload["role"] = "admin"
    forged_payload = (
        base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8").rstrip("=")
    )
    return f"{header_b64}.{forged_payload}.{signature_b64}"


def find_account(session: Session, roles: tuple[str, ...]) -> UserAccount | None:
    """
    An account to mint a diagnostic token for.

    Authentication re-reads the account behind every token (a deleted account
    must not keep working), so a token signed for a non-existent identity is
    refused — the probes below need a real row. Nothing is written: the token
    is signed locally with the configured secret and used read-only.
    """
    return session.exec(
        select(UserAccount).where(UserAccount.role.in_(roles)).order_by(UserAccount.id)
    ).first()


def audit_environment() -> None:
    log_header("1. Environment Variables & Security Configuration")

    internal_api_key = os.getenv("INTERNAL_API_KEY")
    if internal_api_key:
        log_ok(f"INTERNAL_API_KEY is {mask(internal_api_key)}")
    else:
        # verify_api_key answers 500 to every call without it — the whole
        # engine is unreachable, not merely insecure.
        log_err("INTERNAL_API_KEY is MISSING — every authenticated endpoint will answer HTTP 500")

    # The variable the code actually reads is JWT_SECRET_KEY (src/security/jwt.py).
    # A diagnostic that reads a different name reports a healthy system as
    # broken, and — with a fallback of its own — a broken one as healthy.
    jwt_secret = os.getenv("JWT_SECRET_KEY")
    if not jwt_secret:
        log_err(
            "JWT_SECRET_KEY is MISSING — the engine falls back to a random per-process "
            "secret, so every restart silently signs out every user"
        )
    elif len(jwt_secret) < MIN_JWT_SECRET_LENGTH:
        log_warn(
            f"JWT_SECRET_KEY is only {len(jwt_secret)} characters; "
            f"use at least {MIN_JWT_SECRET_LENGTH} for HS256"
        )
    else:
        log_ok(f"JWT_SECRET_KEY is {mask(jwt_secret)}")

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        log_ok(f"GEMINI_API_KEY is {mask(gemini_key)}")
    else:
        # There is no mock mode: GeminiLLMService refuses to construct, and
        # both extraction endpoints answer 500. That is an outage of the core
        # feature, not a degraded extra.
        log_err("GEMINI_API_KEY is MISSING — evidence extraction is out of service")

    log_ok(f"LLM_MODEL_NAME: {os.getenv('LLM_MODEL_NAME') or 'unset (service default)'}")

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        log_warn("DATABASE_URL is unset — falling back to the local development SQLite file")
    else:
        log_ok(f"DATABASE_URL: {describe_database_url(database_url)}")
        if database_url.startswith("sqlite"):
            log_warn("DATABASE_URL points at SQLite — PostgreSQL is required beyond local dev")


def audit_database() -> None:
    log_header("2. Database Connectivity & Table Record Audit")
    try:
        with Session(engine) as session:
            counts = {
                "UserAccounts": session.exec(select(func.count(UserAccount.id))).one(),
                "Candidates": session.exec(select(func.count(Candidate.id))).one(),
                "JobPostings": session.exec(select(func.count(JobPosting.id))).one(),
                "JobApplications": session.exec(select(func.count(JobApplication.id))).one(),
                "Evidence Records": session.exec(select(func.count(Evidence.id))).one(),
            }
        log_ok("Database session connection established")
        for label, value in counts.items():
            log_ok(f"  * {label}: {value} records")
    except Exception as exc:
        log_err(f"Database session connection failed: {exc}")


def audit_routers(client: TestClient, key_headers: dict[str, str], token: str | None) -> None:
    log_header("3. FastAPI Router Health Audit")

    # /health is the endpoint the container HEALTHCHECK and Railway's
    # healthcheckPath probe; if it breaks, the platform restart-loops.
    for endpoint, name in (("/health", "Public health endpoint"), ("/docs", "OpenAPI documentation UI")):
        res = client.get(endpoint)
        if res.status_code == 200:
            log_ok(f"{name} ({endpoint}) is HEALTHY (200 OK)")
        else:
            log_err(f"{name} ({endpoint}) returned status {res.status_code}")

    protected = [
        ("/api/v1/jobs/", "Job Postings Router"),
        ("/api/v1/applications/", "Job Applications Router"),
        ("/api/v1/candidates/", "Candidates Router"),
        ("/api/v1/requirements/", "Requirements Router"),
    ]

    if not token:
        # Calling these with the internal key alone returns 401 by design, so
        # reporting that as a router failure would be a false alarm — and
        # skipping them silently would hide a genuine outage.
        log_warn(
            "No employer/admin account available to sign a diagnostic token — "
            f"{len(protected)} authenticated router(s) were not probed"
        )
        return

    headers = {**key_headers, "Authorization": f"Bearer {token}"}
    for endpoint, name in protected:
        res = client.get(endpoint, headers=headers)
        if res.status_code == 200:
            log_ok(f"{name} ({endpoint}) is HEALTHY (200 OK)")
        else:
            log_err(f"{name} ({endpoint}) returned status {res.status_code}: {res.text[:120]}")


def audit_zero_trust(
    client: TestClient,
    key_headers: dict[str, str],
    employer_token: str | None,
    candidate_token: str | None,
) -> None:
    log_header("4. Zero Trust Security Enforcement Audit")

    # 4.1 — no credentials at all.
    res = client.post("/api/v1/extract", json={})
    if res.status_code in (401, 403):
        log_ok(f"Unauthenticated extraction request blocked (HTTP {res.status_code})")
    else:
        log_err(f"Unauthenticated extraction request was NOT blocked: HTTP {res.status_code}")

    # 4.2 — the internal key only proves the caller is the proxy. It must not
    # substitute for knowing WHO is asking.
    res = client.get("/api/v1/applications/", headers=key_headers)
    if res.status_code == 401:
        log_ok("Internal API key alone does not authenticate a user (HTTP 401)")
    else:
        log_err(
            "Internal API key alone was accepted as a user identity: "
            f"HTTP {res.status_code} — applications are readable without a JWT"
        )

    if not employer_token:
        log_warn("No account available to sign a diagnostic token — token integrity probes skipped")
        return

    # 4.3 — a tampered role claim must not survive signature verification.
    res = client.get(
        "/api/v1/auth/me",
        headers={**key_headers, "Authorization": f"Bearer {tamper_token(employer_token)}"},
    )
    if res.status_code == 401:
        log_ok("Tampered JWT (role escalated to admin) rejected (HTTP 401)")
    else:
        log_err(
            f"Tampered JWT was ACCEPTED: HTTP {res.status_code} — the HS256 signature is "
            "not being verified and every role boundary is bypassable"
        )

    # 4.4 — expiry is the only thing that ends a stateless 24h session.
    expired = create_access_token(
        {"sub": "healthcheck@diagnostic.local", "user_id": -1, "role": "admin"},
        expires_delta=timedelta(minutes=-5),
    )
    res = client.get("/api/v1/auth/me", headers={**key_headers, "Authorization": f"Bearer {expired}"})
    if res.status_code == 401:
        log_ok("Expired JWT rejected (HTTP 401)")
    else:
        log_err(f"Expired JWT was ACCEPTED: HTTP {res.status_code}")

    # 4.5 — role separation, on a read-only endpoint so a failed wall leaves
    # no data behind.
    if not candidate_token:
        log_warn("No candidate account available — the role-boundary probe was skipped")
        return
    res = client.get(
        "/api/v1/candidates/", headers={**key_headers, "Authorization": f"Bearer {candidate_token}"}
    )
    if res.status_code == 403:
        log_ok("Candidate token refused the employer-only candidate roster (HTTP 403)")
    else:
        log_err(
            f"Candidate token read the employer-only candidate roster: HTTP {res.status_code} — "
            "role separation is not enforced"
        )


def audit_llm_provider() -> None:
    log_header("5. LLM Provider Configuration Diagnostic")
    try:
        from src.services.base_llm import BaseLLMService
        from src.services.llm_factory import get_llm_service

        service = get_llm_service()
    except Exception as exc:
        # The extraction endpoints resolve this same factory as a dependency,
        # so whatever fails here fails there too — as an HTTP 500.
        log_err(f"LLM provider could not be constructed: {type(exc).__name__}: {exc}")
        return

    provider = os.getenv("LLM_PROVIDER", "gemini")
    log_ok(f"LLM provider '{provider}' resolved to {type(service).__name__}")
    log_ok(f"Model: {getattr(service, 'model_name', 'unknown')}")
    if isinstance(service, BaseLLMService):
        log_ok("Provider implements BaseLLMService (vendor lock-in prevented)")
    else:
        log_err(f"{type(service).__name__} does not implement BaseLLMService")


def run_health_check() -> int:
    print("[INIT] Launching Evidence Intelligence Platform System Diagnostic...\n")

    audit_environment()
    audit_database()

    # Read AFTER the audit above, so a missing key is reported rather than
    # papered over with a default.
    internal_api_key = os.getenv("INTERNAL_API_KEY")
    key_headers = {"X-Internal-API-Key": internal_api_key} if internal_api_key else {}

    employer_token = candidate_token = None
    try:
        with Session(engine) as session:
            employer = find_account(session, ("employer", "admin"))
            candidate = find_account(session, ("candidate",))
            if employer:
                employer_token = create_access_token(
                    {"sub": employer.email, "user_id": employer.id, "role": employer.role}
                )
            if candidate:
                candidate_token = create_access_token(
                    {"sub": candidate.email, "user_id": candidate.id, "role": candidate.role}
                )
    except Exception as exc:
        log_err(f"Could not sign a diagnostic token from an existing account: {exc}")

    # Context manager, so the lifespan runs before the first request.
    with TestClient(app) as client:
        audit_routers(client, key_headers, employer_token)
        audit_zero_trust(client, key_headers, employer_token, candidate_token)

    audit_llm_provider()

    print("\n==================================================")
    if _ERRORS:
        print(f" [FAILURE] DIAGNOSTIC DETECTED {len(_ERRORS)} ISSUE(S):")
        for item in _ERRORS:
            print(f"   - {item}")
        if _WARNINGS:
            print(f" {len(_WARNINGS)} warning(s) also recorded.")
        print("==================================================\n")
        return 1

    if _WARNINGS:
        print(f" [DEGRADED] NO FAILURES, {len(_WARNINGS)} WARNING(S):")
        for item in _WARNINGS:
            print(f"   - {item}")
    else:
        print(" [SUCCESS] PLATFORM DIAGNOSTIC COMPLETED: ALL SYSTEMS HEALTHY!")
    print("==================================================\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(run_health_check())
    except SystemExit:
        raise
    except Exception as exc:  # a crashed diagnostic is a failed diagnostic
        print(f"\n  [ERROR] Health check crashed: {type(exc).__name__}: {exc}")
        print(" [FAILURE] PLATFORM DIAGNOSTIC COULD NOT COMPLETE\n")
        sys.exit(1)
