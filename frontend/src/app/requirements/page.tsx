"use client";

import { useEffect, useState } from "react";
import { getRequirements, createRequirement, Requirement } from "@/lib/api";

export default function RequirementsPage() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExternalId, setNewExternalId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequirements = async () => {
    try {
      setLoading(true);
      const data = await getRequirements();
      setRequirements(data);
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
    fetchRequirements();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createRequirement({ external_id: newExternalId, description: newDescription });
      setNewExternalId("");
      setNewDescription("");
      await fetchRequirements();
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
        <h1 className="text-3xl font-bold tracking-tight">Requirements</h1>
        <p className="text-zinc-400 mt-2">Manage the skills and qualifications the AI will look for.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Requirement List</h2>
          {loading ? (
            <p className="text-zinc-400">Loading...</p>
          ) : requirements.length === 0 ? (
            <p className="text-zinc-500">No requirements found.</p>
          ) : (
            <div className="grid gap-4">
              {requirements.map((r) => (
                <div key={r.external_id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900">
                  <h3 className="font-medium text-lg text-white mb-2">{r.description}</h3>
                  <span className="text-xs font-mono px-2 py-1 bg-zinc-800 text-zinc-300 rounded">{r.external_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 sticky top-8">
            <h2 className="text-xl font-semibold mb-4">Add Requirement</h2>
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
                  placeholder="e.g. req_react_1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
                <textarea
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                  placeholder="e.g. Must have advanced knowledge of React state management"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-900 font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? "Adding..." : "Add Requirement"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
