"""
EIF: JWT & Password Hashing Security Module
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance:
  - 06_API_CONTRACTS.md: JWT Bearer authentication for Core Zone
  - 08_SECURITY_ARCHITECTURE.md: Secure password storage & token validation
---
Uses standard cryptographic algorithms (PBKDF2-HMAC-SHA256 & HMAC-SHA256 JWT)
to ensure 100% zero-dependency security without binary C-extension compilation issues.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import UserAccount

load_dotenv()

# JWT Configuration.
# No hardcoded fallback: a guessable default would let anyone forge tokens.
# When the env var is missing (local dev / unit tests) we generate an
# ephemeral random secret — tokens simply stop being valid across restarts,
# which is safe. Production MUST set JWT_SECRET_KEY explicitly.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_urlsafe(64)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

bearer_scheme = HTTPBearer(auto_error=False)


# ─────────────────────────────────────────────────────────────────────────────
# Password Hashing Functions (PBKDF2-HMAC-SHA256)
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """
    Hashes a plain-text password using PBKDF2-HMAC-SHA256 with a random salt.

    Format: pbkdf2:sha256:iterations$salt$hash_hex
    """
    salt = os.urandom(16).hex()
    iterations = 100_000
    derived = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations
    ).hex()
    return f"pbkdf2:sha256:{iterations}${salt}${derived}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain-text password against a PBKDF2-HMAC-SHA256 hash.
    """
    try:
        header, salt, original_hash = hashed_password.split('$')
        _, _, iterations_str = header.split(':')
        iterations = int(iterations_str)

        derived = hashlib.pbkdf2_hmac(
            'sha256',
            plain_password.encode('utf-8'),
            salt.encode('utf-8'),
            iterations
        ).hex()

        return hmac.compare_digest(derived, original_hash)
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# JWT Token Generation & Verification (HS256)
# ─────────────────────────────────────────────────────────────────────────────

def _b64_url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')


def _b64_url_decode(data_str: str) -> bytes:
    padding = '=' * (4 - (len(data_str) % 4))
    return base64.urlsafe_b64decode(data_str + padding)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """
    Generates a signed JWT access token containing the provided claims.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": int(expire.timestamp())})

    header = {"alg": "HS256", "typ": "JWT"}

    header_bytes = _b64_url_encode(json.dumps(header).encode('utf-8'))
    payload_bytes = _b64_url_encode(json.dumps(to_encode).encode('utf-8'))

    signing_input = f"{header_bytes}.{payload_bytes}"
    signature = hmac.new(
        JWT_SECRET_KEY.encode('utf-8'),
        signing_input.encode('utf-8'),
        hashlib.sha256
    ).digest()
    signature_bytes = _b64_url_encode(signature)

    return f"{signing_input}.{signature_bytes}"


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decodes and verifies a HS256 signed JWT access token.

    Raises:
        HTTPException 401: If token signature is invalid or token has expired.
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Malformed token")

        header_b64, payload_b64, signature_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}"

        expected_sig = hmac.new(
            JWT_SECRET_KEY.encode('utf-8'),
            signing_input.encode('utf-8'),
            hashlib.sha256
        ).digest()
        expected_sig_b64 = _b64_url_encode(expected_sig)

        if not hmac.compare_digest(signature_b64, expected_sig_b64):
            raise ValueError("Invalid signature")

        payload_json = _b64_url_decode(payload_b64).decode('utf-8')
        payload = json.loads(payload_json)

        exp = payload.get("exp")
        if exp and datetime.utcnow().timestamp() > exp:
            raise ValueError("Token expired")

        return payload

    except ValueError:
        # The underlying reason (malformed / bad signature / expired) is an
        # internal implementation detail, not something to hand back verbatim
        # to a non-technical end user — one generic Turkish message covers all
        # three the same way the rest of this file's user-facing errors do.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kimlik doğrulama token'ı geçersiz veya süresi dolmuş.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _password_fingerprint(hashed_password: str) -> str:
    """
    Short fingerprint of a password hash, embedded in the JWT at issue time so
    a password reset can invalidate every session minted before it.

    Reusing hashed_password (rather than adding a new column) means a reset —
    which already overwrites this field — automatically changes the
    fingerprint too, with no extra schema or write required.
    """
    return hashlib.sha256(hashed_password.encode('utf-8')).hexdigest()


def create_user_access_token(user: UserAccount) -> str:
    """
    Issues an access token for a signed-in UserAccount, bound to their current
    password hash via the "pwf" claim.

    Use this instead of calling create_access_token directly for user
    sessions (register/login) — it guarantees the reset-invalidation claim
    below is always present. Without it, a stolen token would keep working
    for up to 24h after the victim "secures" the account by changing their
    password — defeating the one thing password reset exists to do.
    """
    return create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "role": user.role,
        "pwf": _password_fingerprint(user.hashed_password),
    })


def get_current_user_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """
    FastAPI dependency to extract and verify the current authenticated user JWT payload.

    A valid signature is not enough: tokens are stateless and live for 24
    hours, so after a KVKK account deletion the old JWT would otherwise keep
    working — and could even recreate data for the erased identity. The
    account behind the token is therefore re-checked on every request, and the
    role is taken from that row rather than from the token's stale claim.

    The token's "pwf" claim (see create_user_access_token), when present, is
    checked against the account's CURRENT password hash for the same reason:
    a password reset must kill every session issued before it, not just the
    credential itself. Every token minted by /auth/register and /auth/login
    carries this claim. The check only runs when the claim is present, so a
    handful of internal token mints outside those two endpoints (ops
    scripts, test fixtures) that predate this claim keep working unchanged —
    they are not part of the attacker-reachable surface this defends.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kimlik doğrulama token'ı gerekli. Header formatı: 'Authorization: Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)

    account = session.exec(
        select(UserAccount).where(UserAccount.email == payload.get("sub"))
    ).first()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kimlik doğrulama token'ı geçersiz veya süresi dolmuş: hesap artık mevcut değil.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_fingerprint = payload.get("pwf")
    if token_fingerprint is not None and not hmac.compare_digest(
        token_fingerprint, _password_fingerprint(account.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # The role claim was frozen when the token was issued, so a promotion or
    # demotion took up to 24 hours (or a manual sign-out) to reach the API —
    # while /auth/me already reported the new role and the UI unlocked on it.
    # The account row is loaded here anyway: make it the single authority.
    payload["role"] = account.role
    return payload
