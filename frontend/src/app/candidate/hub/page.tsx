"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  getJobs,
  getApplications,
  analyzeCandidateFile,
  getCandidateEvidences,
  JobPosting,
  JobApplication,
  Evidence,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function CandidateEvidenceHub() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resume Upload state
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [consentVerified, setConsentVerified] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const candidateExtId = `cand_${user?.email ? user.email.replace(/[^a-zA-Z0-9]/g, "_") : "demo"}`;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsData, appsData, evData] = await Promise.all([
        getJobs().catch(() => []),
        getApplications().catch(() => []),
        getCandidateEvidences(candidateExtId).catch(() => []),
      ]);
      setJobs(jobsData);
      setApplications(appsData);
      setEvidences(evData);
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
  }, [user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    if (!consentVerified) {
      alert("⚠️ Zero Trust Consent Gate Uyarısı: Özgeçmişinizin AI tarafından analiz edilmesi için rıza seçeneğini onaylamalısınız.");
      return;
    }

    try {
      setAnalyzing(true);
      setAnalysisResult(null);

      const reqId = selectedJobId ? `req_job_${selectedJobId}` : "req_general_cv";
      const res = await analyzeCandidateFile(candidateExtId, reqId, file);

      if (res.success) {
        setAnalysisResult(res.data);
      } else {
        setError(`AI Analiz Hatası: ${res.error}`);
      }

      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const getJobTitle = (jobId: number) => {
    const j = jobs.find((job) => job.id === jobId);
    return j ? j.title : `İş İlanı #${jobId}`;
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Aday Paneli & <span className="text-emerald-400">Kanıt Hub&apos;ı</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Giriş Yapan Aday: <span className="font-semibold text-emerald-400">{user?.email || "Aday Kullanıcı"}</span>
          </p>
        </div>
        <Link
          href="/jobs"
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition shadow flex items-center justify-center gap-2"
        >
          <span>💼</span> Tüm İş İlanlarını İncele &rarr;
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl">
          ❌ {error}
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: CV Upload & Analysis (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-5 shadow-lg">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <span className="text-xl">📄</span>
              <h2 className="text-lg font-bold text-white">Özgeçmiş Yükle & AI Yetkinlik Analizi</h2>
            </div>

            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Hedef Pozisyon / İlan (Opsiyonel)
                </label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                >
                  <option value="">— Genel Özgeçmiş Değerlendirmesi —</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} (İlan #{j.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  PDF / TXT Özgeçmiş Dosyası
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-8 border-2 border-dashed border-zinc-700 hover:border-emerald-500 bg-zinc-950 rounded-xl text-center cursor-pointer transition"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {file ? (
                    <p className="text-emerald-400 text-sm font-semibold">📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
                  ) : (
                    <p className="text-zinc-400 text-xs">
                      CV dosyanızı seçmek için <span className="text-emerald-400 underline">tıklayın</span> (.pdf veya .txt)
                    </p>
                  )}
                </div>
              </div>

              {/* Consent Gate Checkbox */}
              <div className="p-4 bg-emerald-950/30 border border-emerald-800/50 rounded-xl space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentVerified}
                    onChange={(e) => setConsentVerified(e.target.checked)}
                    className="mt-1 accent-emerald-500 w-4 h-4"
                  />
                  <span className="text-xs text-zinc-300 leading-normal">
                    <strong className="text-emerald-400">Zero Trust Aday Rızası (Consent Verified):</strong> Özgeçmişimin işveren tarafından Gemini AI ile analiz edilmesine ve yetkinlik kanıtı üretilmesine rıza gösteriyorum.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={analyzing || !file}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition shadow disabled:opacity-50"
              >
                {analyzing ? "AI Analizi Yapılıyor..." : "🔍 Özgeçmişimi AI İle Analiz Et"}
              </button>
            </form>
          </div>

          {/* AI Analysis Result Display */}
          {analysisResult && (
            <div className="bg-zinc-900 border border-emerald-800 p-6 rounded-2xl space-y-4 bg-emerald-950/20 shadow-xl">
              <div className="flex items-center justify-between border-b border-emerald-800/60 pb-3">
                <h3 className="font-bold text-emerald-400 text-base">🧠 Gemini AI Analiz Sonucu</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-900 text-emerald-300 border border-emerald-700">
                  {analysisResult.status}
                </span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{analysisResult.reasoning}</p>
              {analysisResult.evidence_pointer && (
                <div className="p-3 bg-zinc-950 border-l-4 border-emerald-500 text-xs font-mono text-emerald-400 rounded-r-lg">
                  &ldquo;{analysisResult.evidence_pointer}&rdquo;
                </div>
              )}
              <div className="pt-2">
                <Link
                  href={`/reports/${candidateExtId}`}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl text-center block transition shadow"
                >
                  📊 Detaylı Kanıt & Açıklanabilirlik Raporunu Gör &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Active Applications & Saved Evidences (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Applications Status Card */}
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4 shadow-lg">
            <h2 className="text-lg font-bold text-white flex items-center justify-between border-b border-zinc-800 pb-3">
              <span>📌 Başvurularım</span>
              <span className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full font-mono">
                {applications.length} Başvuru
              </span>
            </h2>

            {loading ? (
              <p className="text-xs text-zinc-400">Yükleniyor...</p>
            ) : applications.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-xs text-zinc-400">Henüz hiçbir iş ilanına başvurmadınız.</p>
                <Link
                  href="/jobs"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg inline-block transition"
                >
                  İlanlara Göz At &rarr;
                </Link>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {applications.map((app) => (
                  <div key={app.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-white">{getJobTitle(app.job_id)}</p>
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
                    <p className="text-[10px] text-zinc-500">Başvuru ID: #{app.id}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Stats Card */}
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-3 shadow-lg">
            <h3 className="text-sm font-bold text-white">📊 Doğrulanmış AI Kanıtlarım</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Veritabanında sizin için kayıtlı toplam <strong className="text-emerald-400">{evidences.length} adet</strong> yetkinlik kanıtı bulunmaktadır.
            </p>
            <Link
              href={`/reports/${candidateExtId}`}
              className="text-xs text-blue-400 hover:underline font-semibold block pt-1"
            >
              Tam Raporu İncele &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
