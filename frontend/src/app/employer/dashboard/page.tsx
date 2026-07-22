"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getJobs, createJob, getCandidates, JobPosting, Candidate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function EmployerDashboard() {
  const { user, token } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Job Modal state
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsData, candidatesData] = await Promise.all([
        getJobs().catch(() => []),
        getCandidates().catch(() => []),
      ]);
      setJobs(jobsData);
      setCandidates(candidatesData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load dashboard data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      await createJob({ title, description, company_name: "Acme Corp" }, token || undefined);
      setTitle("");
      setDescription("");
      setShowModal(false);
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Employer Intelligence Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Logged in as: <span className="font-semibold text-blue-400">{user?.email || "Employer"}</span>
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition shadow flex items-center gap-2 self-start md:self-auto"
        >
          <span>➕</span> Post New Job Requirement
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl">
          ❌ {error}
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-1">
          <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Active Job Postings</span>
          <p className="text-3xl font-extrabold text-white">{jobs.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-1">
          <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Analyzed Candidates</span>
          <p className="text-3xl font-extrabold text-blue-400">{candidates.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-1">
          <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">AI Evidence Audits</span>
          <p className="text-3xl font-extrabold text-emerald-400">100% Verifiable</p>
        </div>
      </div>

      {/* Active Jobs Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">Active Job Requirements ({jobs.length})</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-400 text-sm">
            Loading job postings...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
            <p className="text-zinc-400 text-sm">No active job postings created yet.</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition"
            >
              Post First Job &rarr;
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {jobs.map((j) => (
              <div key={j.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-3 hover:border-zinc-700 transition">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-lg">{j.title}</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800">
                    {j.status}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 line-clamp-2">{j.description}</p>
                <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-500">
                  <span>Job ID: #{j.id}</span>
                  <Link href="/candidates" className="text-blue-400 hover:underline font-semibold">
                    View Candidate Matches &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Candidates List Section */}
      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">Evaluated Candidates</h2>
          <Link href="/candidates" className="text-xs text-blue-400 hover:underline font-semibold">
            View All Candidates &rarr;
          </Link>
        </div>

        {candidates.length === 0 ? (
          <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl text-zinc-400 text-sm">
            No candidates recorded in the system yet. Run the database seeder (`python -m src.db.seed`) or evaluate evidence in the Evidence Hub.
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map((c) => (
              <div key={c.external_id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition">
                <div>
                  <h4 className="font-bold text-white">{c.name}</h4>
                  <span className="text-xs font-mono text-zinc-400">ID: {c.external_id}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/candidates/${c.external_id}`}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition border border-zinc-700"
                  >
                    View Details
                  </Link>
                  <Link
                    href={`/reports/${c.external_id}`}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition shadow"
                  >
                    Explainability Report &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post Job Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-lg w-full space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <h3 className="text-xl font-bold text-white">Post New Job Requirement</h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Job Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior React Architect"
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Job Description & Requirements
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe required skills (e.g. React Context, FastAPI, CI/CD)..."
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow disabled:opacity-50"
                >
                  {creating ? "Posting..." : "Publish Job Posting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
