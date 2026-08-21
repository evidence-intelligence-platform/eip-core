"""
EIF: Transactional E-mail Service
---
Version: 1.2.0
Owner: EIF Architecture Team
Compliance: 08_SECURITY_ARCHITECTURE.md — operational notifications, and
Section 6 "Data Security Rules" (no PII outside the systems that need it);
LAUNCH_READINESS.md launch blocker #1 (transactional e-mail infrastructure).
---
Provider-agnostic sender. Resend is the wire today (plain HTTPS POST, no SDK
dependency); swapping providers means changing only send_email(). When
RESEND_API_KEY is not configured the service records that it skipped delivery
instead of sending, so every flow that ends in an e-mail (password reset,
welcome, application decision, evidence review) still runs end to end in
development.

What that record contains is deliberately thin: never the message body, never
the action link inside it, never the full recipient address. A password-reset
body carries a live single-use token, /forgot-password is public and
unauthenticated, and platform logs are readable by everyone with deployment
access — so a log line holding that body is an account-takeover primitive for
any address an attacker cares to name. Developers who want the link back can
opt in per machine; see _dev_link_logging_enabled().

Design constraints:
  - NEVER raises: a failed e-mail must not fail the request that queued it.
    Callers run this through FastAPI BackgroundTasks; an exception there
    would only poison the worker log anyway.
  - No new dependency: uses urllib from the standard library. The engine's
    endpoints are sync (run in the threadpool), and background tasks run
    after the response is sent, so a blocking HTTP call here never delays
    a user-facing response.
  - Logs are an untrusted audience. Every line this module writes must survive
    the question "what does this hand someone who can read it?" — which is why
    recipients go through _mask_recipient() on all paths, success included.
"""

import html
import json
import logging
import os
import re
import urllib.error
import urllib.request

logger = logging.getLogger("eip.email")
# Under uvicorn's default logging config the root logger has no handler, so
# everything this module logs would vanish and an operator would have no sign
# that mail was even attempted. Attach a console handler only when nothing
# upstream is configured to catch us; records still propagate, so an app that
# configures logging later keeps full control of the output.
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

DEV_LOG_LINK_ENV = "EMAIL_DEV_LOG_LINK"

# Templates build their call to action as a single anchor, so the first href is
# the link a developer would otherwise have to dig out of the raw body.
_ACTION_LINK_PATTERN = re.compile(r'href="([^"]+)"')


def is_email_configured() -> bool:
    """True when a real provider key is present (delivery will be attempted)."""
    return bool(os.getenv("RESEND_API_KEY"))


def _mask_recipient(address: str) -> str:
    """
    Reduces an address to something a log can hold: "aday@example.com" becomes
    "a***@example.com".

    Enough survives to tell two accounts apart while reading a log; not enough
    to contact, enumerate or identify the person behind it.
    """
    local, separator, domain = address.partition("@")
    if not separator or not local:
        # Not a shape we can reason about — say nothing rather than guess.
        return "***"
    return f"{local[0]}***@{domain}"


def _dev_link_logging_enabled() -> bool:
    """
    True only when EMAIL_DEV_LOG_LINK is explicitly set to "true".

    LOCAL DEVELOPMENT ONLY — never turn this on in a live environment. The
    action link in a password-reset message is the single-use token in
    plaintext, so with this on, log access equals account takeover. Two locks
    keep production safe: the variable is off unless explicitly set, and the
    link is only ever written on the no-provider dev path (see send_email), so
    a deployment with RESEND_API_KEY set cannot leak the link even if someone
    sets this by mistake.
    """
    return os.getenv(DEV_LOG_LINK_ENV, "false").strip().lower() == "true"


def _action_link(html: str) -> str | None:
    """The message's call-to-action URL, or None for bodies without one."""
    match = _ACTION_LINK_PATTERN.search(html)
    return match.group(1) if match else None


def send_email(to: str, subject: str, html: str) -> bool:
    """
    Sends one transactional e-mail. Returns True when the provider accepted
    the message, False otherwise (including the not-configured dev fallback).

    Never raises — see module docstring. Nothing it logs identifies the
    recipient or reveals the message contents.
    """
    masked_to = _mask_recipient(to)
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        # Dev fallback: the flow keeps working end to end, but only the fact of
        # the attempt is recorded — the body would carry a live reset token.
        logger.info(
            "RESEND_API_KEY yok — e-posta gönderilmedi (dev modu). to=%s subject=%r",
            masked_to, subject,
        )
        if _dev_link_logging_enabled():
            link = _action_link(html)
            if link:
                # WARNING, not INFO: a log scraped for anomalies should show
                # that a machine is running with the secret-leaking switch on.
                logger.warning(
                    "%s açık — bağlantı loglanıyor, yalnızca yerel geliştirme: %s",
                    DEV_LOG_LINK_ENV, link,
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
            logger.info(
                "E-posta gönderildi. to=%s subject=%r status=%s",
                masked_to, subject, response.status,
            )
            return True
    except urllib.error.HTTPError as exc:
        # Resend's error payload names the actual problem (unverified domain,
        # rejected recipient); without it the log only says "422". It describes
        # the request, never echoes the body we posted.
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        logger.error(
            "E-posta gönderilemedi. to=%s status=%s detail=%s", masked_to, exc.code, detail
        )
        return False
    except Exception as exc:  # DNS failure, timeout, TLS error…
        logger.error("E-posta gönderilemedi. to=%s error=%r", masked_to, exc)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Message templates (Turkish, minimal inline-styled HTML)
# ─────────────────────────────────────────────────────────────────────────────

# Footer for mail the recipient asked for (reset link, welcome).
DEFAULT_FOOTER_NOTE = "Bu işlemi siz başlatmadıysanız bu e-postayı yok sayabilirsiniz."

# Footer for mail sent *about* the recipient — see _layout.
NOTIFICATION_FOOTER_NOTE = (
    "Bu bildirimi, EIP üzerindeki başvurunuz veya belgeniz hakkında bir karar "
    "verildiği için aldınız."
)

# Both notification templates land the candidate on the same page: the hub
# lists their applications and the review state of every document they
# uploaded, so there is nothing deeper to link to.
CANDIDATE_HUB_PATH = "/candidate/hub"


def _candidate_hub_link() -> str:
    """
    Absolute link into the candidate hub.

    Built from the same FRONTEND_URL the password-reset link uses, so one
    correct value covers every outgoing link. Unlike a reset link this URL
    carries no secret — it is only useful to someone who can already sign in.
    """
    base = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}{CANDIDATE_HUB_PATH}"

def _layout(title: str, body_html: str, footer_note: str = DEFAULT_FOOTER_NOTE) -> str:
    """
    Shared shell so every mail looks consistent without a template engine.

    `footer_note` is overridable because the default line ("ignore this if you
    did not start it") only fits messages the recipient asked for. A decision
    notice is sent *about* someone, not requested by them, so telling that
    reader to ignore it would be advice to miss the verdict on their own
    application.
    """
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a222b">
  <h2 style="font-size:18px;margin:0 0 16px">{title}</h2>
  {body_html}
  <p style="font-size:12px;color:#8a97a3;border-top:1px solid #e3e8ee;margin-top:24px;padding-top:12px">
    Bu e-posta EIP — Evidence Intelligence Platform tarafından gönderildi.
    {footer_note}
  </p>
</div>"""


def _call_to_action(link: str, label: str) -> str:
    """The single action button the notification templates share."""
    return f"""\
  <p style="margin:20px 0">
    <a href="{link}"
       style="background:#1f6feb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block">
      {label}</a>
  </p>"""


def _quoted_note(heading: str, note: str | None) -> str:
    """
    Optional quoted note, or "" when there is nothing to quote.

    The text is written by another human (an employer's decision note, an
    admin's rejection reason) and reaches the reader from the platform's own
    sending domain, so it is escaped exactly like welcome_email's display name.
    """
    if not note or not note.strip():
        return ""
    safe_note = html.escape(note.strip())
    return f"""\
  <p style="font-size:14px;line-height:1.6;margin:16px 0 4px"><strong>{heading}</strong></p>
  <p style="font-size:14px;line-height:1.6;margin:0;padding:10px 12px;color:#3c4a5a;background:#f4f7fa;border-left:3px solid #cfd8e3">{safe_note}</p>"""


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
    # display_name is caller-supplied (RegisterRequest.full_name) with no
    # content restrictions: escape before interpolating into the message HTML,
    # or a registrant's own name becomes a markup-injection vector delivered
    # from the platform's trusted sending domain.
    safe_name = html.escape(display_name)
    message_html = _layout(
        f"Hoş geldiniz, {safe_name}",
        """\
  <p style="font-size:14px;line-height:1.6">Hesabınız oluşturuldu. EIP, başvurularınızı belgeye dayalı
  kanıtlarla değerlendiren bir platformdur — beyan değil, kanıt konuşur.</p>
  <p style="font-size:14px;line-height:1.6">Belgeleriniz yalnızca sizin onayınızla işlenir; dilediğiniz an
  hesabınızı ve tüm verilerinizi Hesap sayfasından kalıcı olarak silebilirsiniz.</p>""",
    )
    return subject, message_html


def application_decision_email(
    job_title: str | None, decision: str, note: str | None = None
) -> tuple[str, str]:
    """
    (subject, html) for the employer's verdict on one application.

    `decision` is the application's new status; only "accepted" reads as a
    positive outcome, and the router calls this for final decisions only —
    "reviewing" is housekeeping, not news worth a mail.

    The posting title stays out of the subject on purpose: send_email logs the
    subject on every path, and a line pairing a masked address with a named
    posting and its verdict says considerably more about a person than the
    flow name it is there to record.
    """
    accepted = decision == "accepted"
    subject = (
        "EIP — Başvurunuz kabul edildi" if accepted
        else "EIP — Başvurunuz olumsuz sonuçlandı"
    )

    # job_title is employer-supplied free text; escape before interpolating.
    # It can also be missing — a posting deleted between the decision and this
    # call leaves the mail without one, and "" would render as empty quotes.
    safe_title = html.escape(job_title.strip()) if job_title and job_title.strip() else None
    subject_phrase = (
        f'<strong>&laquo;{safe_title}&raquo;</strong> ilanına yaptığınız başvuru'
        if safe_title else "Bir ilana yaptığınız başvuru"
    )

    if accepted:
        heading = "Başvurunuz kabul edildi"
        lead = (
            f"""  <p style="font-size:14px;line-height:1.6">{subject_phrase} <strong>kabul edildi</strong>."""
            """ İşveren süreci buradan sürdürecek; gelişmeleri aday panelinizden takip edebilirsiniz.</p>"""
        )
    else:
        heading = "Başvurunuz olumsuz sonuçlandı"
        lead = (
            f"""  <p style="font-size:14px;line-height:1.6">{subject_phrase} bu kez <strong>olumsuz sonuçlandı</strong>."""
            """ Karar yalnızca bu ilan içindir: profiliniz ve doğrulanmış belgeleriniz geçerliliğini korur,"""
            """ diğer ilanlara başvurmaya devam edebilirsiniz.</p>"""
        )

    body_parts = [
        lead,
        _quoted_note("İşverenin notu:", note),
        _call_to_action(_candidate_hub_link(), "Başvurularımı görüntüle"),
    ]
    message_html = _layout(
        heading,
        "\n".join(part for part in body_parts if part),
        footer_note=NOTIFICATION_FOOTER_NOTE,
    )
    return subject, message_html


def evidence_review_email(
    document_label: str | None, decision: str, note: str | None = None
) -> tuple[str, str]:
    """
    (subject, html) for the moderator's verdict on one uploaded document.

    `decision` is the evidence row's new review_status; anything other than
    "approved" is presented as a rejection. The rejection reason — which the
    candidate previously had no way to learn at all — is the `note`.
    """
    approved = decision == "approved"
    subject = "EIP — Belgeniz onaylandı" if approved else "EIP — Belgeniz reddedildi"

    # The stored original filename, which the uploader themselves chose. Only
    # ever sent back to that same person, and escaped like any other free text.
    safe_label = (
        html.escape(document_label.strip())
        if document_label and document_label.strip() else None
    )
    subject_phrase = (
        f'<strong>&laquo;{safe_label}&raquo;</strong> adlı belgeniz'
        if safe_label else "Yüklediğiniz belge"
    )

    if approved:
        heading = "Belgeniz onaylandı"
        lead = (
            f"""  <p style="font-size:14px;line-height:1.6">{subject_phrase} bir yetkili tarafından incelendi ve"""
            """ <strong>onaylandı</strong>. Bu belge artık başvurularınızda doğrulanmış kanıt olarak değerlendiriliyor.</p>"""
        )
    else:
        heading = "Belgeniz reddedildi"
        lead = (
            f"""  <p style="font-size:14px;line-height:1.6">{subject_phrase} bir yetkili tarafından incelendi ve"""
            """ <strong>reddedildi</strong>. Bu belge kanıt olarak sayılmaz; okunaklı ve eksiksiz bir kopyasını"""
            """ yeniden yükleyebilirsiniz.</p>"""
        )

    body_parts = [
        lead,
        _quoted_note("Değerlendirme notu:", note),
        _call_to_action(_candidate_hub_link(), "Belgelerimi görüntüle"),
    ]
    message_html = _layout(
        heading,
        "\n".join(part for part in body_parts if part),
        footer_note=NOTIFICATION_FOOTER_NOTE,
    )
    return subject, message_html
