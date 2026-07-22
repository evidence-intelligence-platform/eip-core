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

import os
import json
import base64
import hmac
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

# JWT Configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "eif-super-secret-jwt-signing-key-change-in-production-2026")
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


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
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


def decode_access_token(token: str) -> Dict[str, Any]:
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

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired JWT token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user_payload(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> Dict[str, Any]:
    """
    FastAPI dependency to extract and verify the current authenticated user JWT payload.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Header format: 'Authorization: Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_access_token(credentials.credentials)
