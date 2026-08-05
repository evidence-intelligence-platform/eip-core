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
  // Unticked by default: a pre-ticked box is not valid explicit consent.
  const [consentVerified, setConsentVerified] = useState(false);

  // Multi-source evidence inputs
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [chatgptJsonFile, setChatgptJsonFile] = useState<File | null>(null);
  const [certificateLink, setCertificateLink] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitSuccessData, setSubmitSuccessData] = useState<{
    appId: number;
    candidateExtId: string;
    aiResult?: any;
    extraSourcesCount: number;
    failedSources: string[];
  } | null>(null);

  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Only jobs are public. The candidate list used to be fetched here just
      // to de-duplicate on apply — that shipped every visitor the full roster.
      const jobsData = await getJobs();
      setJobs(jobsData);
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
      setFormError("Başvurunuzu tamamlamak için en az bir belge veya bağlantı ekleyin (CV, sertifika, ehliyet, portföy).");
      return;
    }

    if (!consentVerified) {
      setFormError("Belgelerinizin değerlendirilebilmesi için onay kutusunu işaretlemeniz gerekiyor.");
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      let extraSources = 0;

      // 1. Ensure Candidate record exists or create one
      // A Date.now() identity would orphan the application from the user's
      // record, so signing in is required before applying.
      if (!user?.email) {
        setFormError("Başvuru yapmak için giriş yapmanız gerekiyor.");
        setSubmitting(false);
        return;
      }
      const extId = `cand_${user.email.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const cand = await createCandidate({
        external_id: extId,
        name: candidateName || user.email.split("@")[0] || "Aday Kullanıcı",
        consent_granted: consentVerified,
      }).catch(async (err) => {
        // Already registered from an earlier application — reuse that record.
        const existing = (await getCandidates().catch(() => [])).find((c) => c.external_id === extId);
        if (existing) return existing;
        throw err;
      });

      if (!cand.id) {
        throw new Error("Aday kaydınız oluşturulamadı, lütfen tekrar deneyin.");
      }

      // 2. Submit Job Application
      const appRecord = await createApplication({
        candidate_id: cand.id,
        job_id: selectedJob.id!,
        status: "reviewing",
      });

      const reqId = `req_job_${selectedJob.id}`;
      const reqDesc = selectedJob.description;
      let primaryAiResult = null;

      // 3. Process PDF/TXT Resume
      // Only count sources the engine actually accepted, so the success
      // screen cannot claim evidence that failed to process.
      const failedSources: string[] = [];
      if (resumeFile) {
        const extractRes = await analyzeCandidateFile(extId, reqId, resumeFile, consentVerified);
        if (extractRes.success) {
          primaryAiResult = extractRes.data;
          extraSources++;
        } else {
          failedSources.push("CV");
        }
      }

      // 4. Process LinkedIn URL
      if (linkedinUrl.trim()) {
        const r = await analyzeCandidateEvidence(extId, "LINKEDIN_URL", `LinkedIn Profile URL: ${linkedinUrl.trim()}`, reqId, reqDesc, consentVerified);
        if (r.success) extraSources++;
        else failedSources.push("LinkedIn");
      }

      // 5. Process GitHub / Portfolio Link
      if (githubUrl.trim()) {
        const r = await analyzeCandidateEvidence(extId, "PORTFOLIO_LINK", `Portfolio Project Link: ${githubUrl.trim()}`, reqId, reqDesc, consentVerified);
        if (r.success) extraSources++;
        else failedSources.push("Portfolyo bağlantısı");
      }

      // 6. Process Certificate / License Link
      if (certificateLink.trim()) {
        const r = await analyzeCandidateEvidence(extId, "CERTIFICATE_LICENSE", `Certificate/License Link: ${certificateLink.trim()}`, reqId, reqDesc, consentVerified);
        if (r.success) extraSources++;
        else failedSources.push("Sertifika/belge bağlantısı");
      }

      // 7. Process ChatGPT Export JSON
      if (chatgptJsonFile) {
        const text = await chatgptJsonFile.text();
        const r = await analyzeCandidateEvidence(extId, "CHATGPT_EXPORT", text.slice(0, 4000), reqId, reqDesc, consentVerified);
        if (r.success) extraSources++;
        else failedSources.push("Sohbet dışa aktarımı");
      }

      setSubmitSuccessData({
        appId: appRecord.id!,
        candidateExtId: extId,
        aiResult: primaryAiResult,
        extraSourcesCount: extraSources,
        failedSources,
      });

      await fetchData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Başvurunuz gönderilemedi, lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-slate-200 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/30 via-black to-black -z-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 -z-10 mix-blend-screen pointer-events-none" />
      <div className="space-y-8 max-w-6xl mx-auto py-12 px-4 relative">
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
        <div role="alert" className="p-4 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchData}
            className="px-3 py-1.5 bg-red-900/60 hover:bg-red-900 border border-red-700 text-red-100 rounded-lg text-xs font-semibold transition"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Job Cards */}
      {loading ? (
        <div className="p-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl text-zinc-400 text-sm">
          İş ilanları yükleniyor...
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="p-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl space-y-3">
          <p className="text-zinc-400 text-base">
            {error
              ? "İlanlar şu anda görüntülenemiyor."
              : "Bu kategoride henüz aktif bir iş ilanı yayınlanmadı."}
          </p>
          <p className="text-xs text-zinc-500">Farklı bir meslek kategorisi seçerek arama yapabilirsiniz.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-5 hover:border-white/20 transition-all duration-500 shadow-2xl group"
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
                  className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-sm transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-zinc-950/90 border border-white/10 p-8 rounded-3xl max-w-xl w-full space-y-6 shadow-2xl my-8 relative overflow-hidden">
            {submitting && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-10 flex flex-col items-center justify-center space-y-5 overflow-hidden rounded-3xl">
                    <div className="absolute left-0 top-0 w-full h-1/2 bg-gradient-to-b from-transparent via-blue-500/30 to-transparent animate-scanning pointer-events-none" />
                    <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin shadow-[0_0_15px_rgba(59,130,246,0.5)] relative z-20" />
                    <div className="text-center relative z-20">
                      <p className="text-white font-bold animate-pulse text-lg tracking-wide">🧠 Yapay Zeka Çapraz Sorgusu Sürüyor...</p>
                      <p className="text-xs text-blue-300 mt-2 font-medium">Lütfen bekleyin, kanıtlarınız Gemini 2.5 Flash ile analiz ediliyor.</p>
                    </div>
                </div>
            )}
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
                    <span>✅</span> Başvurunuz alındı — {submitSuccessData.extraSourcesCount} kanıt kaynağı işlendi. (Başvuru No #{submitSuccessData.appId})
                  </p>
                  <p className="text-xs text-zinc-300">
                    Belgeleriniz işverenin değerlendirme ekranına aktarıldı.
                  </p>
                  {submitSuccessData.failedSources.length > 0 && (
                    <p className="text-xs text-amber-300 border-t border-emerald-800/60 pt-2">
                      Şu kaynaklar işlenemedi: {submitSuccessData.failedSources.join(", ")}. Başvurunuz geçerli; bu belgeleri profilinizden tekrar yükleyebilirsiniz.
                    </p>
                  )}
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
                {formError && (
                  <div
                    role="alert"
                    className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded-xl"
                  >
                    {formError}
                  </div>
                )}
                {/* Critical AI Cross-Verification Warning Banner */}
                <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl space-y-2 text-xs text-amber-200">
                  <div className="flex items-center gap-2 font-bold text-amber-400">
                    <span>⚠️</span> KRİTİK UYARI: YAPAY ZEKA ÇAPRAZ SORGU & VERİ DOĞRULUĞU
                  </div>
                  <p className="leading-relaxed text-zinc-300 text-[11px]">
                    İşveren, bu platform aracılığıyla sunacağınız özgeçmiş, LinkedIn profili ve ChatGPT konuşma geçmişini Gemini AI servisi üzerinden <strong className="text-amber-300">Çapraz Sorgulamaya (AI Cross-Verification)</strong> ve <strong className="text-amber-300">Karakter / Yetkinlik Doğrulamasına</strong> tabi tutar. Verilen tüm bilgilerin doğruluğu titizlikle taranır. Lütfen sadece <strong className="text-white">gerçek ve dürüst verileri</strong> beyan ediniz.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Aday Adı & Soyadı
                  </label>
                  <input
                    type="text"
                    required
                    disabled={submitting}
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Örn: Jane Doe"
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                  />
                </div>

                {/* Main Resume Upload */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    📄 Özgeçmiş / CV / Belge Dosyası (PDF veya TXT)
                  </label>
                  <div
                    onClick={() => !submitting && resumeInputRef.current?.click()}
                    className={`p-5 border-2 border-dashed border-zinc-700 hover:border-blue-500 bg-zinc-950 rounded-xl text-center cursor-pointer transition ${submitting ? 'opacity-50 pointer-events-none' : ''}`}
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
                    <span className="text-[10px] text-zinc-500">Doğrulanabilir belgeler skorunuzu güçlendirir</span>
                  </div>

                  {/* LinkedIn URL Input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                      <span>🔗</span> LinkedIn / Profesyonel Profil Bağlantısı
                    </label>
                    <input
                      type="url"
                      disabled={submitting}
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/aday-profil-adi"
                      className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                    />
                  </div>

                  {/* Certificate / Driver License Link */}
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                      <span>📜</span> Sertifika / Ehliyet / Mesleki Belge Bağlantısı
                    </label>
                    <input
                      type="url"
                      disabled={submitting}
                      value={certificateLink}
                      onChange={(e) => setCertificateLink(e.target.value)}
                      placeholder="https://drive.google.com/sertifikam-ehliyetim"
                      className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                    />
                  </div>

                  {/* GitHub / Portfolio Link */}
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                      <span>🌐</span> Portföy / Proje / GitHub Bağlantısı
                    </label>
                    <input
                      type="url"
                      disabled={submitting}
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://portfoyum.com veya https://github.com/proje"
                      className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
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
                      disabled={submitting}
                      onClick={() => jsonInputRef.current?.click()}
                      className="w-full py-2 px-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-xs text-zinc-300 text-left transition flex items-center justify-between disabled:opacity-50"
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
                      <strong className="text-blue-400">Belgelerimin incelenmesine onay veriyorum.</strong> Yüklediğim belgelerin bana ait ve doğru olduğunu; başvurduğum ilan kapsamında yapay zeka tarafından değerlendirilip sonucun işverenle paylaşılmasını kabul ediyorum. Onayınız olmadan hiçbir belgeniz işlenmez.
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
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg disabled:opacity-50"
                  >
                    {submitting ? "Analiz Ediliyor..." : "Başvuruyu ve Tüm Kanıtları Gönder"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
