"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getJobs,
  createJob,
  getCandidates,
  getApplications,
  createApplication,
  updateApplicationStatus,
  JobPosting,
  Candidate,
  JobApplication,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function EmployerDashboard() {
  const { user, token } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Job Modal state
  const [showJobModal, setShowJobModal] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [creatingJob, setCreatingJob] = useState(false);

  // New Application Modal state
  const [showAppModal, setShowAppModal] = useState(false);
  const [selectedCandId, setSelectedCandId] = useState<number | "">("");
  const [selectedJobId, setSelectedJobId] = useState<number | "">("");
  const [creatingApp, setCreatingApp] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsData, candidatesData, appsData] = await Promise.all([
        getJobs().catch(() => []),
        getCandidates().catch(() => []),
        getApplications().catch(() => []),
      ]);
      setJobs(jobsData);
      setCandidates(candidatesData);
      setApplications(appsData);
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
      setCreatingJob(true);
      await createJob({ title: jobTitle, description: jobDesc, company_name: "Acme Corp" }, token || undefined);
      setJobTitle("");
      setJobDesc("");
      setShowJobModal(false);
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      }
    } finally {
      setCreatingJob(false);
    }
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandId || !selectedJobId) return;
    try {
      setCreatingApp(true);
      await createApplication({
        candidate_id: Number(selectedCandId),
        job_id: Number(selectedJobId),
        status: "reviewing",
      });
      setShowAppModal(false);
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      }
    } finally {
      setCreatingApp(false);
    }
  };

  const handleStatusUpdate = async (appId: number, status: string) => {
    try {
      await updateApplicationStatus(appId, status);
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      }
    }
  };

  const getCandidateName = (candId: number) => {
    const c = candidates.find((cand) => cand.id === candId);
    return c ? `${c.name} (${c.external_id})` : `Candidate #${candId}`;
  };

  const getCandidateExternalId = (candId: number) => {
    const c = candidates.find((cand) => cand.id === candId);
    return c ? c.external_id : `cand_${candId}`;
  };

  const getJobTitle = (jobId: number) => {
    const j = jobs.find((job) => job.id === jobId);
    return j ? j.title : `Job #${jobId}`;
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAppModal(true)}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl text-sm transition border border-zinc-700"
          >
            📥 Submit Application
          </button>
          <button
            onClick={() => setShowJobModal(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition shadow"
          >
            ➕ Post New Job Requirement
          </button>
        </div>
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
          <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Active Applications</span>
          <p className="text-3xl font-extrabold text-blue-400">{applications.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-1">
          <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Evaluated Candidates</span>
          <p className="text-3xl font-extrabold text-emerald-400">{candidates.length}</p>
        </div>
      </div>

      {/* Candidate Applications Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">Candidate Job Applications ({applications.length})</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-400 text-sm">
            Loading candidate applications...
          </div>
        ) : applications.length === 0 ? (
          <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
            <p className="text-zinc-400 text-sm">No job applications submitted yet.</p>
            <button
              onClick={() => setShowAppModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition"
            >
              Submit First Application &rarr;
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <div
                key={app.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-bold text-white text-base">{getCandidateName(app.candidate_id)}</h4>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        app.status === "accepted"
                          ? "bg-emerald-950/40 text-emerald-400 border-emerald-800"
                          : app.status === "declined"
                          ? "bg-red-950/40 text-red-400 border-red-800"
                          : "bg-amber-950/40 text-amber-400 border-amber-800"
                      }`}
                    >
                      {app.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Applying for: <span className="font-semibold text-zinc-200">{getJobTitle(app.job_id)}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/reports/${getCandidateExternalId(app.candidate_id)}`}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition border border-zinc-700"
                  >
                    📊 Report
                  </Link>

                  {app.status !== "accepted" && (
                    <button
                      onClick={() => handleStatusUpdate(app.id!, "accepted")}
                      className="px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs font-semibold rounded-lg transition"
                    >
                      Accept ✅
                    </button>
                  )}

                  {app.status !== "declined" && (
                    <button
                      onClick={() => handleStatusUpdate(app.id!, "declined")}
                      className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800 text-xs font-semibold rounded-lg transition"
                    >
                      Decline ❌
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Jobs Section */}
      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">Active Job Postings ({jobs.length})</h2>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
            <p className="text-zinc-400 text-sm">No active job postings created yet.</p>
            <button
              onClick={() => setShowJobModal(true)}
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

      {/* Post Job Modal */}
      {showJobModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-lg w-full space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <h3 className="text-xl font-bold text-white">Post New Job Requirement</h3>
              <button onClick={() => setShowJobModal(false)} className="text-zinc-500 hover:text-white text-lg">
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
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
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
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder="Describe required skills (e.g. React Context, FastAPI, CI/CD)..."
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowJobModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingJob}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow disabled:opacity-50"
                >
                  {creatingJob ? "Posting..." : "Publish Job Posting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Application Modal */}
      {showAppModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-lg w-full space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <h3 className="text-xl font-bold text-white">Submit Candidate Application</h3>
              <button onClick={() => setShowAppModal(false)} className="text-zinc-500 hover:text-white text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateApp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Select Candidate
                </label>
                <select
                  required
                  value={selectedCandId}
                  onChange={(e) => setSelectedCandId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="">— Select Candidate —</option>
                  {candidates.map((c) => (
                    <option key={c.id || c.external_id} value={c.id}>
                      {c.name} ({c.external_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Select Target Job Posting
                </label>
                <select
                  required
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="">— Select Job Posting —</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} (ID #{j.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAppModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingApp}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow disabled:opacity-50"
                >
                  {creatingApp ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
