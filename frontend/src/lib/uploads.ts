/**
 * Upload rules shared by every screen that accepts a document.
 *
 * Kept in one place so the accept attribute, the client-side check and the
 * help text cannot drift apart from the backend's policy.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** What the file picker offers. Photos matter: most certificates are phone shots. */
export const DOCUMENT_ACCEPT = ".pdf,.txt,.jpg,.jpeg,.png,.webp";

export const DOCUMENT_HINT = "PDF, fotoğraf (JPG/PNG) veya metin · en fazla 5 MB";

const ALLOWED_EXTENSIONS = ["pdf", "txt", "jpg", "jpeg", "png", "webp"];

/**
 * Returns an error message, or null when the file is acceptable.
 * The backend re-checks by content — this only spares the user an upload
 * that would be rejected anyway.
 */
export function validateDocument(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `Dosya çok büyük (${mb} MB). En fazla 5 MB yükleyebilirsiniz.`;
  }

  if (file.size === 0) {
    return "Dosya boş görünüyor. Lütfen başka bir dosya seçin.";
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return "Bu dosya türü desteklenmiyor. PDF, JPG, PNG veya metin dosyası yükleyebilirsiniz.";
  }

  return null;
}
