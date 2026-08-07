"""
EIF: Document Upload Tests
---
Covers the evidence pipeline for professions whose proof is a photograph.

A construction worker's safety certificate, a nurse's diploma and a driver's
licence arrive as phone photos or scans. The pipeline used to accept only PDF
and text: an image was run through `decode(errors="ignore")`, reached the model
as mojibake, and came back as INSUFFICIENT EVIDENCE — which, since the score is
verified/total, *lowered* the score of the candidate who attached it.
"""

import io

import pytest
from fastapi import HTTPException
from pypdf import PdfWriter

from src.models.schemas import MediaAttachment
from src.services.file_policy import sniff_kind
from src.services.pdf_service import extract_text_or_flag_scanned

PNG_HEADER = bytes.fromhex("89504e470d0a1a0a")
JPEG_HEADER = bytes.fromhex("ffd8ff")


def _blank_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


# ── File identification ──────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "data,expected_kind,expected_mime",
    [
        (PNG_HEADER + b"rest", "image", "image/png"),
        (JPEG_HEADER + b"rest", "image", "image/jpeg"),
        (b"RIFF" + b"1234" + b"WEBP" + b"rest", "image", "image/webp"),
        (b"%PDF-1.7 rest", "pdf", "application/pdf"),
        ("Sürücü belgesi: E sınıfı".encode("utf-8"), "text", "text/plain"),
    ],
)
def test_sniff_identifies_supported_types(data, expected_kind, expected_mime):
    assert sniff_kind(data, "belge") == (expected_kind, expected_mime)


def test_sniff_rejects_binary_disguised_as_text():
    """An executable renamed to .txt used to become mojibake "evidence"."""
    with pytest.raises(HTTPException) as exc:
        sniff_kind(b"MZ\x00\x00\x90binary payload", "cv.txt")
    assert exc.value.status_code == 415


def test_sniff_trusts_content_not_filename():
    """The filename is caller-controlled; the bytes are not."""
    assert sniff_kind(PNG_HEADER + b"rest", "diploma.pdf")[0] == "image"


# ── Attachment validation ────────────────────────────────────────────────────

def test_attachment_accepts_real_image():
    attachment = MediaAttachment(
        mime_type="image/png", data=PNG_HEADER + b"x" * 100, filename="sertifika.png"
    )
    assert attachment.mime_type == "image/png"


def test_attachment_rejects_mismatched_content():
    with pytest.raises(ValueError):
        MediaAttachment(mime_type="image/png", data=b"this is not a png")


def test_attachment_rejects_oversized_file():
    with pytest.raises(ValueError):
        MediaAttachment(mime_type="image/png", data=PNG_HEADER + b"x" * (6 * 1024 * 1024))


# ── Scanned PDFs ─────────────────────────────────────────────────────────────

def test_blank_pdf_is_flagged_as_scanned():
    """
    A scan has no text layer. Flagging it lets the caller send the file itself
    to the model instead of an empty string.
    """
    text, is_scanned = extract_text_or_flag_scanned(_blank_pdf())
    assert is_scanned is True
    assert text.strip() == ""


def test_corrupt_pdf_raises_readable_error():
    with pytest.raises(ValueError):
        extract_text_or_flag_scanned(b"%PDF- bozuk icerik")


# ── Endpoint authorization ───────────────────────────────────────────────────

def test_extraction_requires_signed_in_user(keyed_client):
    """
    Regression guard: both extraction endpoints were protected by the internal
    key alone, which the frontend proxy attaches to every request — so anyone
    could run extractions under any candidate_id they chose.
    """
    resp = keyed_client.post(
        "/api/v1/extract",
        json={
            "payload": {
                "candidate_id": "cand_1",
                "source_type": "PDF_RESUME",
                "raw_data": "deneme",
                "consent_verified": True,
            },
            "requirement": {"id": "req_1", "description": "deneme"},
        },
    )
    assert resp.status_code == 401


def test_file_extraction_requires_signed_in_user(keyed_client):
    resp = keyed_client.post(
        "/api/v1/extract/file",
        data={
            "candidate_id": "cand_1",
            "requirement_id": "req_1",
            "consent_verified": "true",
        },
        files={"file": ("cv.txt", b"deneme", "text/plain")},
    )
    assert resp.status_code == 401


def test_consent_gate_still_blocks_without_consent(candidate_client):
    """Consent remains a hard gate, ahead of any file handling."""
    resp = candidate_client.post(
        "/api/v1/extract/file",
        data={
            "candidate_id": "cand_1",
            "requirement_id": "req_1",
            "consent_verified": "false",
        },
        files={"file": ("cv.txt", "Yoğun bakım deneyimi".encode("utf-8"), "text/plain")},
    )
    assert resp.status_code in (400, 422)
