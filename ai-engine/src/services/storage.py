"""
EIF: Uploaded Evidence Blob Storage
---
Version: 1.1.0
Owner: EIF Architecture Team
Compliance: 01_ENGINEERING_CONSTITUTION.md Article II — the human review a
pending upload is waiting for is only possible while the file still exists.
---
Persists uploaded documents that await human moderation.

The stored filename is a uuid4 hex plus an extension derived from the sniffed
mime type — never from the user-supplied filename, which is caller-controlled
and may carry path separators or a misleading extension. The original name is
kept separately (sanitized) for display only.

WHERE THE BYTES LIVE — read this before deploying:
  UPLOAD_DIR decides, and it must point INSIDE a mounted persistent volume.
  Without it the fallback is <repo>/uploads, which inside the container is
  /app/uploads: the image's writable layer, discarded on every redeploy. What
  gets discarded there is precisely the review_status="pending" set — diplomas,
  driving licences, certificates, all of it PII — while the media_path column
  survives in Postgres, so the loss shows up later as an unviewable row rather
  than as an error at the moment it happens. docker-compose.yml mounts a named
  volume and DEPLOY.md covers the Railway volume; check_upload_dir_at_startup()
  below is what complains when neither was done.
"""

import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger("eip.storage")
# Under uvicorn's default logging config the root logger has no handler, so a
# startup warning about vanishing evidence would be swallowed exactly where it
# matters most — the deploy log. Mirrors eip.email's bootstrap.
if not logger.handlers and not logging.getLogger().handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

# Extension follows the *sniffed* mime, so a PNG uploaded as "diploma.pdf"
# is stored as .png. Keys mirror MediaAttachment.mime_type.
_MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
}

# Only a fallback for local runs from a checkout; in the container this is
# /app/uploads and it does NOT survive a redeploy — see the module docstring.
_DEFAULT_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


class UploadDirUnwritableError(RuntimeError):
    """Raised when the configured uploads directory cannot accept files."""


def _resolved_upload_dir() -> Path:
    """Where uploads belong, without touching the filesystem."""
    configured = os.getenv("UPLOAD_DIR")
    base = Path(configured) if configured else _DEFAULT_UPLOAD_DIR
    return base.resolve()


def _upload_dir() -> Path:
    """Resolved uploads directory; read per call so tests can repoint it."""
    base = _resolved_upload_dir()
    base.mkdir(parents=True, exist_ok=True)
    return base


def verify_upload_dir_writable() -> Path:
    """
    Proves the uploads directory can actually take a file, or raises.

    A probe write rather than an os.access() check: the failure modes that
    matter here — a volume that was never mounted, a read-only mount, a full
    disk — are the ones permission bits alone do not reveal.
    """
    base = _resolved_upload_dir()
    probe = base / f".write-probe-{uuid.uuid4().hex}"
    try:
        base.mkdir(parents=True, exist_ok=True)
        probe.write_bytes(b"")
    except OSError as exc:
        raise UploadDirUnwritableError(
            f"Kanıt deposu yazılabilir değil: {base} ({exc})"
        ) from exc
    finally:
        try:
            probe.unlink()
        except OSError:
            # Leaving a zero-byte probe behind is not worth failing a boot for.
            pass
    return base


def check_upload_dir_at_startup() -> bool:
    """
    Startup self-check; returns whether uploads will survive a redeploy.

    Logs instead of raising. An engine that refuses to boot takes down login,
    postings and — worse — the moderation queue itself, where an admin still
    has to be able to REJECT the rows whose files are already gone. So the
    verdict is written loudly to the deploy log while the upload path keeps
    failing at save_upload(), and the moderation router refuses to approve
    evidence nobody can open.
    """
    if not os.getenv("UPLOAD_DIR"):
        # Deliberately does not probe: creating the fallback directory here
        # would litter developer checkouts, and the durability problem is
        # already decided by the missing variable.
        logger.warning(
            "UPLOAD_DIR tanımlı değil. Yüklenen kanıt belgeleri %s altında, "
            "konteynerin geçici katmanında tutulacak ve her yeniden dağıtımda "
            "silinecek; insan onayı bekleyen belgeler kaybolur. Kalıcı bir birim "
            "bağlayıp UPLOAD_DIR'i onun içine yönlendirin (bkz. DEPLOY.md).",
            _DEFAULT_UPLOAD_DIR,
        )
        return False

    try:
        base = verify_upload_dir_writable()
    except UploadDirUnwritableError as exc:
        logger.error(
            "%s Belge yüklemeleri başarısız olacak ve moderasyon kuyruğu "
            "doğrulanamayacak.",
            exc,
        )
        return False

    logger.info("Kanıt deposu hazır: %s", base)
    return True


def sanitize_filename(name: str | None) -> str | None:
    """
    Reduces a caller-supplied filename to a safe display value.

    Strips any directory components (browsers on Windows may send full paths)
    and control characters; the result is only ever shown, never used to
    address the filesystem.
    """
    if not name:
        return None
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in name if ch.isprintable())
    return name[:255] or None


def save_upload(data: bytes, mime: str, original_filename: str) -> str:
    """
    Persists upload bytes and returns the relative path within UPLOAD_DIR.

    `original_filename` is deliberately ignored for naming — see module
    docstring. It is accepted so callers do not have to remember that rule.
    """
    extension = _MIME_EXTENSIONS.get(mime)
    if extension is None:
        raise ValueError(f"Desteklenmeyen dosya türü saklanamaz: {mime}")

    relative_path = uuid.uuid4().hex + extension
    (_upload_dir() / relative_path).write_bytes(data)
    return relative_path


def delete_upload(relative_path: str) -> bool:
    """
    Removes a stored upload from disk; returns whether a file was deleted.

    Used by KVKK account deletion. A blob that is already gone must not abort
    the erasure — that is reported as False, never raised. The traversal guard
    mirrors load_upload: a poisoned media_path ("../../.env") must not become
    an arbitrary file delete.
    """
    base = _upload_dir()
    target = (base / relative_path).resolve()
    if not target.is_relative_to(base):
        raise ValueError("Geçersiz dosya yolu.")
    try:
        target.unlink()
    except FileNotFoundError:
        return False
    return True


def upload_exists(relative_path: str | None) -> bool:
    """
    Whether a stored blob is still readable, without reading it.

    Moderation asks this before letting an admin approve: the file is what
    they are certifying they examined, and an ephemeral UPLOAD_DIR leaves the
    media_path row behind after the bytes are gone. A path that escapes the
    store answers False rather than raising — a poisoned row must not be able
    to confirm that some file outside UPLOAD_DIR exists.
    """
    if not relative_path:
        return False
    base = _resolved_upload_dir()
    try:
        target = (base / relative_path).resolve()
        if not target.is_relative_to(base):
            return False
        return target.is_file()
    except OSError:
        return False


def load_upload(relative_path: str) -> bytes:
    """
    Reads a stored upload back, refusing anything outside UPLOAD_DIR.

    The path comes from the database, but resolve-and-verify anyway: a
    poisoned row ("../../.env") must not become an arbitrary file read.
    """
    base = _upload_dir()
    target = (base / relative_path).resolve()
    if not target.is_relative_to(base):
        raise ValueError("Geçersiz dosya yolu.")
    if not target.is_file():
        raise FileNotFoundError(relative_path)
    return target.read_bytes()


# Import time is the only startup hook this module can rely on: main.py imports
# it while FastAPI is still building the app, so the verdict lands in the deploy
# log right after the [MIGRATE] lines — before the first candidate uploads a
# diploma into a directory the next redeploy will wipe.
check_upload_dir_at_startup()
