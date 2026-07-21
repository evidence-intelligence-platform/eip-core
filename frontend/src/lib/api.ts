export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface Candidate {
  id?: number;
  external_id: string;
  name: string;
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
  status: string;
  reasoning: string;
  evidence_pointer?: string;
  created_at?: string;
}

export async function getCandidates(): Promise<Candidate[]> {
  const res = await fetch(`${API_URL}/api/v1/candidates/`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch candidates");
  return res.json();
}

export async function createCandidate(candidate: Partial<Candidate>): Promise<Candidate> {
  const res = await fetch(`${API_URL}/api/v1/candidates/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(candidate),
  });
  if (!res.ok) throw new Error("Failed to create candidate");
  return res.json();
}

export async function getRequirements(): Promise<Requirement[]> {
  const res = await fetch(`${API_URL}/api/v1/requirements/`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch requirements");
  return res.json();
}

export async function createRequirement(requirement: Partial<Requirement>): Promise<Requirement> {
  const res = await fetch(`${API_URL}/api/v1/requirements/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requirement),
  });
  if (!res.ok) throw new Error("Failed to create requirement");
  return res.json();
}

export async function getCandidateEvidences(external_id: string): Promise<Evidence[]> {
  const res = await fetch(`${API_URL}/api/v1/candidates/${external_id}/evidences`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch evidences");
  return res.json();
}

export async function analyzeCandidateEvidence(candidateId: string, sourceType: string, rawData: string) {
  try {
    const payload = {
      payload: {
        candidate_id: candidateId,
        source_type: sourceType,
        raw_data: rawData
      },
      requirement: {
        id: "req_demo_1",
        description: "Must know React state management"
      }
    };

    const response = await fetch(`${API_URL}/api/v1/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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
    formData.append("source_type", "PDF_RESUME");
    formData.append("file", file);

    const response = await fetch(`${API_URL}/api/v1/extract/file`, {
      method: "POST",
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
