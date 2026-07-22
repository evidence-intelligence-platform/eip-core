"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getReportData, ReportData } from "@/lib/api";

export default function ReportPage() {
  const params = useParams();
  const candidateId = params.id as string;
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getReportData(candidateId);
      setReport(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load report data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (candidateId) {
      fetchReport();
    }
  }, [candidateId]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <Link
          href={`/candidates/${candidateId}`}
          className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
        >
          &larr; Back to Candidate Profile
        </Link>
        <span className="text-xs font-mono text-zinc-500">EXPLAINABILITY REPORT ID: EXP-{candidateId}</span>
      </div>

      {/* Header Title */}
      <div className="text-center space-y-2">
        <span className="text-xs font-mono font-semibold text-blue-400 uppercase tracking-widest bg-blue-950/40 border border-blue-800/40 px-3 py-1 rounded-full">
          Evidence Intelligence Platform Analysis
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Candidate Match & Explainability Report
        </h1>
        <p className="text-zinc-400 text-sm">
          Candidate: <span className="font-semibold text-zinc-200">{report?.candidate?.name || candidateId}</span> (ID: <span className="font-mono text-zinc-300">{candidateId}</span>)
        </p>
      </div>

      {loading ? (
        <div className="p-16 text-center bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
          <div className="inline-block animate-spin text-blue-500 text-3xl">⏳</div>
          <p className="text-zinc-400 text-sm">Compiling explainability matrix from Isolated Intelligence Zone...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-950/40 border border-red-800 text-red-300 rounded-xl text-sm text-center">
          ❌ {error}
        </div>
      ) : (
        <>
          {/* Executive Match Score & Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-zinc-900 border border-zinc-800 p-6 rounded-xl">
            <div className="flex flex-col items-center justify-center p-4 border-r-0 md:border-r border-zinc-800 space-y-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Evidence Verified Match Score</span>
              <div className="text-5xl font-extrabold text-blue-400 font-mono">
                {report?.summary.score}%
              </div>
              <span className="text-xs text-zinc-500">
                {report?.summary.verified} of {report?.summary.total} requirements proven
              </span>
            </div>

            <div className="col-span-2 space-y-3 flex flex-col justify-center">
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Executive Overview</h3>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {report?.summary.score && report.summary.score >= 50
                  ? `Candidate ${report.candidate.name} has demonstrated verifiable evidence for key engineering requirements. Proven technical capability detected without subjective bias.`
                  : report?.summary.total === 0
                  ? `No evidence extractions have been run yet for candidate ${candidateId}. Please submit raw evidence payloads or PDF resumes in the Evidence Hub.`
                  : `Candidate ${report?.candidate.name} has unverified claims or insufficient evidence for critical requirements. Further human interview probing is recommended.`}
              </p>
              <div className="flex flex-wrap gap-4 text-xs font-mono text-zinc-400 pt-1">
                <span>Verified: <strong className="text-emerald-400">{report?.summary.verified}</strong></span>
                <span>Insufficient: <strong className="text-amber-400">{report?.summary.insufficient}</strong></span>
                <span>Contradictions: <strong className="text-red-400">{report?.summary.contradictions}</strong></span>
              </div>
            </div>
          </div>

          {/* Breakdown per requirement */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white tracking-tight">Requirement-by-Requirement Evidence Breakdown</h2>

            {report?.evidences.length === 0 ? (
              <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                <p className="text-zinc-400 text-sm">No evaluated evidence records available for this report.</p>
                <Link
                  href="/candidate/hub"
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition"
                >
                  Go to Evidence Hub &rarr;
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {report?.evidences.map((e, index) => (
                  <div
                    key={e.id || index}
                    className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 shadow-sm space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-500">[{index + 1}] REQUIREMENT:</span>
                        <span className="font-semibold text-zinc-200 text-sm">{e.requirement_external_id}</span>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          e.status === "VERIFIED"
                            ? "bg-emerald-950/40 text-emerald-400 border border-emerald-800/60"
                            : e.status === "CONTRADICTION"
                            ? "bg-red-950/40 text-red-400 border border-red-800/60"
                            : "bg-amber-950/40 text-amber-400 border border-amber-800/60"
                        }`}
                      >
                        {e.status} {e.status === "VERIFIED" ? "✅" : e.status === "CONTRADICTION" ? "❌" : "⚠️"}
                      </span>
                    </div>

                    <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/60 space-y-1">
                      <strong className="text-xs font-semibold text-blue-400 uppercase tracking-wider block">
                        AI Reasoning & Evaluation Trace
                      </strong>
                      <p className="text-sm text-zinc-300 leading-relaxed">{e.reasoning}</p>
                    </div>

                    {e.evidence_pointer ? (
                      <div className="flex items-start gap-3 text-xs bg-zinc-950/60 p-3 rounded border border-zinc-800">
                        <span className="font-mono text-zinc-500 uppercase tracking-wider shrink-0">EVIDENCE POINTER:</span>
                        <span className="font-mono text-blue-400 break-all">{e.evidence_pointer}</span>
                      </div>
                    ) : e.status === "INSUFFICIENT EVIDENCE" ? (
                      <div className="text-xs p-3 border border-amber-800/40 bg-amber-950/20 text-amber-300 rounded-lg">
                        💡 <strong>INTERVIEW PROMPT:</strong> Ask candidate to present tangible work samples or live codebase diffs addressing this requirement.
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Decision Bar */}
          <div className="pt-6 border-t border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
            {decision ? (
              <div className="w-full p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded-xl text-sm font-semibold text-center">
                ✅ Decision Logged: <span className="uppercase">{decision}</span>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setDecision("declined")}
                  className="w-full md:w-auto px-6 py-3 border border-red-800/60 text-red-400 hover:bg-red-950/30 rounded-xl font-semibold text-sm transition"
                >
                  Decline Candidate
                </button>
                <button
                  onClick={() => setDecision("interview_scheduled")}
                  className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition shadow"
                >
                  Schedule Human Interview
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
