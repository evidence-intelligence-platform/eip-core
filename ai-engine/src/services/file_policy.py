"""
EIF: Upload Policy
---
Version: 1.0.0
Owner: EIF Architecture Team
---
Decides what an uploaded file actually *is* and refuses what we cannot handle.

The endpoint used to trust the filename extension and the browser-supplied
content-type — both under the caller's control — then ran
`decode(errors="ignore")` over anything that was not a PDF. A 40 MB photo or
an executable renamed to .txt became garbled text and was sent to the model
as evidence.
"""

import os

from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", 5 * 1024 * 1024))

_CHUNK = 1024 * 1024

# (kind, mime) resolved from the leading bytes of the file.
_SIGNATURES: list[tuple[bytes, str, str]] = [
    (bytes.fromhex("ffd8ff"), "image", "image/jpeg"),
    (bytes.fromhex("89504e470d0a1a0a"), "image", "image/png"),
    (b"%PDF-", "pdf", "application/pdf"),
]


async def read_upload_limited(file: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """
    Reads an upload in chunks, aborting as soon as the limit is passed.

    Reading the whole file first would mean holding an oversized upload in
    memory just to reject it.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Dosya boyutu çok büyük. En fazla {max_bytes // (1024 * 1024)} MB yükleyebilirsiniz.",
            )
        chunks.append(chunk)

    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dosya boş görünüyor. Lütfen tekrar deneyin.",
        )
    return b"".join(chunks)


def sniff_kind(data: bytes, filename: str | None = None) -> tuple[str, str]:
    """
    Returns (kind, mime) where kind is "image", "pdf" or "text".

    Raises 415 for anything else, rather than mangling it into text.
    """
    for signature, kind, mime in _SIGNATURES:
        if data.startswith(signature):
            return kind, mime

    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image", "image/webp"

    # A NUL byte means binary; text files do not contain them.
    if b"\x00" in data[:8192]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Bu dosya türü desteklenmiyor. PDF, JPG, PNG veya metin dosyası yükleyebilirsiniz.",
        )

    try:
        data[:8192].decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Bu dosya türü desteklenmiyor. PDF, JPG, PNG veya metin dosyası yükleyebilirsiniz.",
        )

    return "text", "text/plain"
