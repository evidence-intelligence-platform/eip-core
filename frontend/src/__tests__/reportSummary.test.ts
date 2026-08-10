import { describe, expect, it } from "vitest";
import { Evidence, isEvidenceApproved, summarizeEvidences } from "../lib/api";

/**
 * Frontend Unit Test Suite — Report Summary & Moderation Gate
 * ---
 * Verifies that pending/rejected evidence never counts toward the
 * candidate-facing score. The backend serves employers only approved rows,
 * so the same report URL must add up to the same score for both viewers.
 */

const row = (overrides: Partial<Evidence>): Evidence => ({
  candidate_external_id: "cand_test",
  requirement_external_id: "req_test",
  status: "VERIFIED",
  reasoning: "test",
  ...overrides,
});

describe("isEvidenceApproved — moderation gate", () => {
  it("passes approved evidence", () => {
    expect(isEvidenceApproved(row({ review_status: "approved" }))).toBe(true);
  });

  it("passes legacy rows without review_status (they predate moderation)", () => {
    expect(isEvidenceApproved(row({}))).toBe(true);
  });

  it("blocks pending evidence", () => {
    expect(isEvidenceApproved(row({ review_status: "pending" }))).toBe(false);
  });

  it("blocks rejected evidence", () => {
    expect(isEvidenceApproved(row({ review_status: "rejected" }))).toBe(false);
  });
});

describe("summarizeEvidences — score over approved rows only", () => {
  it("a rejected VERIFIED row cannot yield %100", () => {
    // The confirmed defect: one rejected row whose AI status is VERIFIED
    // showed the candidate %100 while the employer saw %0.
    const summary = summarizeEvidences([
      row({ status: "VERIFIED", review_status: "rejected" }),
    ]);
    expect(summary.total).toBe(0);
    expect(summary.verified).toBe(0);
    expect(summary.score).toBe(0);
  });

  it("candidate and employer views compute the same score", () => {
    const approved = row({ status: "VERIFIED", review_status: "approved" });
    // The candidate additionally receives their pending/rejected rows.
    const candidateView = [
      approved,
      row({ status: "VERIFIED", review_status: "pending" }),
      row({ status: "CONTRADICTION", review_status: "rejected" }),
    ];
    const employerView = [approved];

    const a = summarizeEvidences(candidateView);
    const b = summarizeEvidences(employerView);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ total: 1, verified: 1, score: 100, contradictions: 0 });
  });

  it("counts approved and legacy rows, excludes pending", () => {
    const summary = summarizeEvidences([
      row({ status: "VERIFIED", review_status: "approved" }),
      row({ status: "INSUFFICIENT EVIDENCE", review_status: "approved" }),
      row({ status: "CONTRADICTION" }), // legacy row, counts
      row({ status: "VERIFIED", review_status: "pending" }), // excluded
    ]);
    expect(summary.total).toBe(3);
    expect(summary.verified).toBe(1);
    expect(summary.insufficient).toBe(1);
    expect(summary.contradictions).toBe(1);
    expect(summary.score).toBe(Math.round((1 / 3) * 100));
  });
});
