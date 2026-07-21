"use server";

// This is a Server Action that securely calls the Python AI Engine.
// It ensures the AI Engine doesn't need to be exposed to the public internet.

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

    const response = await fetch("http://localhost:8000/api/v1/extract", {
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
  } catch (error: any) {
    console.error("AI Engine Error:", error);
    return { success: false, error: error.message };
  }
}
