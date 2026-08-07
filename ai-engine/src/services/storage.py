"""
EIF: Uploaded Evidence Blob Storage
---
Version: 1.0.0
Owner: EIF Architecture Team
---
Persists uploaded documents that await human moderation.

The stored filename is a uuid4 hex plus an extension derived from the sniffed
mime type — never from the user-supplied filename, which is caller-controlled
and may carry path separators or a misleading extension. The original name is
kept separately (sanitized) for display only.
"""

import os
import uuid
from pathlib import Path

# Extension follows the *sniffed* mime, so a PNG uploaded as "diploma.pdf"
# is stored as .png. Keys mirror MediaAttachment.mime_type.
_MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
}


def _upload_dir() -> Path:
    """Resolved uploads directory; read per call so tests can repoint it."""
    configured = os.getenv("UPLOAD_DIR")
    if configured:
        base = Path(configured)
    else:
        base = Path(__file__).resolve().parents[2] / "uploads"
    base = base.resolve()
    base.mkdir(parents=True, exist_ok=True)
    return base


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
