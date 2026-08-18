"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, validateDocument } from "@/lib/uploads";
import { SELECTABLE_CATEGORIES } from "@/lib/categories";
import {
  ApiError,
  getJobs,
  getApplications,
  analyzeCandidateFile,
  analyzeCandidateEvidence,
  getCandidateEvidences,
  isEvidenceApproved,
  getMyInterests,
  setMyInterests,
  JobPosting,
  JobApplication,
  Evidence,
  AccomplishmentEntry,
  ProfessionCategory,
  FileAnalysisData,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { IconHumanReview } from "@/components/illustrations";
import { CategoryIcon } from "@/components/CategoryIcon";

const AI_STATUS_LABELS: Record<string, string> = {
  VERIFIED: "Doğrulandı",
  "INSUFFICIENT EVIDENCE": "Yetersiz Kanıt",
  CONTRADICTION: "Çelişki",
};

// A negative verdict must not wear the success color.
const AI_STATUS_STYLES: Record<string, string> = {
  VERIFIED: "bg-ok/10 text-ok border-ok/30",
  "INSUFFICIENT EVIDENCE": "bg-warn/10 text-warn border-warn/30",
  CONTRADICTION: "bg-err/10 text-err border-err/30",
};

export default function CandidateEvidenceHub() {
  const { user, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [savingInterests, setSavingInterests] = useState(false);
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
  const [analysisResult, setAnalysisResult] = useState<FileAnalysisData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Accomplishment / Case Study state
  const [accTitle, setAccTitle] = useState("");
  const [accCategory, setAccCategory] = useState<string>("OTHER");
  const [accContent, setAccContent] = useState("");
  const [accProofLink, setAccProofLink] = useState("");
  const [publishingAcc, setPublishingAcc] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [accConsent, setAccConsent] = useState(false);
  const [accSuccess, setAccSuccess] = useState<string | null>(null);
  const [accError, setAccError] = useState<string | null>(null);

  // The server owns this identity (returned by /auth/me). Deriving it from
  // the e-mail address produced a different value than the stored one, which
  // is what broke the evidence chain between candidate and employer.
  const candidateExtId = user?.candidate_external_id ?? "";

  // Toggle one interest category and persist the new set. Optimistic: the
  // chip flips immediately, and a failed save rolls back with a message.
  const toggleInterest = async (key: string) => {
    const next = interests.includes(key)
      ? interests.filter((k) => k !== key)
      : [...interests, key];
    const prev = interests;
    setInterests(next);
    setSavingInterests(true);
    try {
      const saved = await setMyInterests(next);
      setInterests(saved);
    } catch {
      setInterests(prev);
      setError("İlgi alanları kaydedilemedi. Lütfen tekrar deneyin.");
    } finally {
      setSavingInterests(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsRes, appsRes, evRes, intRes] = await Promise.allSettled([
        // Swallowing failures here made a broken backend look like an empty
        // account; allSettled lets us tell the two apart below.
        getJobs(),
        getApplications(),
        candidateExtId ? getCandidateEvidences(candidateExtId) : Promise.resolve([]),
        getMyInterests(),
      ]);
      setJobs(jobsRes.status === "fulfilled" ? jobsRes.value : []);
      setApplications(appsRes.status === "fulfilled" ? appsRes.value : []);
      setEvidences(evRes.status === "fulfilled" ? evRes.value : []);
      setInterests(intRes.status === "fulfilled" ? intRes.value : []);

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
    // AuthProvider restores the bearer token in its own mount effect, which
    // runs *after* this one; fetching while it is still loading would 401 on
    // getApplications and flash a misleading "giriş yapın" banner.
    if (authLoading) return;
    fetchData();
  }, [authLoading, user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const problem = validateDocument(selected);
    if (problem) {
      setAnalysisError(problem);
      e.target.value = "";
      return;
    }
    setAnalysisError(null);
    setFile(selected);
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
      setAccError(null);

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

  // "Doğrulanmış" must mean AI-verified, matching the candidate's own profile
  // page (getReportData/summarizeEvidences). Counting merely review-approved
  // rows overstated verification: an "Yetersiz Kanıt" row is approved for
  // review too, but it was never actually verified.
  const verifiedCount = evidences.filter(
    (e) => isEvidenceApproved(e) && e.status === "VERIFIED"
  ).length;
  const pendingCount = evidences.filter((e) => e.review_status === "pending").length;
  const rejectedCount = evidences.filter((e) => e.review_status === "rejected").length;

  return (
    <div className="relative max-w-6xl mx-auto py-10 px-2 sm:px-4 space-y-8">
      {/* Same quiet brand tint the landing and jobs pages open with */}
      <div
        className="absolute inset-x-0 top-0 h-[20rem] -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 70% at 50% 0%, color-mix(in oklab, var(--brand) 6%, transparent), transparent 70%)",
        }}
        aria-hidden="true"
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6">
        <div className="space-y-1">
          <p className="eyebrow">Aday Paneli</p>
          <h1 className="text-title text-fg">Kanıtlarınız, tek yerde</h1>
          {user && (
            <p className="text-fg-mute text-sm">
              Giriş yapan:{" "}
              <span className="font-medium text-fg-soft">{user.email}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={candidateExtId ? `/candidates/${candidateExtId}` : "/login"}
            className="btn btn-quiet text-xs px-4 py-2.5"
          >
            Profilimi Gör
          </Link>
          <Link href="/jobs" className="btn btn-brand btn-shine text-xs px-4 py-2.5">
            İş İlanlarını İncele
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 bg-err/10 border border-err/30 text-err text-sm rounded-md"
        >
          {error}
        </div>
      )}

      {/* Honesty note — the cross-check is real, so say it plainly, without shouting */}
      <div className="card p-5 flex gap-4">
        <IconHumanReview className="w-9 h-9 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-fg">
            Dürüstlük burada işe yarar
          </p>
          <p className="text-xs text-fg-soft leading-relaxed">
            Yüklediğiniz belgeler ve yazdığınız deneyimler birbirleriyle çapraz
            kontrol edilir; tutarsızlıklar raporda görünür olur. Abartmaya gerek
            yok — gerçek belgeniz, süslü cümleden her zaman daha güçlüdür.
          </p>
        </div>
      </div>

      {/* İlgi alanları — drives the personalized job feed */}
      <div className="card card-glow p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-fg">İlgi alanlarınız</p>
            <p className="text-xs text-fg-mute">
              Seçtiğiniz sektörler İş İlanları sayfasında önce gösterilir. İstediğiniz
              zaman değiştirebilirsiniz.
            </p>
          </div>
          <span className="text-[11px] text-fg-mute">
            {savingInterests
              ? "Kaydediliyor…"
              : interests.length > 0
              ? `${interests.length} seçili`
              : "Hepsi gösteriliyor"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SELECTABLE_CATEGORIES.map((c) => {
            const active = interests.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleInterest(c.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 transition-all ${
                  active
                    ? "bg-brand border-brand text-brand-ink"
                    : "bg-well border-line text-fg-soft hover:text-fg hover:border-brand/50"
                }`}
              >
                <CategoryIcon k={c.key} className="w-3.5 h-3.5" /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Three quiet tips instead of a shouting banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            t: "Güncel özgeçmişinizi yükleyin",
            b: "PDF ya da fotoğraf fark etmez; okunaklı olması yeterli.",
          },
          {
            t: "Belgelerinizi ekleyin",
            b: "Sertifika, ehliyet, ustalık belgesi — ne varsa değerlendirmeyi güçlendirir.",
          },
          {
            t: "Deneyiminizi kendi cümlelerinizle anlatın",
            b: "Tamamladığınız işleri kısa bir vaka olarak yazın; kanıt bağlantısı ekleyebilirsiniz.",
          },
        ].map((tip, i) => (
          <div key={tip.t} className="card p-4 flex gap-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-brand/40 text-brand text-xs font-semibold tabular-nums shrink-0">
              {i + 1}
            </span>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-fg">{tip.t}</p>
              <p className="text-xs text-fg-mute leading-relaxed">{tip.b}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Accomplishments & Case Studies + CV Upload (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Publish Case Study / Accomplishment Section */}
          <div className="card p-7 space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-lg font-semibold text-fg tracking-tight">
                Mesleki Deneyim Ekle
              </h2>
              <span className="badge bg-brand/10 text-brand border-brand/30 uppercase tracking-wider">
                Vaka / Portföy
              </span>
            </div>

            {accError && (
              <div
                role="alert"
                className="p-3 bg-err/10 border border-err/30 text-err text-xs rounded-md"
              >
                {accError}
              </div>
            )}
            {accSuccess && (
              <div className="p-3.5 bg-ok/10 border border-ok/30 text-ok text-xs rounded-md font-medium">
                {accSuccess}
              </div>
            )}

            <form onSubmit={handlePublishAccomplishment} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="deneyim-kategori"
                    className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                  >
                    Meslek Kategorisi / Sektör
                  </label>
                  <select
                    id="deneyim-kategori"
                    value={accCategory}
                    disabled={publishingAcc}
                    onChange={(e) => setAccCategory(e.target.value as ProfessionCategory)}
                    className="field text-xs"
                  >
                    {SELECTABLE_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="deneyim-baslik"
                    className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                  >
                    Deneyim Başlığı
                  </label>
                  <input
                    id="deneyim-baslik"
                    type="text"
                    required
                    disabled={publishingAcc}
                    value={accTitle}
                    onChange={(e) => setAccTitle(e.target.value)}
                    placeholder="Örn: 10 yıllık makam şoförlüğü ve ileri sürüş sertifikaları"
                    className="field text-xs"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="deneyim-ayrinti"
                  className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                >
                  Deneyimin Ayrıntısı
                </label>
                <textarea
                  id="deneyim-ayrinti"
                  required
                  rows={4}
                  disabled={publishingAcc}
                  value={accContent}
                  onChange={(e) => setAccContent(e.target.value)}
                  placeholder="Tamamladığınız işi, projeyi veya mesleki deneyimi kendi cümlelerinizle anlatın…"
                  className="field text-xs leading-relaxed"
                />
              </div>

              <div>
                <label
                  htmlFor="deneyim-kanit"
                  className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                >
                  Belge / Sertifika / Proje Bağlantısı (isteğe bağlı)
                </label>
                <input
                  id="deneyim-kanit"
                  type="url"
                  disabled={publishingAcc}
                  value={accProofLink}
                  onChange={(e) => setAccProofLink(e.target.value)}
                  placeholder="https://drive.google.com/sertifikam veya https://github.com/projem"
                  className="field text-xs"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer p-3.5 bg-brand/5 border border-brand/20 rounded-md">
                <input
                  type="checkbox"
                  checked={accConsent}
                  onChange={(e) => setAccConsent(e.target.checked)}
                  className="mt-0.5 accent-[var(--brand)] w-4 h-4 shrink-0"
                />
                <span className="text-xs text-fg-soft leading-relaxed">
                  Yazdığım deneyimin doğru olduğunu ve yapay zeka tarafından
                  değerlendirilmesini kabul ediyorum.
                </span>
              </label>

              <button
                type="submit"
                disabled={publishingAcc}
                className="btn btn-brand btn-shine w-full text-xs"
              >
                {publishingAcc ? "Analiz ediliyor…" : "Deneyimi Ekle"}
              </button>
            </form>
          </div>

          {/* User Published Case Studies List */}
          {accomplishments.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-fg tracking-tight">
                Eklenen Deneyimler ({accomplishments.length})
              </h3>
              <div className="space-y-3">
                {accomplishments.map((acc) => (
                  <div key={acc.id} className="card card-lift p-5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-semibold text-fg text-sm">{acc.title}</h4>
                      <span
                        className={`badge uppercase tracking-wider ${
                          acc.verified_by_ai
                            ? "bg-ok/10 text-ok border-ok/30"
                            : "bg-warn/10 text-warn border-warn/30"
                        }`}
                      >
                        {acc.verified_by_ai ? "Analiz edildi" : "Analiz bekliyor"}
                      </span>
                    </div>
                    <p className="text-xs text-fg-soft leading-relaxed">{acc.content}</p>
                    {acc.proof_link && (
                      <a
                        href={acc.proof_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand hover:text-brand-strong hover:underline font-semibold block pt-1 transition-colors"
                      >
                        Kanıt bağlantısı &rarr;
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main CV Upload Box */}
          <div className="card p-7 space-y-6 relative overflow-hidden">
            {analyzing && (
              <div className="absolute inset-0 bg-well/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center space-y-4 rounded-lg">
                <div className="w-12 h-12 border-4 border-brand/25 border-t-brand rounded-full animate-spin" />
                <p className="text-fg font-semibold text-sm">
                  Belgeniz inceleniyor…
                </p>
              </div>
            )}
            <div className="border-b border-line pb-3">
              <h2 className="text-lg font-semibold text-fg tracking-tight">
                Özgeçmiş / Belge Yükle
              </h2>
            </div>

            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <label
                  htmlFor="cv-hedef-ilan"
                  className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                >
                  Hedef Pozisyon / İlan (isteğe bağlı)
                </label>
                <select
                  id="cv-hedef-ilan"
                  value={selectedJobId}
                  disabled={analyzing}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="field text-xs"
                >
                  <option value="">— Genel özgeçmiş değerlendirmesi —</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} (İlan #{j.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="cv-belge"
                  className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                >
                  Özgeçmiş veya belge
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={DOCUMENT_ACCEPT}
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {/* A real button so keyboard users can open the file picker too */}
                <button
                  id="cv-belge"
                  type="button"
                  disabled={analyzing}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-6 border-2 border-dashed border-line-strong hover:border-brand bg-well rounded-md text-center cursor-pointer transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {file ? (
                    <span className="block text-brand text-sm font-semibold">
                      {file.name}{" "}
                      <span className="text-fg-mute font-normal tabular-nums">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </span>
                  ) : (
                    <span className="block text-fg-mute text-xs">
                      Dosyanızı seçmek için{" "}
                      <span className="text-brand underline underline-offset-2">
                        tıklayın
                      </span>{" "}
                      — {DOCUMENT_HINT}
                    </span>
                  )}
                </button>
              </div>

              {/* Informed consent — why we ask, what happens, what never happens */}
              <div className="p-4 bg-brand/5 border border-brand/20 rounded-md space-y-3">
                <p className="text-xs font-semibold text-fg">
                  Onayınızı neden istiyoruz?
                </p>
                <p className="text-xs text-fg-soft leading-relaxed">
                  Belgeniz ancak siz izin verirseniz okunur. Değerlendirme için
                  belgenin metni ve görüntüsü Google&apos;ın yapay zeka servisine
                  (yurt dışına) iletilir; sonuç yalnızca başvurduğunuz işverene
                  gösterilir. Belgeniz reklam için kullanılmaz, kimseye
                  satılmaz. Ayrıntılar:{" "}
                  <Link
                    href="/kvkk"
                    target="_blank"
                    className="text-brand underline underline-offset-2 hover:text-brand-strong transition-colors"
                  >
                    KVKK aydınlatma metni
                  </Link>
                </p>
                <label className="flex items-start gap-3 cursor-pointer pt-1 border-t border-brand/15">
                  <input
                    type="checkbox"
                    checked={consentVerified}
                    onChange={(e) => setConsentVerified(e.target.checked)}
                    className="mt-1 accent-[var(--brand)] w-4 h-4"
                  />
                  <span className="text-xs text-fg-soft leading-relaxed">
                    <strong className="text-fg">
                      Belgemin incelenmesine onay veriyorum.
                    </strong>{" "}
                    Yüklediğim belge bana aittir ve doğrudur. Bu onayı istediğim
                    zaman geri çekebilirim.
                  </span>
                </label>
              </div>

              {analysisError && (
                <div
                  role="alert"
                  className="p-3 bg-err/10 border border-err/30 text-err text-xs rounded-md"
                >
                  {analysisError}
                </div>
              )}

              {/* Analysis outcome — incl. the human-review notice for scans */}
              {analysisResult && (
                <div className="p-4 bg-ok/5 border border-ok/25 rounded-md space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-fg">
                      Belgeniz alındı
                    </p>
                    {analysisResult.status && (
                      <span
                        className={`badge uppercase tracking-wider ${
                          AI_STATUS_STYLES[analysisResult.status] ??
                          "bg-raised text-fg-soft border-line-strong"
                        }`}
                      >
                        {AI_STATUS_LABELS[analysisResult.status] ?? analysisResult.status}
                      </span>
                    )}
                  </div>
                  {typeof analysisResult.confidence_score === "number" && (
                    <p className="text-xs text-fg-soft tabular-nums">
                      {/* The engine's confidence_score is an int 0-100; 1 means 1%. */}
                      Güven skoru: %{Math.round(analysisResult.confidence_score)}
                    </p>
                  )}
                  {analysisResult.review_status === "pending" && (
                    <div className="flex gap-3 p-3 bg-brand/5 border border-brand/20 rounded-md">
                      <IconHumanReview className="w-8 h-8 shrink-0" />
                      <p className="text-xs text-fg-soft leading-relaxed">
                        <strong className="text-fg">
                          Belgeniz incelemeye alındı.
                        </strong>{" "}
                        Fotoğraf ve taranmış belgeler, işverene gösterilmeden
                        önce ekibimiz tarafından kontrol edilir. Bu genellikle
                        kısa sürer; sizin yapmanız gereken bir şey yok.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={analyzing || !file}
                className="btn btn-brand btn-shine w-full text-xs"
              >
                {analyzing ? "Belge inceleniyor…" : "Belgemi Değerlendir"}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Applications & Verified Evidences (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Applications Status Card */}
          <div className="card p-7 space-y-5">
            <h2 className="text-base font-semibold text-fg flex items-center justify-between border-b border-line pb-3 tracking-tight">
              <span>Başvurularım</span>
              <span className="badge bg-raised text-fg-soft border-line-strong tabular-nums">
                {applications.length} başvuru
              </span>
            </h2>

            {loading ? (
              <p className="text-xs text-fg-mute">Yükleniyor…</p>
            ) : applications.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-xs text-fg-mute">
                  Henüz hiçbir iş ilanına başvurmadınız.
                </p>
                <Link href="/jobs" className="btn btn-quiet text-xs px-4 py-2 inline-flex">
                  İlanlara göz at
                </Link>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {applications.map((app) => (
                  <div key={app.id} className="card card-lift bg-well p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-fg">
                        {getJobTitle(app.job_id)}
                      </p>
                      <span
                        className={`badge uppercase tracking-wider ${
                          app.status === "accepted"
                            ? "bg-ok/10 text-ok border-ok/30"
                            : app.status === "declined"
                            ? "bg-err/10 text-err border-err/30"
                            : "bg-warn/10 text-warn border-warn/30"
                        }`}
                      >
                        {app.status === "accepted"
                          ? "Kabul edildi"
                          : app.status === "declined"
                          ? "Reddedildi"
                          : "Değerlendiriliyor"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] text-fg-mute tabular-nums">
                        Başvuru takip no: #{app.id}
                      </p>
                      <Link
                        href={`/reports/${app.id}`}
                        className="text-[10px] text-brand hover:text-brand-strong hover:underline font-semibold shrink-0"
                      >
                        Raporu görüntüle &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Stats Card */}
          <div className="card p-7 space-y-4">
            <h3 className="text-sm font-semibold text-fg tracking-tight">
              Doğrulanmış kanıtlarım
            </h3>
            <p className="text-xs text-fg-soft leading-relaxed">
              {loading ? (
                "Yükleniyor…"
              ) : (
                <>
                  Sizin için kayıtlı{" "}
                  <strong className="text-brand tabular-nums">
                    {verifiedCount}
                  </strong>{" "}
                  doğrulanmış yetkinlik kanıtı bulunuyor.
                </>
              )}
            </p>
            {pendingCount > 0 && (
              <p className="text-xs text-warn leading-relaxed">
                <strong className="tabular-nums">{pendingCount}</strong> belgeniz
                ekibimizin kontrolünde; onaylanana kadar işverene gösterilmez.
              </p>
            )}
            {rejectedCount > 0 && (
              <p className="text-xs text-err leading-relaxed">
                <strong className="tabular-nums">{rejectedCount}</strong> belgeniz
                incelemede onaylanmadı ve işverene gösterilmiyor. Ayrıntı için
                raporunuza bakın; daha net bir kopya yükleyerek yeniden
                deneyebilirsiniz.
              </p>
            )}
            {/* Reports are keyed by application id, not candidate id — a
                candidate can have several applications, each with its own
                report. This card is a summary, so it links to the most
                recent one; every application below carries its own link. */}
            {applications.length > 0 ? (
              <Link
                href={`/reports/${applications[0].id}`}
                className="text-xs text-brand hover:text-brand-strong hover:underline font-semibold block transition-colors"
              >
                Tam raporu incele &rarr;
              </Link>
            ) : (
              <Link
                href="/jobs"
                className="text-xs text-fg-mute hover:text-fg-soft hover:underline font-medium block transition-colors"
              >
                Henüz bir başvurunuz yok — ilanlara göz atın &rarr;
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
