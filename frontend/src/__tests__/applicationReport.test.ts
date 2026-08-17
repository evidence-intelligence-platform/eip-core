import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApplicationReport, getApplicationReport } from "../lib/api";

/**
 * Frontend Unit Test Suite — Application Report Contract
 * ---
 * The report is fetched in one call and keyed by application, and the score
 * arrives already computed. These tests lock the two properties that the
 * previous client-side assembly could not offer: two applications by the same
 * person resolve to two different documents, and the percentage on screen is
 * the engine's number rather than a ratio derived from whatever subset of rows
 * the caller's role happened to receive.
 */

const payload = (overrides: Partial<ApplicationReport> = {}): ApplicationReport => ({
  application_id: 42,
  job_id: 7,
  job_title: "Kıdemli Uzman Doktor",
  company_name: "Örnek Sağlık A.Ş.",
  candidate_external_id: "cand_a1b2",
  candidate_name: "Ayşe Yılmaz",
  application_status: "submitted",
  generated_at: "2026-08-15T09:30:00Z",
  evidence_score: 67,
  verified_count: 2,
  counted_count: 3,
  items: [],
  ...overrides,
});

const respondWith = (status: number, body: unknown) => {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getApplicationReport — one call, keyed by application", () => {
  it("requests the report of the given application id", async () => {
    const fetchMock = respondWith(200, payload());

    await getApplicationReport(42);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/eip/reports/42");
    expect(init.cache).toBe("no-store");
  });

  it("keeps two applications by the same candidate on separate URLs", async () => {
    const fetchMock = respondWith(200, payload());

    await getApplicationReport(42);
    await getApplicationReport(43);

    const urls = fetchMock.mock.calls.map((call) => (call as unknown as [string])[0]);
    expect(urls).toEqual(["/api/eip/reports/42", "/api/eip/reports/43"]);
  });

  it("accepts the id as the string a route segment yields", async () => {
    const fetchMock = respondWith(200, payload());

    await getApplicationReport("42");

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/eip/reports/42");
  });
});

describe("getApplicationReport — the score is the engine's", () => {
  it("returns the served score untouched, even where a client ratio would differ", async () => {
    // 2 of 3 counted rows verified would round to 67 client-side; the engine
    // answering 55 must survive, because it is the side that knows which rows
    // the viewer is allowed to see.
    respondWith(200, payload({ evidence_score: 55, verified_count: 2, counted_count: 3 }));

    const report = await getApplicationReport(42);

    expect(report.evidence_score).toBe(55);
    expect(report.verified_count).toBe(2);
    expect(report.counted_count).toBe(3);
  });

  it("passes the per-row counted flag through for the moderation notes", async () => {
    respondWith(
      200,
      payload({
        counted_count: 1,
        verified_count: 1,
        items: [
          {
            requirement_external_id: "req_1",
            requirement_description: "Uzmanlık belgesi",
            status: "VERIFIED",
            confidence_score: 91,
            reasoning: "Belge doğrulandı.",
            evidence_pointer: "sayfa 2",
            review_status: "approved",
            counted: true,
          },
          {
            requirement_external_id: "req_2",
            requirement_description: null,
            status: "VERIFIED",
            confidence_score: null,
            reasoning: "İncelemede.",
            evidence_pointer: null,
            review_status: "pending",
            counted: false,
          },
        ],
      })
    );

    const report = await getApplicationReport(42);

    expect(report.items.map((i) => i.counted)).toEqual([true, false]);
  });
});

describe("getApplicationReport — refusals speak Turkish", () => {
  it("explains a 403 without leaking the engine's English detail", async () => {
    respondWith(403, { detail: "Not authorized to view this report" });

    const err = await getApplicationReport(42).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).toContain("yetkiniz yok");
    expect((err as ApiError).message).not.toContain("Not authorized");
  });

  it("explains a 404 in terms of the application", async () => {
    respondWith(404, { detail: "Application not found" });

    const err = await getApplicationReport(999).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toContain("başvuruya ait");
  });

  it("rejects a candidate-keyed link without calling the engine", async () => {
    // Links minted while the report was keyed by candidate carry "cand_…";
    // forwarding one would spend a round trip to learn nothing.
    const fetchMock = respondWith(200, payload());

    const err = await getApplicationReport("cand_a1b2").catch((e: unknown) => e);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toContain("başvuru numarasına göre");
  });

  it("rejects an empty or non-numeric segment", async () => {
    const fetchMock = respondWith(200, payload());

    await expect(getApplicationReport("")).rejects.toBeInstanceOf(ApiError);
    await expect(getApplicationReport("12a")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
