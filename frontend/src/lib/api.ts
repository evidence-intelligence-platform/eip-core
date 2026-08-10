// All engine calls go through the same-origin server-side proxy
// (src/app/api/eip/[...path]/route.ts), which attaches the internal
// Zero Trust key on the server. The key must never appear here:
// NEXT_PUBLIC_ env vars are inlined into the browser bundle.
export const API_URL = "/api/eip";

export interface UserAccount {
  id: number;
  email: string;
  role: "employer" | "candidate" | "admin" | string;
  created_at?: string;
  /** Server-owned identity. Never build this client-side. */
  candidate_external_id?: string | null;
  /** Employer: the registered company name postings publish under. */
  company_name?: string | null;
  company_size?: string | null;
}

export interface Candidate {
  id?: number;
  external_id: string;
  name: string;
  consent_granted?: boolean;
  created_at?: string;
}

export interface Requirement {
  id?: number;
  external_id: string;
  description: string;
  created_at?: string;
}

export interface Evidence {
  id?: number;
  candidate_external_id: string;
  requirement_external_id: string;
  source_type?: string;
  status: "VERIFIED" | "INSUFFICIENT EVIDENCE" | "CONTRADICTION" | string;
  reasoning: string;
  evidence_pointer?: string;
  /**
   * Human moderation verdict. Employers are only ever served "approved"
   * rows; the owning candidate also receives "pending" and "rejected" rows
   * so the review outcome can be shown to them instead of silently hidden.
   */
  review_status?: "pending" | "approved" | "rejected" | string;
  created_at?: string;
}

/**
 * Category keys are defined in lib/categories.ts (the single source of truth,
 * mirrored by the backend column). Kept as a plain string so adding a sector
 * does not require touching this file.
 */
export type ProfessionCategory = string;

export interface AccomplishmentEntry {
  id?: string;
  candidate_external_id: string;
  category: ProfessionCategory;
  title: string;
  content: string;
  proof_link?: string;
  verified_by_ai?: boolean;
  created_at?: string;
}

export interface JobPosting {
  id?: number;
  company_id?: number;
  company_name?: string;
  title: string;
  description: string;
  category: ProfessionCategory | string;
  status: string;
  created_at?: string;
}

export interface JobApplication {
  id?: number;
  candidate_id: number;
  job_id: number;
  status: string;
  created_at?: string;
  // Returned by the list endpoint so the UI never has to guess the identity
  // used for report links.
  candidate_external_id?: string | null;
  candidate_name?: string | null;
  /**
   * AI-derived standout signals from the applicant's verified, moderation-
   * approved evidence — e.g. ["Sertifika/belge doğrulandı", "Özgeçmiş
   * doğrulandı"]. Shown as parenthetical tags so a recruiter reads the
   * highlight before opening the full report.
   */
  standout_traits?: string[];
  /**
   * Whether the signed-in caller may decide (accept/decline) this
   * application. Mirrors the backend PATCH guard: employers also see
   * applications into ownerless (pre-ownership) postings, but deciding those
   * always 403s — the dashboard must not offer buttons for them.
   */
  decidable?: boolean;
}

export interface ReportData {
  candidate: Candidate;
  evidences: Evidence[];
  summary: {
    total: number;
    verified: number;
    insufficient: number;
    contradictions: number;
    score: number;
  };
}

/**
 * The engine now authenticates the *user*, not just the proxy, so every
 * call needs the token. AuthContext keeps this in sync with localStorage
 * rather than each caller threading a token argument through.
 */
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

const getHeaders = (token?: string, extra: Record<string, string> = {}) => {
  const headers: Record<string, string> = {
    ...extra,
  };
  const bearer = token ?? authToken;
  if (bearer) {
    headers["Authorization"] = `Bearer ${bearer}`;
  }
  return headers;
};

/** Error carrying the HTTP status, so callers can branch on it (e.g. 409). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Turns a failed response into a Turkish, human-readable ApiError.
 * FastAPI validation errors put an *array* of objects in `detail`; rendering
 * that straight into JSX is what produced "[object Object]" on screen.
 */
async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : null;

  // Status-based Turkish messages win over the backend's English `detail`;
  // the raw text is a last resort so a Turkish UI never shows "Candidate not found".
  const BY_STATUS: Record<number, string> = {
    400: "Gönderilen bilgiler kabul edilmedi. Lütfen kontrol edin.",
    401: "Bu işlem için giriş yapmanız gerekiyor.",
    403: "Bu işlem için yetkiniz yok.",
    404: "Aradığınız kayıt bulunamadı.",
    409: "Bu kayıt daha önce işlenmiş.",
    413: "Dosya boyutu çok büyük.",
    429: "Çok fazla istek gönderildi. Lütfen biraz bekleyin.",
    502: "Sunucuya şu anda ulaşılamıyor. Lütfen birazdan tekrar deneyin.",
    503: "Sunucuya şu anda ulaşılamıyor. Lütfen birazdan tekrar deneyin.",
    504: "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
  };

  let message: string | null = BY_STATUS[res.status] ?? null;
  if (!message && typeof detail === "string") {
    message = detail;
  } else if (!message && Array.isArray(detail)) {
    // Pydantic reports the offending field in `loc` and an English `msg`.
    // Name the field in Turkish rather than passing the raw validator text on.
    const FIELD_LABELS: Record<string, string> = {
      email: "E-posta adresi",
      password: "Şifre",
      full_name: "Ad soyad",
      role: "Hesap türü",
      title: "Başlık",
      description: "Açıklama",
      status: "Durum",
      external_id: "Kayıt numarası",
      name: "İsim",
      candidate_id: "Aday",
      job_id: "İlan",
    };
    const fields = detail
      .map((d) => {
        if (!d || typeof d !== "object" || !Array.isArray((d as { loc?: unknown }).loc)) return null;
        const loc = (d as { loc: unknown[] }).loc;
        const field = String(loc[loc.length - 1] ?? "");
        return FIELD_LABELS[field] ?? null;
      })
      .filter((f): f is string => Boolean(f));

    const unique = [...new Set(fields)];
    if (unique.length === 1) message = `${unique[0]} geçersiz. Lütfen kontrol edin.`;
    else if (unique.length > 1) message = `Şu alanları kontrol edin: ${unique.join(", ")}.`;
  }

  if (!message) {
    if (res.status === 422) message = "Girdiğiniz bilgilerde eksik veya hatalı alan var.";
    else if (res.status >= 500) message = "Beklenmeyen bir sunucu hatası oluştu.";
    else message = fallback;
  }

  return new ApiError(message, res.status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth APIs
// ─────────────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toApiError(res, "E-posta veya şifre hatalı.");
  return res.json();
}

/** Employer-only company profile collected at registration. */
export interface CompanyProfile {
  company_name?: string;
  tax_number?: string;
  company_size?: string;
  company_email?: string;
}

export async function registerUser(
  email: string,
  password: string,
  role: string,
  fullName?: string,
  company?: CompanyProfile
) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      email,
      password,
      role,
      full_name: fullName,
      // Only sent for employers; the backend ignores them for candidates.
      ...(role === "employer" ? company : {}),
    }),
  });
  if (!res.ok) throw await toApiError(res, "Kayıt tamamlanamadı.");
  return res.json();
}

export async function getMe(token: string) {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: getHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res, "Hesap bilgileriniz alınamadı.");
  return res.json();
}

/**
 * Requests a password reset e-mail. The backend answers 202 with the same
 * generic message whether or not the address has an account, so this function
 * "succeeding" tells the caller nothing about account existence — by design.
 */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/auth/forgot-password`, {
    method: "POST",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw await toApiError(res, "İstek gönderilemedi. Lütfen tekrar deneyin.");
  return res.json();
}

/** Consumes an e-mailed reset token and sets the new password. */
export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/auth/reset-password`, {
    method: "POST",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (res.status === 400) {
    // The engine's 400 detail here is already a specific Turkish sentence
    // ("bağlantı geçersiz veya süresi dolmuş…"); the generic BY_STATUS text
    // would hide the one thing the user needs to know.
    const body = await res.json().catch(() => null);
    const detail = body && typeof body.detail === "string" ? body.detail : null;
    throw new ApiError(
      detail ?? "Şifre güncellenemedi. Bağlantı geçersiz veya süresi dolmuş olabilir.",
      400
    );
  }
  if (!res.ok)
    throw await toApiError(res, "Şifre güncellenemedi. Bağlantı geçersiz veya süresi dolmuş olabilir.");
  return res.json();
}

/**
 * Permanently deletes the signed-in user's account and owned data.
 * The engine answers 204 with no body, so there is nothing to parse —
 * callers clear local auth state themselves after this resolves.
 */
export async function deleteMyAccount(): Promise<void> {
  const res = await fetch(`${API_URL}/auth/me`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw await toApiError(res, "Hesabınız silinemedi. Lütfen tekrar deneyin.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Job & Application APIs
// ─────────────────────────────────────────────────────────────────────────────

export async function getJobs(): Promise<JobPosting[]> {
  const res = await fetch(`${API_URL}/jobs/`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res, "İş ilanları yüklenemedi.");
  return res.json();
}

export async function createJob(job: Partial<JobPosting>, token?: string): Promise<JobPosting> {
  const res = await fetch(`${API_URL}/jobs/`, {
    method: "POST",
    headers: getHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(job),
  });
  if (!res.ok) throw await toApiError(res, "İlan yayınlanamadı.");
  return res.json();
}

export async function getApplications(): Promise<JobApplication[]> {
  const res = await fetch(`${API_URL}/applications/`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res, "Başvurular yüklenemedi.");
  return res.json();
}

export async function createApplication(application: Partial<JobApplication>): Promise<JobApplication> {
  const res = await fetch(`${API_URL}/applications/`, {
    method: "POST",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify(application),
  });
  if (!res.ok) throw await toApiError(res, "Başvurunuz gönderilemedi.");
  return res.json();
}

export async function updateApplicationStatus(appId: number, status: string): Promise<JobApplication> {
  const res = await fetch(`${API_URL}/applications/${appId}`, {
    method: "PATCH",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw await toApiError(res, "Başvuru durumu güncellenemedi.");
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate & Evidence APIs
// ─────────────────────────────────────────────────────────────────────────────

export async function getCandidates(): Promise<Candidate[]> {
  const res = await fetch(`${API_URL}/candidates/`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res, "Aday listesi yüklenemedi.");
  return res.json();
}

/** Fetches one candidate. Returns null on 404 instead of throwing. */
export async function getCandidate(externalId: string): Promise<Candidate | null> {
  const res = await fetch(`${API_URL}/candidates/${encodeURIComponent(externalId)}`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await toApiError(res, "Aday kaydı alınamadı.");
  return res.json();
}

export async function createCandidate(candidate: Partial<Candidate>): Promise<Candidate> {
  const res = await fetch(`${API_URL}/candidates/`, {
    method: "POST",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify(candidate),
  });
  if (!res.ok) throw await toApiError(res, "Aday kaydı oluşturulamadı.");
  return res.json();
}

export async function getRequirements(): Promise<Requirement[]> {
  const res = await fetch(`${API_URL}/requirements/`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res, "Gereksinimler yüklenemedi.");
  return res.json();
}

export async function createRequirement(requirement: Partial<Requirement>): Promise<Requirement> {
  const res = await fetch(`${API_URL}/requirements/`, {
    method: "POST",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify(requirement),
  });
  if (!res.ok) throw await toApiError(res, "Gereksinim oluşturulamadı.");
  return res.json();
}

export async function getCandidateEvidences(external_id: string): Promise<Evidence[]> {
  const res = await fetch(`${API_URL}/candidates/${external_id}/evidences`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res, "Kanıtlar yüklenemedi.");
  return res.json();
}

export async function analyzeCandidateEvidence(
  candidateId: string,
  sourceType: string,
  rawData: string,
  requirementId: string,
  requirementDescription: string,
  // The user's actual consent, not a hardcoded true — sending true regardless
  // of what the person ticked makes the consent gate meaningless.
  consentVerified: boolean
) {
  try {
    const payload = {
      payload: {
        candidate_id: candidateId,
        source_type: sourceType,
        raw_data: rawData,
        consent_verified: consentVerified,
      },
      requirement: {
        id: requirementId,
        description: requirementDescription,
      },
    };

    const response = await fetch(`${API_URL}/extract`, {
      method: "POST",
      headers: getHeaders(undefined, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await toApiError(response, "Kanıt analizi tamamlanamadı.");
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Bilinmeyen bir hata oluştu." };
  }
}

/**
 * Shape of the engine's FileExtractionResult. `review_status` is "pending"
 * for image/scanned uploads, which wait for human moderation before the
 * evidence is shown to employers — the UI surfaces that to the candidate.
 */
export interface FileAnalysisData {
  status: "VERIFIED" | "INSUFFICIENT EVIDENCE" | "CONTRADICTION" | string;
  confidence_score?: number;
  reasoning?: string;
  evidence_pointer?: string | null;
  review_status?: "pending" | "approved" | string;
}

export type FileAnalysisResponse =
  | { success: true; data: FileAnalysisData }
  | { success: false; error: string };

export async function analyzeCandidateFile(
  candidateId: string,
  requirementId: string,
  file: File,
  consentVerified: boolean
): Promise<FileAnalysisResponse> {
  try {
    const formData = new FormData();
    formData.append("candidate_id", candidateId);
    formData.append("requirement_id", requirementId);
    formData.append("consent_verified", String(consentVerified));
    formData.append("source_type", "PDF_RESUME");
    formData.append("file", file);

    const response = await fetch(`${API_URL}/extract/file`, {
      method: "POST",
      headers: getHeaders(),
      body: formData,
    });

    if (!response.ok) {
      throw await toApiError(response, "Dosya analizi tamamlanamadı.");
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Bilinmeyen bir hata oluştu." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Moderation APIs (admin-only)
// ─────────────────────────────────────────────────────────────────────────────

export type ModerationReviewStatus = "pending" | "approved" | "rejected";

export interface ModerationEvidenceItem {
  id: number;
  candidate_external_id: string;
  requirement_external_id: string;
  source_type?: string | null;
  status: "VERIFIED" | "INSUFFICIENT EVIDENCE" | "CONTRADICTION" | string;
  confidence_score?: number | null;
  reasoning?: string | null;
  evidence_pointer?: string | null;
  review_status: ModerationReviewStatus | string;
  media_filename?: string | null;
  media_mime?: string | null;
  has_media: boolean;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
}

export interface ModerationEvidenceList {
  items: ModerationEvidenceItem[];
  total: number;
}

export async function listModerationEvidences(
  params: {
    review_status?: ModerationReviewStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ModerationEvidenceList> {
  const query = new URLSearchParams();
  if (params.review_status) query.set("review_status", params.review_status);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString();

  const res = await fetch(`${API_URL}/moderation/evidences${qs ? `?${qs}` : ""}`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res, "Moderasyon listesi yüklenemedi.");
  return res.json();
}

export async function decideModerationEvidence(
  id: number,
  review_status: "approved" | "rejected",
  note?: string
): Promise<ModerationEvidenceItem> {
  const trimmed = note?.trim();
  const res = await fetch(`${API_URL}/moderation/evidences/${id}`, {
    method: "PATCH",
    headers: getHeaders(undefined, { "Content-Type": "application/json" }),
    body: JSON.stringify(trimmed ? { review_status, note: trimmed } : { review_status }),
  });
  if (!res.ok) throw await toApiError(res, "Moderasyon kararı kaydedilemedi.");
  return res.json();
}

/**
 * Media requires the Authorization header, so a plain <img src> cannot load
 * it — callers fetch the Blob, createObjectURL it, and revoke on cleanup.
 */
export async function fetchModerationMedia(id: number): Promise<Blob> {
  const res = await fetch(`${API_URL}/moderation/evidences/${id}/media`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res, "Belge görüntülenemedi.");
  return res.blob();
}

/** True when human review allows this evidence to count toward the score. */
export function isEvidenceApproved(e: Evidence): boolean {
  // Missing field means a pre-moderation row; those were always shown.
  return !e.review_status || e.review_status === "approved";
}

/**
 * Score and counts over the *approved* rows only. The backend serves
 * employers nothing but approved evidence, so counting a pending or
 * rejected row here would show the candidate a percentage no employer can
 * ever see — the same report URL must add up to the same score for both.
 */
export function summarizeEvidences(evidences: Evidence[]): ReportData["summary"] {
  const scorable = evidences.filter(isEvidenceApproved);

  const total = scorable.length;
  const verified = scorable.filter((e) => e.status === "VERIFIED").length;
  const insufficient = scorable.filter((e) => e.status === "INSUFFICIENT EVIDENCE").length;
  const contradictions = scorable.filter((e) => e.status === "CONTRADICTION").length;

  const score = total > 0 ? Math.round((verified / total) * 100) : 0;

  return { total, verified, insufficient, contradictions, score };
}

export async function getReportData(candidateId: string): Promise<ReportData> {
  // The single-candidate endpoint answers the candidate the record is about
  // and the employers who evaluate applicants, so both can open this report.
  // Listing the roster here 403'd every candidate who clicked "Raporumu gör"
  // — that list is employer-only.
  const candidate = await getCandidate(candidateId);
  // No silent stand-in: fabricating a candidate here is what produced the
  // "ghost profile" — a 0% report for someone whose record was never found.
  if (!candidate) {
    throw new ApiError("Bu adaya ait kayıt bulunamadı.", 404);
  }

  const evidences = await getCandidateEvidences(candidateId);

  return {
    candidate,
    evidences,
    summary: summarizeEvidences(evidences),
  };
}
