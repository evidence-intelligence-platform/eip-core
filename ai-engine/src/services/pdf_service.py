import io

from pypdf import PdfReader

# Below this many characters per page we assume the PDF is a scan (an image
# wrapped in a PDF container) rather than a text document.
MIN_CHARS_PER_PAGE = 40


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Extracts text from a PDF file provided as bytes.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text
    except Exception as e:
        raise ValueError(f"Failed to parse PDF: {str(e)}")


def extract_text_or_flag_scanned(pdf_bytes: bytes) -> tuple[str, bool]:
    """
    Extracts text and reports whether the PDF looks like a scan.

    pypdf returns an empty string for scanned documents, which used to be sent
    to the model as empty evidence — producing a meaningless "insufficient
    evidence" verdict for a perfectly valid diploma. When the flag is True the
    caller should hand the raw PDF to the model as an image instead.

    Returns:
        (extracted_text, is_scanned)
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if reader.is_encrypted:
            raise ValueError("Parola korumalı PDF okunamıyor.")

        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

        page_count = max(len(reader.pages), 1)
        is_scanned = len(text.strip()) < MIN_CHARS_PER_PAGE * page_count
        return text, is_scanned
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"PDF okunamadı: {str(e)}")
