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
      const data = await getCandidateEvidences(candidateId);
      setEvidences(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred");
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

  return (
    <div className="space-y-8">
      <div className="flex items-center space-x-4">
        <Link href="/candidates" className="text-zinc-400 hover:text-white transition-colors">
          &larr; Back
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Candidate Details</h1>
          <p className="text-zinc-400 mt-2">ID: <span className="font-mono text-white">{candidateId}</span></p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Extracted Evidences</h2>
        {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded-lg text-sm">{error}</div>}
        
        {loading ? (
          <p className="text-zinc-400">Loading evidences...</p>
        ) : evidences.length === 0 ? (
          <p className="text-zinc-500">No evidences found for this candidate. The AI Engine needs to process data for this candidate.</p>
        ) : (
          <div className="grid gap-6">
            {evidences.map((e, i) => (
              <div key={e.id || i} className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-400">Requirement: <span className="font-mono text-zinc-200">{e.requirement_external_id}</span></span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    e.status === "VERIFIED" ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800" : 
                    e.status === "CONTRADICTION" ? "bg-red-900/30 text-red-400 border border-red-800" :
                    "bg-amber-900/30 text-amber-400 border border-amber-800"
                  }`}>
                    {e.status}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-zinc-500 mb-1">Reasoning</h4>
                  <p className="text-zinc-300">{e.reasoning}</p>
                </div>
                {e.evidence_pointer && (
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 font-mono text-sm text-zinc-400">
                    <span className="block text-xs text-zinc-600 mb-2">{/* pointer */}</span>
                    {e.evidence_pointer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
