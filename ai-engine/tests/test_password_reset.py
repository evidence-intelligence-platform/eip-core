"""
EIF: Password Reset Flow Tests
---
Covers LAUNCH_READINESS launch blockers #1/#2: the transactional e-mail
service (captured, never actually sent) and the forgot/reset password flow.

The e-mail layer is monkeypatched at the router's imported symbol, so these
tests also pin the contract that the reset LINK carries the plaintext token
while the database only ever holds its SHA-256.
"""

import re
from datetime import datetime, timedelta

import pytest
from sqlmodel import Session, select

from src.db.models import PasswordResetToken, UserAccount
from src.routers import auth as auth_router
from tests.conftest import TEST_ENGINE


@pytest.fixture()
def outbox(monkeypatch):
    """Captures (to, subject, html) instead of delivering anything."""
    sent: list[tuple[str, str, str]] = []

    def _capture(to: str, subject: str, html: str) -> bool:
        sent.append((to, subject, html))
        return True

    monkeypatch.setattr(auth_router, "send_email", _capture)
    return sent


def _register(client, email: str, password: str = "eski-sifre-123") -> None:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "role": "candidate", "full_name": "Reset Test"},
    )
    assert resp.status_code == 201, resp.text


def _token_from_email(html: str) -> str:
    match = re.search(r"\?token=([A-Za-z0-9_\-]+)", html)
    assert match, f"reset link not found in e-mail body:\n{html}"
    return match.group(1)


def test_forgot_password_is_not_an_account_oracle(keyed_client, outbox):
    resp = keyed_client.post(
        "/api/v1/auth/forgot-password", json={"email": "yok-boyle-biri@example.com"}
    )
    assert resp.status_code == 202
    # Same generic message as the existing-account case, and no e-mail.
    assert "kayıtlı bir hesap varsa" in resp.json()["message"]
    assert outbox == []


def test_full_reset_flow(keyed_client, outbox):
    email = "reset-akisi@example.com"
    _register(keyed_client, email)
    outbox.clear()  # drop the welcome mail; this test is about the reset one

    resp = keyed_client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert resp.status_code == 202
    assert len(outbox) == 1
    to, subject, html = outbox[0]
    assert to == email
    assert "ifre" in subject  # "Şifre sıfırlama..."
    token = _token_from_email(html)

    # The database must hold the hash, never the token itself.
    with Session(TEST_ENGINE) as session:
        rows = session.exec(select(PasswordResetToken)).all()
        assert all(row.token_hash != token for row in rows)

    resp = keyed_client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "yeni-sifre-456"},
    )
    assert resp.status_code == 200, resp.text

    # Old password is dead, new one signs in.
    old = keyed_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "eski-sifre-123"}
    )
    assert old.status_code == 401
    new = keyed_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "yeni-sifre-456"}
    )
    assert new.status_code == 200, new.text


def test_reset_invalidates_sessions_issued_before_it(keyed_client, outbox):
    """
    The whole point of resetting a password is usually "I think someone else
    has access." A JWT obtained before the reset must stop working the
    moment the reset completes — otherwise a stolen token keeps full access
    for up to 24h after the victim "secures" the account.
    """
    email = "eski-oturum@example.com"
    _register(keyed_client, email)
    outbox.clear()

    login = keyed_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "eski-sifre-123"}
    )
    assert login.status_code == 200, login.text
    pre_reset_token = login.json()["access_token"]
    pre_reset_headers = {"Authorization": f"Bearer {pre_reset_token}"}

    # The pre-reset token works before the reset.
    assert keyed_client.get("/api/v1/auth/me", headers=pre_reset_headers).status_code == 200

    keyed_client.post("/api/v1/auth/forgot-password", json={"email": email})
    token = _token_from_email(outbox[0][2])
    resp = keyed_client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "yeni-sifre-456"},
    )
    assert resp.status_code == 200, resp.text

    # The token minted before the reset must now be dead...
    stale = keyed_client.get("/api/v1/auth/me", headers=pre_reset_headers)
    assert stale.status_code == 401, stale.text

    # ...while a freshly issued one (post-reset password) works fine.
    fresh_login = keyed_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "yeni-sifre-456"}
    )
    assert fresh_login.status_code == 200, fresh_login.text
    fresh_headers = {"Authorization": f"Bearer {fresh_login.json()['access_token']}"}
    assert keyed_client.get("/api/v1/auth/me", headers=fresh_headers).status_code == 200


def test_reset_token_is_single_use(keyed_client, outbox):
    email = "tek-kullanim@example.com"
    _register(keyed_client, email)
    outbox.clear()

    keyed_client.post("/api/v1/auth/forgot-password", json={"email": email})
    token = _token_from_email(outbox[0][2])

    first = keyed_client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "birinci-789"}
    )
    assert first.status_code == 200
    second = keyed_client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "ikinci-000"}
    )
    assert second.status_code == 400


def test_reset_rejects_unknown_token(keyed_client):
    resp = keyed_client.post(
        "/api/v1/auth/reset-password",
        json={"token": "x" * 43, "new_password": "gecerli-sifre-1"},
    )
    assert resp.status_code == 400
    assert "geçersiz" in resp.json()["detail"]


def test_reset_rejects_expired_token(keyed_client, outbox):
    email = "suresi-dolan@example.com"
    _register(keyed_client, email)

    # Plant an already-expired token directly; the API cannot mint one.
    token = "expired-token-abcdefghijklmnop"
    with Session(TEST_ENGINE) as session:
        user = session.exec(select(UserAccount).where(UserAccount.email == email)).one()
        session.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=auth_router._hash_reset_token(token),
                expires_at=datetime.utcnow() - timedelta(minutes=1),
            )
        )
        session.commit()

    resp = keyed_client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "gecerli-sifre-2"}
    )
    assert resp.status_code == 400


def test_reset_consumes_every_outstanding_token(keyed_client, outbox):
    email = "coklu-token@example.com"
    _register(keyed_client, email)

    # Two live tokens for the same account (planted directly — the cooldown
    # keeps the API from issuing two this quickly).
    token_a = "planted-token-aaaaaaaaaaaaaaaa"
    token_b = "planted-token-bbbbbbbbbbbbbbbb"
    with Session(TEST_ENGINE) as session:
        user = session.exec(select(UserAccount).where(UserAccount.email == email)).one()
        for token in (token_a, token_b):
            session.add(
                PasswordResetToken(
                    user_id=user.id,
                    token_hash=auth_router._hash_reset_token(token),
                    expires_at=datetime.utcnow() + timedelta(minutes=30),
                )
            )
        session.commit()

    used = keyed_client.post(
        "/api/v1/auth/reset-password", json={"token": token_a, "new_password": "yeni-sifre-abc"}
    )
    assert used.status_code == 200
    # The sibling token died with it.
    sibling = keyed_client.post(
        "/api/v1/auth/reset-password", json={"token": token_b, "new_password": "yeni-sifre-def"}
    )
    assert sibling.status_code == 400


def test_forgot_password_cooldown_sends_once(keyed_client, outbox):
    email = "arka-arkaya@example.com"
    _register(keyed_client, email)
    outbox.clear()

    for _ in range(3):
        resp = keyed_client.post("/api/v1/auth/forgot-password", json={"email": email})
        assert resp.status_code == 202  # same answer every time — no oracle
    assert len(outbox) == 1  # but only one e-mail went out


def test_reset_enforces_min_password_length(keyed_client, outbox):
    email = "kisa-sifre@example.com"
    _register(keyed_client, email)
    outbox.clear()

    keyed_client.post("/api/v1/auth/forgot-password", json={"email": email})
    token = _token_from_email(outbox[0][2])

    resp = keyed_client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "12345"}
    )
    assert resp.status_code == 422  # same 6-char floor as /register


def test_register_sends_welcome_email(keyed_client, outbox):
    email = "hosgeldin@example.com"
    _register(keyed_client, email)
    assert len(outbox) == 1
    to, subject, _ = outbox[0]
    assert to == email
    assert "welcome" in subject.lower() or "hoş" in subject.lower()
