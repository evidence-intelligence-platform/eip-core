"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  getJobs,
  getCandidates,
  createCandidate,
  createApplication,
  analyzeCandidateFile,
  JobPosting,
  Candidate,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function JobListingsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Apply Modal state
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [consentVerified, setConsentVerified] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccessData, setSubmitSuccessData] = useState<{
    appId: number;
    candidateExtId: string;
    aiResult?: any;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsData, candsData] = await Promise.all([
        getJobs().catch(() => []),
        getCandidates().catch(() => []),
      ]);
      setJobs(jobsData);
      setCandidates(candsData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("İş ilanları yüklenemedi.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenApplyModal = (job: JobPosting) => {
    setSelectedJob(job);
    setSubmitSuccessData(null);
    setFile(null);
    if (user?.email) {
      setCandidateName(user.email.split("@")[0].replace(".", " "));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob || !file) return;

    if (!consentVerified) {
      alert("⚠️ Zero Trust Consent Gate Uyarısı: Özgeçmişinizin AI tarafından analiz edilmesi için rıza seçeneğini onaylamalısınız.");
      return;
    }

    try {
      setSubmitting(true);

      // 1. Ensure Candidate record exists or create one
      const extId = `cand_${user?.email ? user.email.replace(/[^a-zA-Z0-9]/g, "_") : Date.now()}`;
      let cand = candidates.find((c) => c.external_id === extId);
      if (!cand) {
        cand = await createCandidate({
          external_id: extId,
          name: candidateName || user?.email?.split("@")[0] || "Aday Kullanıcı",
          consent_granted: true,
        });
      }

      // 2. Submit Job Application
      const appRecord = await createApplication({
        candidate_id: cand.id || 1,
        job_id: selectedJob.id!,
        status: "reviewing",
      });

      // 3. Trigger AI Evidence Extraction for resume PDF
      const reqId = `req_job_${selectedJob.id}`;
      const extractRes = await analyzeCandidateFile(extId, reqId, file);

      setSubmitSuccessData({
        appId: appRecord.id!,
        candidateExtId: extId,
        aiResult: extractRes.success ? extractRes.data : null,
      });

      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(`Başvuru Hatası: ${err.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center space-y-3 border-b border-zinc-800 pb-8">
        <h1 className="text-4xl font-extrabold text-white tracking-tight">
          Açık <span className="text-blue-500">İş İlanları</span> & Kariyer Fırsatları
        </h1>
        <p className="text-zinc-400 text-sm max-w-2xl mx-auto">
          İşverenlerin sunduğu aktif pozisyonları inceleyin, PDF özgeçmişinizi yükleyip tek tıkla rıza onaylı AI başvurusu yapın.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl">
          ❌ {error}
        </div>
      )}

      {/* Job Cards */}
      {loading ? (
        <div className="p-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl text-zinc-400 text-sm">
          İş ilanları yükleniyor...
        </div>
      ) : jobs.length === 0 ? (
        <div className="p-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl space-y-3">
          <p className="text-zinc-400 text-base">Henüz aktif bir iş ilanı yayınlanmadı.</p>
          <p className="text-xs text-zinc-500">İşverenler yeni ilanlar ekledikçe burada listelenecektir.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4 hover:border-zinc-700 transition shadow-lg"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-white tracking-tight">{job.title}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                      {job.status || "Aktif"}
                    </span>
                  </div>
                  <p className="text-xs text-blue-400 font-semibold mt-1">
                    🏢 {job.company_name || "Acme Corp"} • İlan ID: #{job.id}
                  </p>
                </div>

                <button
                  onClick={() => handleOpenApplyModal(job)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition shadow-lg flex items-center justify-center gap-2"
                >
                  <span>📄</span> İlana Başvur & CV Yükle &rarr;
                </button>
              </div>

              <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-sm text-zinc-300 leading-relaxed">
                {job.description}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-xl w-full space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white">İş Başvurusu & CV Gönderimi</h3>
                <p className="text-xs text-blue-400 mt-0.5">Pozisyon: {selectedJob.title}</p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-zinc-500 hover:text-white text-xl p-1"
              >
                ✕
              </button>
            </div>

            {submitSuccessData ? (
              <div className="space-y-5 py-2">
                <div className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-sm rounded-xl space-y-2">
                  <p className="font-bold text-base flex items-center gap-2">
                    <span>✅</span> Başvurunuz ve Özgeçmişiniz Alındı! (Başvuru ID #{submitSuccessData.appId})
                  </p>
                  <p className="text-xs text-zinc-300">
                    Başvurunuz işverenin değerlendirme ekranına başarıyla aktarıldı.
                  </p>
                </div>

                {submitSuccessData.aiResult && (
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">🧠 Gemini AI Analiz Durumu:</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-900 text-emerald-300">
                        {submitSuccessData.aiResult.status}
                      </span>
                    </div>
                    <p className="text-zinc-300">{submitSuccessData.aiResult.reasoning}</p>
                  </div>
                )}

                <div className="flex justify-center gap-3 pt-2">
                  <Link
                    href={`/reports/${submitSuccessData.candidateExtId}`}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition shadow flex items-center gap-2"
                  >
                    <span>📊</span> Raporumu & Skorumu Gör &rarr;
                  </Link>
                  <Link
                    href="/candidate/hub"
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition shadow flex items-center gap-2"
                  >
                    <span>🎯</span> Aday Paneline Git &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleApplySubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Aday Adı & Soyadı
                  </label>
                  <input
                    type="text"
                    required
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Örn: Jane Doe"
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Özgeçmiş Dosyası (PDF veya TXT)
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-6 border-2 border-dashed border-zinc-700 hover:border-blue-500 bg-zinc-950 rounded-xl text-center cursor-pointer transition"
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
                        Özgeçmişinizi seçmek için <span className="text-blue-400 underline">tıklayın</span> (.pdf veya .txt)
                      </p>
                    )}
                  </div>
                </div>

                {/* Consent Gate Checkbox */}
                <div className="p-4 bg-blue-950/30 border border-blue-800/50 rounded-xl space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentVerified}
                      onChange={(e) => setConsentVerified(e.target.checked)}
                      className="mt-1 accent-blue-500 w-4 h-4"
                    />
                    <span className="text-xs text-zinc-300 leading-normal">
                      <strong className="text-blue-400">Zero Trust Aday Rızası (Consent Verified):</strong> Özgeçmişimin işveren tarafından Gemini AI ile analiz edilmesine ve yetkinlik kanıtı üretilmesine rıza gösteriyorum.
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setSelectedJob(null)}
                    className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !file}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow disabled:opacity-50"
                  >
                    {submitting ? "Başvuru ve Analiz Yapılıyor..." : "Başvuruyu ve AI Analizini Gönder"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
