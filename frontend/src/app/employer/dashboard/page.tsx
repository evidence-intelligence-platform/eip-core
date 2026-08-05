"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SELECTABLE_CATEGORIES } from "@/lib/categories";
import {
  getJobs,
  getApplications,
  createJob,
  updateApplicationStatus,
  JobPosting,
  JobApplication,
  ProfessionCategory,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function EmployerDashboard() {
  const { user } = useAuth();
  const isCandidate = user?.role === "candidate";

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Job Form State
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState(user?.email ? user.email.split("@")[0] + " Şirketi" : "Acme Corp");
  const [category, setCategory] = useState<string>("OTHER");
  const [description, setDescription] = useState("");
  const [submittingJob, setSubmittingJob] = useState(false);
  const [jobSuccess, setJobSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsData, appsData] = await Promise.all([
        getJobs(),
        getApplications(),
      ]);
      setJobs(jobsData);
      setApplications(appsData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Veriler yüklenemedi.");
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
    if (!jobTitle || !description) return;

    try {
      setSubmittingJob(true);
      setJobSuccess(null);
      await createJob({
        title: jobTitle,
        company_name: companyName,
        category: category,
        description: description,
        status: "active",
      });
      setJobSuccess("🎉 Yeni iş ilanı başarıyla yayınlandı! Adaylar ilana başvurabilir.");
      setJobTitle("");
      setDescription("");
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setSubmittingJob(false);
    }
  };

  const handleUpdateStatus = async (appId: number, newStatus: "accepted" | "declined") => {
    try {
      await updateApplicationStatus(appId, newStatus);
      await fetchData();
    } catch (err: unknown) {
      // The message never contained "409" — the status lives on ApiError.
      if (err instanceof ApiError && err.status === 409) {
        setError("Bu başvurunun durumu daha önce değiştirilmiş. Lütfen sayfayı yenileyin.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Başvuru durumu güncellenemedi.");
      }
    }
  };

  // Role Guard Notice if a Candidate accidentally lands here
  if (isCandidate) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-4 shadow-xl">
          <div className="text-4xl">🏢</div>
          <h1 className="text-2xl font-bold text-white">İşveren Paneli</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Bu alan işverenlerin yeni iş ilanları yayınladığı ve gelen başvuruları değerlendirdiği yönetim panelidir. Aday Paneline geçmek için aşağıdaki butonu kullanabilirsiniz.
          </p>
          <div className="pt-2 flex justify-center gap-4">
            <Link
              href="/candidate/hub"
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition shadow"
            >
              🎯 Aday Paneline Git &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-slate-200">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black -z-10 pointer-events-none" />
      <div className="space-y-8 max-w-6xl mx-auto py-12 px-4 relative">
        {/* Employer Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            🏢 İşveren Yönetim & <span className="text-blue-500">İlan Yayınlama Paneli</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Giriş Yapan İşveren: <span className="font-semibold text-blue-400">{user?.email || "İşveren Kullanıcı"}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/candidates"
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs transition border border-zinc-700 flex items-center gap-1.5"
          >
            <span>👥</span> Aday Havuzu & Raporlar &rarr;
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl">
          ❌ {error}
        </div>
      )}

      {/* Employer Guidance Tip Banner */}
      <div className="p-6 bg-gradient-to-r from-blue-950/80 via-indigo-950/50 to-zinc-900 border border-blue-800/60 rounded-2xl space-y-3 shadow-xl">
        <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
          <span>💡</span> İŞVEREN ALIM REHBERİ & İPUÇLARI
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-300">
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-blue-900/40 space-y-1">
            <strong className="text-white block">1. Net Nitelikler Belirleyin</strong>
            <p className="text-zinc-400">İlan açıklamasında aradığınız deneyim ve sertifikaları net yazın. Gemini AI aday CV&apos;lerini bu kriterlere göre kıyaslar.</p>
          </div>
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-blue-900/40 space-y-1">
            <strong className="text-white block">2. Kanıt Skortablosunu İnceleyin</strong>
            <p className="text-zinc-400">Adayın detaylı raporuna tıklayarak doğrulanmış yetkinlik yüzdesini (%90+ Güvenilir) ve kanıt belgelerini görün.</p>
          </div>
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-blue-900/40 space-y-1">
            <strong className="text-white block">3. Tek Tıkla Onay / Red Verin</strong>
            <p className="text-zinc-400">Başvuruları inceledikten sonra adayın durumunu &ldquo;Kabul Edildi ✅&rdquo; veya &ldquo;Reddedildi ❌&rdquo; olarak anında güncelleyin.</p>
          </div>
        </div>
      </div>

      {/* Main Employer Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Create New Job Posting Section (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-6 shadow-2xl hover:border-white/20 transition-all duration-500">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">➕</span>
                <h2 className="text-lg font-bold text-white">Yeni İş İlanı Yayınla</h2>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-800">
                Anında Yayında
              </span>
            </div>

            {jobSuccess && (
              <div className="p-3.5 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl font-medium">
                {jobSuccess}
              </div>
            )}

            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Şirket / Kurum Adı
                </label>
                <input
                  type="text"
                  required
                  disabled={submittingJob}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Örn: Acme Sağlık A.Ş."
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    İlan Pozisyon Başlığı
                  </label>
                  <input
                    type="text"
                    required
                    disabled={submittingJob}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Örn: Kıdemli Uzman Doktor / Makam Şoförü"
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Meslek Sektörü & Kategorisi
                  </label>
                  <select
                    value={category}
                    disabled={submittingJob}
                    onChange={(e) => setCategory(e.target.value as ProfessionCategory)}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                  >
                    {SELECTABLE_CATEGORIES.map((c) => (

                      <option key={c.key} value={c.key}>

                        {c.icon} {c.label}

                      </option>

                    ))}

                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  İlan Tanımı & Aranan Nitelikler
                </label>
                <textarea
                  required
                  rows={5}
                  disabled={submittingJob}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Pozisyonun detaylarını, aranan sertifikaları, çalışma şartlarını ve beklentilerinizi ayrıntılı yazın..."
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition leading-relaxed disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={submittingJob}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-xs transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingJob ? "İlan Yayınlanıyor..." : "➕ İlanı Tüm Sektörlerde Yayınla & Aday Başvurularını Topla"}
              </button>
            </form>
          </div>
        </div>

        {/* Active Applications Review & Approval Panel (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-5 shadow-2xl hover:border-white/20 transition-all duration-500">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>📥</span> Gelen Aday Başvuruları
              </h2>
              <span className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full font-mono">
                {applications.length} Başvuru
              </span>
            </div>

            {loading ? (
              <p className="text-xs text-zinc-400">Başvurular yükleniyor...</p>
            ) : applications.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-xs text-zinc-400">Henüz ilanlarınıza başvuran aday bulunmuyor.</p>
                <p className="text-[11px] text-zinc-500">Adaylar başvuru yaptıkça burada listelenecektir.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {applications.map((app) => (
                  <div key={app.id} className="p-5 bg-black/40 border border-white/5 rounded-2xl space-y-4 hover:bg-white/5 transition-all duration-300 group">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Başvuru #{app.id}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                          app.status === "accepted"
                            ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                            : app.status === "declined"
                            ? "bg-red-950/60 text-red-400 border-red-800"
                            : "bg-amber-950/60 text-amber-400 border-amber-800"
                        }`}
                      >
                        {app.status === "accepted" ? "Kabul Edildi ✅" : app.status === "declined" ? "Reddedildi ❌" : "Değerlendiriliyor ⏳"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center gap-3 text-xs">
                      {/* The name and identity now come from the API; building
                          "cand_{id}" here pointed at a record that never existed. */}
                      <span className="text-zinc-300 font-medium truncate">
                        {app.candidate_name || `Aday #${app.candidate_id}`}
                      </span>
                      {app.candidate_external_id ? (
                        <Link
                          href={`/reports/${app.candidate_external_id}`}
                          className="text-blue-400 hover:underline font-semibold shrink-0"
                        >
                          Raporu İncele →
                        </Link>
                      ) : (
                        <span className="text-zinc-500 shrink-0">Rapor hazır değil</span>
                      )}
                    </div>

                    {/* Status Update Buttons */}
                    {/* "pending" is not a status the backend ever produces —
                        new applications default to "submitted". */}
                    {["submitted", "pending", "reviewing"].includes(app.status) && (
                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-900">
                        <button
                          onClick={() => handleUpdateStatus(app.id!, "accepted")}
                          className="flex-1 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded-lg text-[11px] font-semibold transition"
                        >
                          Kabul Et ✅
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(app.id!, "declined")}
                          className="flex-1 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded-lg text-[11px] font-semibold transition"
                        >
                          Reddet ❌
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
