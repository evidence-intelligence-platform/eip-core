"""
EIF: Transactional E-mail Service
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 08_SECURITY_ARCHITECTURE.md — operational notifications;
LAUNCH_READINESS.md launch blocker #1 (transactional e-mail infrastructure).
---
Provider-agnostic sender. Resend is the wire today (plain HTTPS POST, no SDK
dependency); swapping providers means changing only _deliver(). When
RESEND_API_KEY is not configured the service logs the message instead of
sending it, so every flow that ends in an e-mail (password reset, welcome)
remains fully testable in development — the reset link appears in the engine
log rather than an inbox.

Design constraints:
  - NEVER raises: a failed e-mail must not fail the request that queued it.
    Callers run this through FastAPI BackgroundTasks; an exception there
    would only poison the worker log anyway.
  - No new dependency: uses urllib from the standard library. The engine's
    endpoints are sync (run in the threadpool), and background tasks run
    after the response is sent, so a blocking HTTP call here never delays
    a user-facing response.
"""

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("eip.email")
# Under uvicorn's default logging config the root logger has no handler, so
# everything this module logs would vanish — including the dev-fallback reset
# link, which is the whole flow when RESEND_API_KEY is unset. Attach a console
# handler only when nothing upstream is configured to catch us.
if not logger.handlers and not logging.getLogger().handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

RESEND_API_URL = "https://api.resend.com/emails"

# Resend's shared onboarding sender works without domain verification but only
# delivers to the account owner's own address — fine for smoke tests, useless
# for real users. Set EMAIL_FROM after the domain is verified in Resend.
DEFAULT_FROM = "EIP <onboarding@resend.dev>"


def is_email_configured() -> bool:
    """True when a real provider key is present (delivery will be attempted)."""
    return bool(os.getenv("RESEND_API_KEY"))


def send_email(to: str, subject: str, html: str) -> bool:
    """
    Sends one transactional e-mail. Returns True when the provider accepted
    the message, False otherwise (including the not-configured dev fallback).

    Never raises — see module docstring.
    """
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        # Dev fallback: the flow keeps working end to end; the operator reads
        # the message (and any action link in it) from the engine log.
        logger.info(
            "RESEND_API_KEY yok — e-posta gönderilmedi (dev modu). to=%s subject=%r body:\n%s",
            to, subject, html,
        )
        return False

    payload = {
        "from": os.getenv("EMAIL_FROM", DEFAULT_FROM),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    request = urllib.request.Request(
        RESEND_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            # Resend answers 200 with {"id": ...} on acceptance.
            logger.info("E-posta gönderildi. to=%s subject=%r status=%s", to, subject, response.status)
            return True
    except urllib.error.HTTPError as exc:
        # The response body names the actual problem (unverified domain,
        # invalid recipient); without it the log only says "422".
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        logger.error("E-posta gönderilemedi. to=%s status=%s detail=%s", to, exc.code, detail)
        return False
    except Exception as exc:  # DNS failure, timeout, TLS error…
        logger.error("E-posta gönderilemedi. to=%s error=%r", to, exc)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Message templates (Turkish, minimal inline-styled HTML)
# ─────────────────────────────────────────────────────────────────────────────

def _layout(title: str, body_html: str) -> str:
    """Shared shell so every mail looks consistent without a template engine."""
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a222b">
  <h2 style="font-size:18px;margin:0 0 16px">{title}</h2>
  {body_html}
  <p style="font-size:12px;color:#8a97a3;border-top:1px solid #e3e8ee;margin-top:24px;padding-top:12px">
    Bu e-posta EIP — Evidence Intelligence Platform tarafından gönderildi.
    Bu işlemi siz başlatmadıysanız bu e-postayı yok sayabilirsiniz.
  </p>
</div>"""


def password_reset_email(reset_link: str) -> tuple[str, str]:
    """(subject, html) for the password reset message."""
    subject = "EIP — Şifre sıfırlama bağlantınız"
    html = _layout(
        "Şifrenizi sıfırlayın",
        f"""\
  <p style="font-size:14px;line-height:1.6">Hesabınız için bir şifre sıfırlama isteği aldık.
  Aşağıdaki bağlantı <strong>30 dakika</strong> boyunca geçerlidir ve yalnızca bir kez kullanılabilir.</p>
  <p style="margin:20px 0">
    <a href="{reset_link}"
       style="background:#1f6feb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block">
      Yeni şifre belirle</a>
  </p>
  <p style="font-size:12px;color:#5c6b7a">Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>{reset_link}</p>""",
    )
    return subject, html


def welcome_email(display_name: str) -> tuple[str, str]:
    """(subject, html) for the post-registration welcome message."""
    subject = "EIP'ye hoş geldiniz"
    html = _layout(
        f"Hoş geldiniz, {display_name}",
        """\
  <p style="font-size:14px;line-height:1.6">Hesabınız oluşturuldu. EIP, başvurularınızı belgeye dayalı
  kanıtlarla değerlendiren bir platformdur — beyan değil, kanıt konuşur.</p>
  <p style="font-size:14px;line-height:1.6">Belgeleriniz yalnızca sizin onayınızla işlenir; dilediğiniz an
  hesabınızı ve tüm verilerinizi Hesap sayfasından kalıcı olarak silebilirsiniz.</p>""",
    )
    return subject, html
