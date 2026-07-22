export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080";
export const INTERNAL_API_KEY = process.env.NEXT_PUBLIC_INTERNAL_API_KEY || "eif-test-internal-api-key";

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
  created_at?: string;
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

const getHeaders = (extra: Record<string, string> = {}) => ({
  "X-Internal-API-Key": INTERNAL_API_KEY,
  ...extra,
});

export async function getCandidates(): Promise<Candidate[]> {
  const res = await fetch(`${API_URL}/api/v1/candidates/`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch candidates");
  return res.json();
}

export async function createCandidate(candidate: Partial<Candidate>): Promise<Candidate> {
  const res = await fetch(`${API_URL}/api/v1/candidates/`, {
    method: "POST",
    headers: getHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(candidate),
  });
  if (!res.ok) throw new Error("Failed to create candidate");
  return res.json();
}

export async function getRequirements(): Promise<Requirement[]> {
  const res = await fetch(`${API_URL}/api/v1/requirements/`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch requirements");
  return res.json();
}

export async function createRequirement(requirement: Partial<Requirement>): Promise<Requirement> {
  const res = await fetch(`${API_URL}/api/v1/requirements/`, {
    method: "POST",
    headers: getHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(requirement),
  });
  if (!res.ok) throw new Error("Failed to create requirement");
  return res.json();
}

export async function getCandidateEvidences(external_id: string): Promise<Evidence[]> {
  const res = await fetch(`${API_URL}/api/v1/candidates/${external_id}/evidences`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch evidences");
  return res.json();
}

export async function analyzeCandidateEvidence(candidateId: string, sourceType: string, rawData: string) {
  try {
    const payload = {
      payload: {
        candidate_id: candidateId,
        source_type: sourceType,
        raw_data: rawData,
        consent_verified: true,
      },
      requirement: {
        id: "req_demo_1",
        description: "Must know React state management",
      },
    };

    const response = await fetch(`${API_URL}/api/v1/extract`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Unknown error" };
  }
}

export async function analyzeCandidateFile(
  candidateId: string,
  requirementId: string,
  file: File
) {
  try {
    const formData = new FormData();
    formData.append("candidate_id", candidateId);
    formData.append("requirement_id", requirementId);
    formData.append("consent_verified", "true");
    formData.append("source_type", "PDF_RESUME");
    formData.append("file", file);

    const response = await fetch(`${API_URL}/api/v1/extract/file`, {
      method: "POST",
      headers: getHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `API returned ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Unknown error" };
  }
}

export async function getReportData(candidateId: string): Promise<ReportData> {
  const candidates = await getCandidates().catch(() => []);
  const candidate = candidates.find((c) => c.external_id === candidateId) || {
    external_id: candidateId,
    name: candidateId,
  };

  const evidences = await getCandidateEvidences(candidateId).catch(() => []);

  const total = evidences.length;
  const verified = evidences.filter((e) => e.status === "VERIFIED").length;
  const insufficient = evidences.filter((e) => e.status === "INSUFFICIENT EVIDENCE").length;
  const contradictions = evidences.filter((e) => e.status === "CONTRADICTION").length;

  const score = total > 0 ? Math.round((verified / total) * 100) : 0;

  return {
    candidate,
    evidences,
    summary: {
      total,
      verified,
      insufficient,
      contradictions,
      score,
    },
  };
}
