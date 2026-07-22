"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCandidateEvidences, Evidence } from "@/lib/api";

export default function CandidateDetailPage() {
  const params = useParams();
  const candidateId = params.id as string;
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvidences = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCandidateEvidences(candidateId);
      setEvidences(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while fetching candidate evidence.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (candidateId) {
      fetchEvidences();
    }
  }, [candidateId]);

  const verifiedCount = evidences.filter((e) => e.status === "VERIFIED").length;
  const insufficientCount = evidences.filter((e) => e.status === "INSUFFICIENT EVIDENCE").length;
  const contradictionCount = evidences.filter((e) => e.status === "CONTRADICTION").length;

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-4">
      {/* Header Breadcrumb & Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <Link href="/candidates" className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors mb-2 inline-flex items-center gap-1">
            &larr; Back to Candidates
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white">Candidate Details</h1>
          <p className="text-zinc-400 text-sm mt-1">
            External ID: <span className="font-mono text-zinc-200 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">{candidateId}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/reports/${candidateId}`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow"
          >
            📊 View Full Explainability Report
          </Link>
          <Link
            href="/candidate/hub"
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-semibold transition border border-zinc-700"
          >
            ⚡ Submit New Evidence
          </Link>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-1">
          <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Total Evaluated</span>
          <p className="text-3xl font-bold text-white">{evidences.length}</p>
        </div>
        <div className="bg-emerald-950/20 border border-emerald-800/40 p-5 rounded-xl space-y-1">
          <span className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Verified Claims</span>
          <p className="text-3xl font-bold text-emerald-400">{verifiedCount}</p>
        </div>
        <div className="bg-amber-950/20 border border-amber-800/40 p-5 rounded-xl space-y-1">
          <span className="text-xs text-amber-400 font-medium uppercase tracking-wider">Insufficient Evidence</span>
          <p className="text-3xl font-bold text-amber-400">{insufficientCount}</p>
        </div>
        <div className="bg-red-950/20 border border-red-800/40 p-5 rounded-xl space-y-1">
          <span className="text-xs text-red-400 font-medium uppercase tracking-wider">Contradictions</span>
          <p className="text-3xl font-bold text-red-400">{contradictionCount}</p>
        </div>
      </div>

      {/* Evidences List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">Extracted Evidences & AI Audit Trail</h2>
          <button
            onClick={fetchEvidences}
            className="text-xs text-zinc-400 hover:text-zinc-200 underline transition"
          >
            Refresh Data
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 rounded-xl text-sm">
            ❌ {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
            <div className="inline-block animate-spin text-blue-500 text-2xl">⏳</div>
            <p className="text-zinc-400 text-sm">Retrieving evidence records from Isolated Intelligence Zone...</p>
          </div>
        ) : evidences.length === 0 ? (
          <div className="p-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
            <p className="text-zinc-400">No evidence extractions recorded yet for this candidate.</p>
            <Link
              href="/candidate/hub"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition"
            >
              Analyze Candidate Evidence in Hub &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {evidences.map((e, index) => (
              <div
                key={e.id || index}
                className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 transition space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Requirement</span>
                    <span className="font-mono text-sm text-zinc-200 font-semibold">{e.requirement_external_id}</span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide border ${
                      e.status === "VERIFIED"
                        ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                        : e.status === "CONTRADICTION"
                        ? "bg-red-950/40 text-red-400 border-red-800/60"
                        : "bg-amber-950/40 text-amber-400 border-amber-800/60"
                    }`}
                  >
                    {e.status}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">AI Reasoning</h4>
                  <p className="text-zinc-200 text-sm leading-relaxed">{e.reasoning}</p>
                </div>

                {e.evidence_pointer && (
                  <div className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800/80 space-y-1">
                    <span className="block text-xs font-mono text-zinc-500">EVIDENCE POINTER:</span>
                    <p className="font-mono text-xs text-blue-400 break-all">{e.evidence_pointer}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                  <span>Source Type: <span className="text-zinc-300 font-mono">{e.source_type || "N/A"}</span></span>
                  {e.created_at && (
                    <span>Evaluated: {new Date(e.created_at).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
