"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCandidates, createCandidate, Candidate } from "@/lib/api";

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExternalId, setNewExternalId] = useState("");
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const data = await getCandidates();
      setCandidates(data);
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
    fetchCandidates();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createCandidate({ external_id: newExternalId, name: newName });
      setNewExternalId("");
      setNewName("");
      await fetchCandidates();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Candidates</h1>
        <p className="text-zinc-400 mt-2">Manage candidates and view their extracted evidence.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Candidate List</h2>
          {loading ? (
            <p className="text-zinc-400">Loading...</p>
          ) : candidates.length === 0 ? (
            <p className="text-zinc-500">No candidates found.</p>
          ) : (
            <div className="grid gap-4">
              {candidates.map((c) => (
                <div key={c.external_id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-lg">{c.name}</h3>
                    <p className="text-sm text-zinc-500 font-mono">{c.external_id}</p>
                  </div>
                  <Link href={`/candidates/${c.external_id}`} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                    View Evidences
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 sticky top-8">
            <h2 className="text-xl font-semibold mb-4">Add Candidate</h2>
            {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded-lg text-sm">{error}</div>}
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">External ID</label>
                <input
                  type="text"
                  required
                  value={newExternalId}
                  onChange={(e) => setNewExternalId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. cand_001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. John Doe"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-900 font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? "Adding..." : "Add Candidate"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
