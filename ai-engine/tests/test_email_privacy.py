"""
EIF: Transactional E-mail Privacy Tests
---
Compliance: 08_SECURITY_ARCHITECTURE.md Section 6 — Data Security Rules;
01_ENGINEERING_CONSTITUTION.md Article III — every behaviour pinned by a test.
---
The dev fallback in email_service used to log the full HTML body whenever
RESEND_API_KEY was unset. A password-reset body carries the single-use token in
plaintext and /forgot-password is public and unauthenticated, so that one log
line let anyone who could read the platform's logs take over any account whose
address they knew — the admin's included.

These tests pin the fix from both sides: no path writes the token, the body or
the full recipient address, and the deliberate opt-in escape hatch still hands
a developer their link back on a local machine.
"""

import json
import logging
import secrets
import urllib.request

import pytest

from src.services import email_service
from src.services.email_service import (
    DEV_LOG_LINK_ENV,
    password_reset_email,
    send_email,
    welcome_email,
)

RECIPIENT = "aday@ornek.com"
MASKED_RECIPIENT = "a***@ornek.com"


@pytest.fixture(autouse=True)
def _email_environment(monkeypatch, caplog):
    """
    A developer's own RESEND_API_KEY — or an already-enabled dev switch — would
    otherwise decide which branch each test exercises. Start from neither.
    """
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv(DEV_LOG_LINK_ENV, raising=False)
    caplog.set_level(logging.INFO, logger="eip.email")


def _reset_message() -> tuple[str, str, str]:
    """
    (token, subject, html) for a genuine password-reset message.

    The token is minted the same way /forgot-password mints it and the body is
    built by the real template, so "the token never reaches the log" is proven
    against the exact string an attacker would be hunting for.
    """
    token = secrets.token_urlsafe(32)
    subject, html = password_reset_email(f"https://eip.example/sifre-sifirla?token={token}")
    assert token in html  # guards the guard: a template change must not mute these tests
    return token, subject, html


class _AcceptedResponse:
    """Stands in for Resend's 200 answer, which carries only {"id": ...}."""

    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


@pytest.fixture()
def sent_requests(monkeypatch):
    """Captures what would go over the wire, with the provider 'configured'."""
    captured = []

    def _fake_urlopen(request, timeout=None):
        captured.append(request)
        return _AcceptedResponse()

    monkeypatch.setenv("RESEND_API_KEY", "test-provider-key")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    return captured


# ── Default behaviour: nothing secret reaches the log ────────────────────────


def test_dev_fallback_never_logs_the_reset_token(caplog):
    token, subject, html = _reset_message()

    assert send_email(RECIPIENT, subject, html) is False

    log = caplog.text
    assert token not in log
    assert "sifre-sifirla" not in log  # not even the bare link, token aside
    assert "href" not in log  # no anchor…
    assert "<div" not in log  # …and no body markup at all
    assert RECIPIENT not in log


def test_dev_fallback_still_reports_the_attempt(caplog):
    """Privacy must not cost observability: the operator still sees what happened."""
    _, subject, html = _reset_message()

    send_email(RECIPIENT, subject, html)

    log = caplog.text
    assert "RESEND_API_KEY" in log  # says why nothing was delivered
    assert subject in log  # names the flow without revealing its contents
    assert MASKED_RECIPIENT in log  # enough to match a user report to a log line


def test_welcome_mail_does_not_log_the_display_name(caplog):
    subject, html = welcome_email("Deneme Kullanıcı")

    send_email(RECIPIENT, subject, html)

    log = caplog.text
    assert "Deneme Kullanıcı" not in log
    assert RECIPIENT not in log


@pytest.mark.parametrize(
    ("address", "expected"),
    [
        ("aday@ornek.com", "a***@ornek.com"),
        ("a@ornek.com", "a***@ornek.com"),
        ("bozuk-adres", "***"),
        ("@ornek.com", "***"),
        ("", "***"),
    ],
)
def test_mask_recipient_keeps_only_the_first_character(address, expected):
    assert email_service._mask_recipient(address) == expected


# ── The opt-in developer escape hatch ────────────────────────────────────────


def test_opt_in_env_gives_developers_the_link_back(caplog, monkeypatch):
    monkeypatch.setenv(DEV_LOG_LINK_ENV, "true")
    token, subject, html = _reset_message()

    send_email(RECIPIENT, subject, html)

    log = caplog.text
    assert token in log  # the whole point of the escape hatch
    assert RECIPIENT not in log  # ...but it is not a licence to log PII too
    assert "<div" not in log  # the link, not the body


def test_opt_in_stays_off_when_the_variable_is_unset(caplog):
    """The default is what production runs on, so it is what matters most."""
    token, subject, html = _reset_message()

    send_email(RECIPIENT, subject, html)

    assert DEV_LOG_LINK_ENV not in caplog.text
    assert token not in caplog.text


@pytest.mark.parametrize("value", ["", "false", "0", "off", "no", "1", "yes"])
def test_opt_in_needs_the_exact_value(caplog, monkeypatch, value):
    """
    A switch that leaks live tokens gets exactly one spelling. Anything else —
    including the "1" or "yes" a developer might reach for — leaves it off, so
    a stray value in a deployment's config cannot half-enable it.
    """
    monkeypatch.setenv(DEV_LOG_LINK_ENV, value)
    token, subject, html = _reset_message()

    send_email(RECIPIENT, subject, html)

    assert token not in caplog.text


def test_opt_in_has_nothing_to_say_about_a_linkless_message(caplog, monkeypatch):
    monkeypatch.setenv(DEV_LOG_LINK_ENV, "true")
    subject, html = welcome_email("Deneme Kullanıcı")

    send_email(RECIPIENT, subject, html)

    # No dangling "link: None" line for a message that has no call to action.
    assert DEV_LOG_LINK_ENV not in caplog.text


# ── With a provider configured (the live path) ───────────────────────────────


def test_configured_provider_logs_delivery_without_the_body(caplog, sent_requests):
    token, subject, html = _reset_message()

    assert send_email(RECIPIENT, subject, html) is True

    # The message really did reach the provider — this is about what the log
    # keeps, not about quietly dropping mail.
    payload = json.loads(sent_requests[0].data.decode("utf-8"))
    assert token in payload["html"]
    assert payload["to"] == [RECIPIENT]

    log = caplog.text
    assert token not in log
    assert "<div" not in log
    assert RECIPIENT not in log
    assert MASKED_RECIPIENT in log


def test_configured_provider_ignores_the_dev_switch(caplog, sent_requests, monkeypatch):
    """
    The opt-in is wired into the no-provider branch only, so a deployment that
    can actually send mail cannot leak a token even if the variable is set
    there by mistake.
    """
    monkeypatch.setenv(DEV_LOG_LINK_ENV, "true")
    token, subject, html = _reset_message()

    send_email(RECIPIENT, subject, html)

    log = caplog.text
    assert token not in log
    assert DEV_LOG_LINK_ENV not in log


def test_delivery_failure_reports_the_error_without_the_recipient(caplog, monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test-provider-key")

    def _explode(request, timeout=None):
        raise TimeoutError("connection timed out")

    monkeypatch.setattr(urllib.request, "urlopen", _explode)
    token, subject, html = _reset_message()

    assert send_email(RECIPIENT, subject, html) is False

    log = caplog.text
    assert "gönderilemedi" in log  # the failure is still visible
    assert RECIPIENT not in log
    assert token not in log
    assert MASKED_RECIPIENT in log
