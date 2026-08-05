"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ApiError,
  getJobs,
  getApplications,
  analyzeCandidateFile,
  analyzeCandidateEvidence,
  getCandidateEvidences,
  JobPosting,
  JobApplication,
  Evidence,
  AccomplishmentEntry,
  ProfessionCategory,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function CandidateEvidenceHub() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [accomplishments, setAccomplishments] = useState<AccomplishmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resume Upload state
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  // Unticked by default: a pre-ticked box is not valid explicit consent.
  const [consentVerified, setConsentVerified] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Accomplishment / Case Study state
  const [accTitle, setAccTitle] = useState("");
  const [accCategory, setAccCategory] = useState<ProfessionCategory>("HEALTHCARE");
  const [accContent, setAccContent] = useState("");
  const [accProofLink, setAccProofLink] = useState("");
  const [publishingAcc, setPublishingAcc] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [accConsent, setAccConsent] = useState(false);
  const [accSuccess, setAccSuccess] = useState<string | null>(null);
  const [accError, setAccError] = useState<string | null>(null);

  // No "cand_demo" fallback: writing evidence under a shared demo identity
  // mixes unrelated people's records together.
  const candidateExtId = user?.email
    ? `cand_${user.email.replace(/[^a-zA-Z0-9]/g, "_")}`
    : "";

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsRes, appsRes, evRes] = await Promise.allSettled([
        // Swallowing failures here made a broken backend look like an empty
        // account; allSettled lets us tell the two apart below.
        getJobs(),
        getApplications(),
        candidateExtId ? getCandidateEvidences(candidateExtId) : Promise.resolve([]),
      ]);
      setJobs(jobsRes.status === "fulfilled" ? jobsRes.value : []);
      setApplications(appsRes.status === "fulfilled" ? appsRes.value : []);
      setEvidences(evRes.status === "fulfilled" ? evRes.value : []);

      // A 404 on the evidence call just means this candidate has no record
      // yet (they have not applied anywhere) — that is an empty state, not a
      // failure. Only real errors reach the banner.
      const isMissingRecord = (r: PromiseSettledResult<unknown>) =>
        r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 404;

      const failed = [jobsRes, appsRes, evRes].find(
        (r) => r.status === "rejected" && !isMissingRecord(r)
      );
      if (failed && failed.status === "rejected") {
        setError(
          failed.reason instanceof Error
            ? failed.reason.message
            : "Bilgileriniz yüklenemedi."
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Veriler yüklenemedi.");
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

    if (!candidateExtId) {
      setAnalysisError("Belge yüklemek için giriş yapmanız gerekiyor.");
      return;
    }

    if (!consentVerified) {
      setAnalysisError("Belgenizin değerlendirilebilmesi için onay kutusunu işaretlemeniz gerekiyor.");
      return;
    }
    setAnalysisError(null);

    try {
      setAnalyzing(true);
      setAnalysisResult(null);

      const reqId = selectedJobId ? `req_job_${selectedJobId}` : "req_general_cv";
      const res = await analyzeCandidateFile(candidateExtId, reqId, file, consentVerified);

      if (res.success) {
        setAnalysisResult(res.data);
        setAnalysisError(null);
      } else {
        // Separate from `error`: fetchData() below clears that one, which used
        // to wipe this message off the screen a moment after it appeared.
        setAnalysisError(res.error ?? "Belgeniz analiz edilemedi.");
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

  const handlePublishAccomplishment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accTitle || !accContent) return;

    try {
      setPublishingAcc(true);
      setAccSuccess(null);

      if (!candidateExtId) {
        setAccError("Deneyim eklemek için giriş yapmanız gerekiyor.");
        return;
      }

      if (!accConsent) {
        setAccError("Deneyiminizin değerlendirilebilmesi için onay kutusunu işaretlemeniz gerekiyor.");
        return;
      }

      const rawText = `MESLEKI DENEYIM [${accCategory}]: ${accTitle}. Ayrinti: ${accContent}. Belge/Bag: ${accProofLink}`;
      const analysis = await analyzeCandidateEvidence(
        candidateExtId,
        "CASE_STUDY_BLOG",
        rawText,
        "req_general_accomplishment",
        "Doğrulanabilir bir mesleki deneyim veya iş örneği olmalıdır.",
        accConsent
      );

      const newEntry: AccomplishmentEntry = {
        id: `acc_${Date.now()}`,
        candidate_external_id: candidateExtId,
        category: accCategory,
        title: accTitle,
        content: accContent,
        proof_link: accProofLink,
        verified_by_ai: analysis.success,
        created_at: new Date().toISOString(),
      };

      setAccomplishments((prev) => [newEntry, ...prev]);
      setAccSuccess(
        analysis.success
          ? "Deneyiminiz analiz edildi ve profilinize eklendi."
          : "Deneyiminiz kaydedildi, ancak yapay zeka analizi şu anda tamamlanamadı. Daha sonra tekrar deneyebilirsiniz."
      );

      setAccTitle("");
      setAccContent("");
      setAccProofLink("");
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setPublishingAcc(false);
    }
  };

  const getJobTitle = (jobId: number) => {
    const j = jobs.find((job) => job.id === jobId);
    return j ? j.title : `İş İlanı #${jobId}`;
  };

  return (
    <div className="min-h-screen bg-black text-slate-200">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-900/20 via-black to-black -z-10 pointer-events-none" />
      <div className="space-y-8 max-w-6xl mx-auto py-12 px-4 relative">
        {/* Candidate Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            🎯 Aday Özel Kariyer & <span className="text-emerald-400">Kanıt Hub&apos;ı</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Giriş Yapan Aday: <span className="font-semibold text-emerald-400">{user?.email || "Aday Kullanıcı"}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={candidateExtId ? `/candidates/${candidateExtId}` : "/login"}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs transition border border-zinc-700 flex items-center gap-1.5"
          >
            <span>👤</span> Profesyonel Profilimi Gör &rarr;
          </Link>
          <Link
            href="/jobs"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition shadow flex items-center gap-1.5"
          >
            <span>💼</span> İş İlanlarını İncele &rarr;
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl">
          ❌ {error}
        </div>
      )}

      {/* Candidate AI Cross-Verification Warning Banner */}
      <div className="p-5 bg-amber-950/40 border border-amber-800/80 rounded-2xl space-y-2 text-amber-200 shadow-xl">
        <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
          <span>⚠️</span> YAPAY ZEKA ÇAPRAZ SORGU & VERİ DOĞRULUĞU UYARISI
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          İşverenler bu platform üzerinden yüklediğiniz özgeçmişleri, LinkedIn profillerinizi, sertifikalarınızı ve ChatGPT konuşma geçmişlerinizi <strong className="text-amber-300">Gemini AI Çapraz Sorgulamasına (AI Cross-Verification)</strong> ve <strong className="text-amber-300">Karakter / Doğruluk Analizine</strong> tabi tutmaktadır. Sistemdeki çelişkiler ve tutarsızlıklar yapay zeka tarafından anında tespit edilmektedir. Bu nedenle girdiğiniz bilgilerin tamamen <strong className="text-white font-bold">gerçek ve dürüst</strong> olması önem arz etmektedir.
        </p>
      </div>

      {/* Candidate Guidance Tip Banner */}
      <div className="p-6 bg-gradient-to-r from-emerald-950/80 via-teal-950/50 to-zinc-900 border border-emerald-800/60 rounded-2xl space-y-3 shadow-xl">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <span>💡</span> ADAY BAŞARI REHBERİ: SKORUNUZU %90+ YAPIN VE HIZLA İŞE ALININ
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-300">
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-emerald-900/40 space-y-1">
            <strong className="text-white block">1. PDF CV&apos;nizi Yükleyin</strong>
            <p className="text-zinc-400">Deneyimlerinizi ve yetkinliklerinizi içeren güncel özgeçmişinizi yükleyin ve Zero Trust rızasını onaylayın.</p>
          </div>
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-emerald-900/40 space-y-1">
            <strong className="text-white block">2. Çoklu Kanıt Ekleyin</strong>
            <p className="text-zinc-400">İş başvurusu yaparken LinkedIn profil URL&apos;nizi, ehliyet/sertifika linkinizi veya ChatGPT export dosyanızı ekleyin.</p>
          </div>
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-emerald-900/40 space-y-1">
            <strong className="text-white block">3. Case Study Yazın</strong>
            <p className="text-zinc-400">Tamamladığınız önemli ameliyatları, sürüş deneyimlerinizi veya projelerinizi vaka incelemesi olarak yayınlayın.</p>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Accomplishments & Case Studies + CV Upload (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Publish Case Study / Accomplishment Section */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-6 shadow-2xl hover:border-white/20 transition-all duration-500">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <h2 className="text-lg font-bold text-white">Mesleki Başarı & Case Study Yayınla</h2>
              </div>
              <span className="text-[10px] text-blue-400 font-mono uppercase bg-blue-950/80 px-2.5 py-1 rounded-full border border-blue-800">
                Blog / Case Study Portföyü
              </span>
            </div>

            {accError && (
              <div role="alert" className="mb-3 p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded-xl">
                {accError}
              </div>
            )}
            {accSuccess && (
              <div className="p-3.5 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl font-medium">
                {accSuccess}
              </div>
            )}

            <form onSubmit={handlePublishAccomplishment} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Meslek Kategorisi / Sektör
                  </label>
                  <select
                    value={accCategory}
                    disabled={publishingAcc}
                    onChange={(e) => setAccCategory(e.target.value as ProfessionCategory)}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                  >
                    <option value="HEALTHCARE">🩺 Sağlık & Tıp (Doktor, Hemşire)</option>
                    <option value="TECHNOLOGY">🤖 Teknoloji & Yapay Zeka</option>
                    <option value="TRANSPORTATION">🚗 Ulaşım & Lojistik (Şoför, Kurye)</option>
                    <option value="SERVICES">🧹 Ev Hizmetleri & Bakım</option>
                    <option value="GASTRONOMY">🍳 Gastronomi & Mutfak (Şef)</option>
                    <option value="CONSTRUCTION">🏗️ İnşaat & Mimarlık</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                    Başarı / Vaka İnceleme Başlığı
                  </label>
                  <input
                    type="text"
                    required
                    disabled={publishingAcc}
                    value={accTitle}
                    onChange={(e) => setAccTitle(e.target.value)}
                    placeholder="Örn: 10 Yıllık Makam Şoförlüğü & İleri Sürüş Sertifikaları"
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Vaka Detayı / Başarı Açıklaması (Blog / Case Study)
                </label>
                <textarea
                  required
                  rows={4}
                  disabled={publishingAcc}
                  value={accContent}
                  onChange={(e) => setAccContent(e.target.value)}
                  placeholder="Başarınızı, tamamladığınız projeyi, cerrahi ameliyat sayınızı, ehliyet sınıfınızı veya mesleki deneyiminizi detaylandırın..."
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition leading-relaxed disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span>📜</span> Belge / Sertifika / Proje Bağlantısı (İsteğe Bağlı)
                </label>
                <input
                  type="url"
                  disabled={publishingAcc}
                  value={accProofLink}
                  onChange={(e) => setAccProofLink(e.target.value)}
                  placeholder="https://drive.google.com/sertifikam veya https://github.com/projem"
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer p-3.5 bg-blue-950/30 border border-blue-800/50 rounded-xl">
                <input
                  type="checkbox"
                  checked={accConsent}
                  onChange={(e) => setAccConsent(e.target.checked)}
                  className="mt-0.5 accent-blue-500 w-4 h-4 shrink-0"
                />
                <span className="text-xs text-zinc-300 leading-relaxed">
                  Yazdığım deneyimin doğru olduğunu ve yapay zeka tarafından
                  değerlendirilmesini kabul ediyorum.
                </span>
              </label>

              <button
                type="submit"
                disabled={publishingAcc}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl text-xs transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center"
              >
                {publishingAcc ? "Analiz ediliyor…" : "Deneyimi Ekle"}
              </button>
            </form>
          </div>

          {/* User Published Case Studies List */}
          {accomplishments.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-white tracking-tight">Yayınlanan Başarı Case Study&apos;leri ({accomplishments.length})</h3>
              <div className="space-y-3">
                {accomplishments.map((acc) => (
                  <div key={acc.id} className="bg-black/40 border border-white/5 p-5 rounded-2xl space-y-2 hover:bg-white/5 transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">{acc.title}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                        <span>{acc.verified_by_ai ? "✓" : "•"}</span>{" "}
                        {acc.verified_by_ai ? "AI ile doğrulandı" : "AI analizi bekliyor"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">{acc.content}</p>
                    {acc.proof_link && (
                      <a
                        href={acc.proof_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-400 hover:underline font-semibold block pt-1"
                      >
                        🔗 Kanıt Belgesi Bağlantısı &rarr;
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main CV Upload Box */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-6 shadow-2xl hover:border-white/20 transition-all duration-500 relative overflow-hidden">
            {analyzing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center space-y-4 rounded-3xl">
                    <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                    <p className="text-white font-bold animate-pulse">Özgeçmiş AI Analizi Sürüyor...</p>
                </div>
            )}
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <span className="text-xl">📄</span>
              <h2 className="text-lg font-bold text-white">Özgeçmiş / CV Yükle & AI Analizi</h2>
            </div>

            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Hedef Pozisyon / İlan (Opsiyonel)
                </label>
                <select
                  value={selectedJobId}
                  disabled={analyzing}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 transition disabled:opacity-50"
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
                  className="p-6 border-2 border-dashed border-zinc-700 hover:border-emerald-500 bg-zinc-950 rounded-xl text-center cursor-pointer transition"
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
                    <strong className="text-emerald-400">Zero Trust Aday Rızası & Çapraz Sorgu Onayı:</strong> Sunmuş olduğum tüm verilerin doğru olduğunu, Gemini AI Çapraz Sorgulamasına ve Karakter/Yetkinlik Analizine tabi tutulmasını rıza ile kabul ediyorum.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={analyzing || !file}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl text-xs transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center"
              >
                {analyzing ? "AI Analizi Yapılıyor..." : "🔍 Özgeçmişimi AI İle Analiz Et"}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Applications & Verified Evidences (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Applications Status Card */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-5 shadow-2xl hover:border-white/20 transition-all duration-500">
            <h2 className="text-lg font-bold text-white flex items-center justify-between border-b border-zinc-800 pb-3">
              <span>📌 Başvurularımın Durumu</span>
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
                  <div key={app.id} className="p-4 bg-black/40 border border-white/5 rounded-2xl space-y-1.5 hover:bg-white/5 transition-all duration-300">
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
                    <p className="text-[10px] text-zinc-500">Başvuru Takip ID: #{app.id}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Stats Card */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-5 shadow-2xl hover:border-white/20 transition-all duration-500">
            <h3 className="text-sm font-bold text-white">📊 Doğrulanmış AI Kanıtlarım</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Veritabanında sizin için kayıtlı toplam <strong className="text-emerald-400">{evidences.length} adet</strong> yetkinlik kanıtı bulunmaktadır.
            </p>
            <Link
              href={candidateExtId ? `/reports/${candidateExtId}` : "/login"}
              className="text-xs text-blue-400 hover:underline font-semibold block pt-1"
            >
              Tam Raporu İncele &rarr;
            </Link>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
