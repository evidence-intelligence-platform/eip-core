"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  getJobs,
  getCandidates,
  createCandidate,
  createApplication,
  analyzeCandidateFile,
  analyzeCandidateEvidence,
  JobPosting,
  Candidate,
  ProfessionCategory,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const CATEGORIES: { key: ProfessionCategory; label: string; icon: string }[] = [
  { key: "ALL", label: "Tüm Sektörler & Meslekler", icon: "🌐" },
  { key: "HEALTHCARE", label: "Sağlık & Tıp (Doktor, Hemşire)", icon: "🩺" },
  { key: "TECHNOLOGY", label: "Teknoloji & Yapay Zeka", icon: "🤖" },
  { key: "TRANSPORTATION", label: "Ulaşım & Lojistik (Şoför, Kurye)", icon: "🚗" },
  { key: "SERVICES", label: "Ev Hizmetleri & Bakım", icon: "🧹" },
  { key: "GASTRONOMY", label: "Gastronomi & Mutfak (Şef)", icon: "🍳" },
  { key: "CONSTRUCTION", label: "İnşaat & Mimarlık", icon: "🏗️" },
];

export default function JobListingsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Category Filter
  const [selectedCategory, setSelectedCategory] = useState<ProfessionCategory>("ALL");

  // Apply Modal state
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [consentVerified, setConsentVerified] = useState(true);

  // Multi-source evidence inputs
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [chatgptJsonFile, setChatgptJsonFile] = useState<File | null>(null);
  const [certificateLink, setCertificateLink] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccessData, setSubmitSuccessData] = useState<{
    appId: number;
    candidateExtId: string;
    aiResult?: any;
    extraSourcesCount: number;
  } | null>(null);

  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

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

  const filteredJobs = jobs.filter((j) => {
    if (selectedCategory === "ALL") return true;
    return j.category === selectedCategory || j.title.toLowerCase().includes(selectedCategory.toLowerCase());
  });

  const handleOpenApplyModal = (job: JobPosting) => {
    setSelectedJob(job);
    setSubmitSuccessData(null);
    setResumeFile(null);
    setLinkedinUrl("");
    setGithubUrl("");
    setChatgptJsonFile(null);
    setCertificateLink("");
    if (user?.email) {
      setCandidateName(user.email.split("@")[0].replace(".", " "));
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    if (!resumeFile && !linkedinUrl && !githubUrl && !chatgptJsonFile && !certificateLink) {
      alert("⚠️ Lütfen başvuruyu tamamlamak için en az bir kanıt belgesi (CV, Sertifika, Ehliyet/Belge veya Bağlantı) ekleyin.");
      return;
    }

    if (!consentVerified) {
      alert("⚠️ Zero Trust Consent Gate Uyarısı: Kanıtlarınızın AI tarafından analiz edilmesi için rıza seçeneğini onaylamalısınız.");
      return;
    }

    try {
      setSubmitting(true);
      let extraSources = 0;

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

      const reqId = `req_job_${selectedJob.id}`;
      let primaryAiResult = null;

      // 3. Process PDF/TXT Resume
      if (resumeFile) {
        const extractRes = await analyzeCandidateFile(extId, reqId, resumeFile);
        if (extractRes.success) primaryAiResult = extractRes.data;
        extraSources++;
      }

      // 4. Process LinkedIn URL
      if (linkedinUrl.trim()) {
        await analyzeCandidateEvidence(extId, "LINKEDIN_URL", `LinkedIn Profile URL: ${linkedinUrl.trim()}`);
        extraSources++;
      }

      // 5. Process GitHub / Portfolio Link
      if (githubUrl.trim()) {
        await analyzeCandidateEvidence(extId, "PORTFOLIO_LINK", `Portfolio Project Link: ${githubUrl.trim()}`);
        extraSources++;
      }

      // 6. Process Certificate / License Link
      if (certificateLink.trim()) {
        await analyzeCandidateEvidence(extId, "CERTIFICATE_LICENSE", `Certificate/License Link: ${certificateLink.trim()}`);
        extraSources++;
      }

      // 7. Process ChatGPT Export JSON
      if (chatgptJsonFile) {
        const text = await chatgptJsonFile.text();
        await analyzeCandidateEvidence(extId, "CHATGPT_EXPORT", text.slice(0, 4000));
        extraSources++;
      }

      setSubmitSuccessData({
        appId: appRecord.id!,
        candidateExtId: extId,
        aiResult: primaryAiResult,
        extraSourcesCount: extraSources,
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
    <div className="space-y-8 max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center space-y-3 border-b border-zinc-800 pb-8">
        <h1 className="text-4xl font-extrabold text-white tracking-tight">
          Evrensel Meslek İlanları & <span className="text-blue-500">Kanıt Portalı</span>
        </h1>
        <p className="text-zinc-400 text-sm max-w-3xl mx-auto">
          Tüm meslek gruplarından (Tıp, Yapay Zeka, Şoförlük, Hizmet Sektörü, Gastronomi, Mimarlık) açık pozisyonlar. Kanıtlarınızı ekleyin ve doğrulanmış skorunuzla başvurun.
        </p>
      </div>

      {/* Sector Category Filters */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                active
                  ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
              }`}
            >
              <span>{cat.icon}</span> {cat.label}
            </button>
          );
        })}
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
      ) : filteredJobs.length === 0 ? (
        <div className="p-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl space-y-3">
          <p className="text-zinc-400 text-base">Bu kategoride henüz aktif bir iş ilanı yayınlanmadı.</p>
          <p className="text-xs text-zinc-500">Farklı bir meslek kategorisi seçerek arama yapabilirsiniz.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredJobs.map((job) => (
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
                    🏢 {job.company_name || "EIP Partner Kurum"} • İlan ID: #{job.id}
                  </p>
                </div>

                <button
                  onClick={() => handleOpenApplyModal(job)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition shadow-lg flex items-center justify-center gap-2"
                >
                  <span>🚀</span> İlana Başvur & Kanıtları Yükle &rarr;
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-xl w-full space-y-6 shadow-2xl my-8">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white">Çoklu Kanıt Destekli İş Başvurusu</h3>
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
                    <span>✅</span> Başvurunuz {submitSuccessData.extraSourcesCount} Kanıt Kaynağı İle Alındı! (Başvuru ID #{submitSuccessData.appId})
                  </p>
                  <p className="text-xs text-zinc-300">
                    Belgeleriniz ve eklenen tüm mesleki kanıtlarınız işverenin değerlendirme ekranına aktarıldı.
                  </p>
                </div>

                {submitSuccessData.aiResult && (
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">🧠 Gemini AI Özgeçmiş Analizi:</span>
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
                    <span>📊</span> Kanıt Skorumu & Raporumu Gör &rarr;
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

                {/* Main Resume Upload */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    📄 Özgeçmiş / CV / Belge Dosyası (PDF veya TXT)
                  </label>
                  <div
                    onClick={() => resumeInputRef.current?.click()}
                    className="p-5 border-2 border-dashed border-zinc-700 hover:border-blue-500 bg-zinc-950 rounded-xl text-center cursor-pointer transition"
                  >
                    <input
                      ref={resumeInputRef}
                      type="file"
                      accept=".pdf,.txt"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && setResumeFile(e.target.files[0])}
                    />
                    {resumeFile ? (
                      <p className="text-emerald-400 text-sm font-semibold">📄 {resumeFile.name} ({(resumeFile.size / 1024).toFixed(1)} KB)</p>
                    ) : (
                      <p className="text-zinc-400 text-xs">
                        Dosyanızı seçmek için <span className="text-blue-400 underline">tıklayın</span> (.pdf veya .txt)
                      </p>
                    )}
                  </div>
                </div>

                {/* Multi-Industry Evidence Boosters */}
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      🚀 Başvuruyu Güçlendirici Mesleki Kanıtlar (İsteğe Bağlı)
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">+ Skor Bonusu</span>
                  </div>

                  {/* LinkedIn URL Input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                      <span>🔗</span> LinkedIn / Profesyonel Profil Bağlantısı
                    </label>
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/aday-profil-adi"
                      className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>

                  {/* Certificate / Driver License Link */}
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                      <span>📜</span> Sertifika / Ehliyet / Mesleki Belge Bağlantısı
                    </label>
                    <input
                      type="url"
                      value={certificateLink}
                      onChange={(e) => setCertificateLink(e.target.value)}
                      placeholder="https://drive.google.com/sertifikam-ehliyetim"
                      className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>

                  {/* GitHub / Portfolio Link */}
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                      <span>🌐</span> Portföy / Proje / GitHub Bağlantısı
                    </label>
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://portfoyum.com veya https://github.com/proje"
                      className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>

                  {/* ChatGPT JSON Export Upload */}
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                      <span>🤖</span> ChatGPT Veri Dışa Aktarım Dosyası (.json)
                    </label>
                    <input
                      ref={jsonInputRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && setChatgptJsonFile(e.target.files[0])}
                    />
                    <button
                      type="button"
                      onClick={() => jsonInputRef.current?.click()}
                      className="w-full py-2 px-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-xs text-zinc-300 text-left transition flex items-center justify-between"
                    >
                      <span>{chatgptJsonFile ? `🤖 ${chatgptJsonFile.name}` : "ChatGPT export conversations.json yükle..."}</span>
                      <span className="text-[10px] text-blue-400 font-semibold">Gözat</span>
                    </button>
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
                      <strong className="text-blue-400">Zero Trust Aday Rızası (Consent Verified):</strong> Belgelerimin ve eklenen kanıt kaynaklarımın Gemini AI ile analiz edilmesine rıza gösteriyorum.
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
                    disabled={submitting}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow disabled:opacity-50"
                  >
                    {submitting ? "Kanıtlar Analiz Ediliyor..." : "Başvuruyu ve Tüm Kanıtları Gönder"}
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
