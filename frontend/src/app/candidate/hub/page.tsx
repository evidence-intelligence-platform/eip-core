"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ProfessionCategory,
  FileAnalysisData,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { IconHumanReview, LedgerCheck, SealMark } from "@/components/illustrations";
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
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  // Whether `jobs` reflects a *successful* read. An empty `jobs` because the
  // request failed says nothing about any single posting — getJobTitle needs
  // to tell that apart from a genuinely absent posting.
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [savingInterests, setSavingInterests] = useState(false);
  // Ticket counter for toggleInterest's race guard — see the comment there.
  const interestsReqIdRef = useRef(0);
  // The last set the server confirmed, which is what a failed save must roll
  // back to — see toggleInterest.
  const lastSavedInterestsRef = useRef<string[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
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

  // An employer or admin landing here would otherwise see the applications
  // *sent to them* presented as "Başvurularım" through a candidate's eyes —
  // they get the mirror of the employer dashboard's role-guard card instead.
  const isNonCandidate = user?.role === "employer" || user?.role === "admin";

  // Toggle one interest category and persist the new set. Optimistic: the
  // chip flips immediately, and a failed save rolls back with a message.
  //
  // Two rapid clicks fire two overlapping PUT requests; nothing guarantees
  // they resolve in the order they were sent. interestsReqIdRef tags each
  // call with a ticket number so an older response that arrives after a
  // newer one is ignored instead of silently reverting the newer selection
  // (and so "Kaydediliyor…" only clears once the *latest* save settles).
  //
  // The rollback reads lastSavedInterestsRef, not the value this click saw on
  // screen: after two clicks the second one's local "before" is already the
  // first one's optimistic guess, so if both saves fail, restoring it would
  // leave an unsaved selection ticked and looking stored.
  const toggleInterest = async (key: string) => {
    const next = interests.includes(key)
      ? interests.filter((k) => k !== key)
      : [...interests, key];
    setInterests(next);
    const reqId = ++interestsReqIdRef.current;
    setSavingInterests(true);
    try {
      const saved = await setMyInterests(next);
      lastSavedInterestsRef.current = saved;
      if (reqId === interestsReqIdRef.current) {
        setInterests(saved);
      }
    } catch {
      if (reqId === interestsReqIdRef.current) {
        setInterests(lastSavedInterestsRef.current);
        setError("İlgi alanları kaydedilemedi. Lütfen tekrar deneyin.");
      }
    } finally {
      if (reqId === interestsReqIdRef.current) {
        setSavingInterests(false);
      }
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
      setJobsLoaded(jobsRes.status === "fulfilled");
      setApplications(appsRes.status === "fulfilled" ? appsRes.value : []);
      setEvidences(evRes.status === "fulfilled" ? evRes.value : []);
      setInterests(intRes.status === "fulfilled" ? intRes.value : []);
      if (intRes.status === "fulfilled") {
        lastSavedInterestsRef.current = intRes.value;
      }

      // A 404 on the evidence call just means this candidate has no record
      // yet (they have not applied anywhere) — that is an empty state, not a
      // failure. Only real errors reach the banner.
      const isMissingRecord = (r: PromiseSettledResult<unknown>) =>
        r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 404;

      const failed = [jobsRes, appsRes, evRes, intRes].find(
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

  // Guard: visitors go to /login instead of a dead-end 401 banner — same
  // pattern as hesap/page.tsx. A stored token with no profile is *not* a
  // visitor: AuthProvider deliberately keeps a token whose /auth/me call died
  // on a 5xx or a dropped connection, so redirecting on `!user` alone would
  // undo that and turn a brief engine outage into a forced re-login.
  useEffect(() => {
    if (!authLoading && !user && !token) {
      router.replace("/login");
    }
  }, [authLoading, user, token, router]);

  useEffect(() => {
    // AuthProvider restores the bearer token in its own mount effect, which
    // runs *after* this one; fetching while it is still loading would 401 on
    // getApplications and flash a misleading "giriş yapın" banner. Visitors
    // are being redirected and non-candidates only see the role-guard card,
    // so neither should fire candidate-scoped requests.
    if (authLoading || !user || isNonCandidate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/auth-ready, the standard data-load pattern used throughout this app
    fetchData();
  }, [authLoading, user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const problem = validateDocument(selected);
    if (problem) {
      setAnalysisError(problem);
      // Rejected or not, picking a file ends the previous document's verdict:
      // the panel carries no filename, so leaving it under this error would
      // read as if it belonged to the file that was just refused.
      setAnalysisResult(null);
      e.target.value = "";
      return;
    }
    setAnalysisError(null);
    // A newly picked file has not been through /extract yet — the previous
    // file's verdict must not linger under the new filename.
    setAnalysisResult(null);
    setFile(selected);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    if (!candidateExtId) {
      // A signed-in user without a candidate id is not a visitor — telling
      // them to "log in" when they already have would be a dead end.
      setAnalysisError(
        user
          ? "Aday profiliniz doğrulanamadı. Lütfen çıkış yapıp yeniden giriş yapın."
          : "Belge yüklemek için giriş yapmanız gerekiyor."
      );
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
        // The verdict is on screen; drop the file so a second click on the
        // submit button cannot send the same document to /extract again.
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        // Separate from `error`: fetchData() below clears that one, which used
        // to wipe this message off the screen a moment after it appeared.
        setAnalysisError(res.error ?? "Belgeniz analiz edilemedi.");
      }

      await fetchData();
    } catch (err: unknown) {
      // Form-local error, next to the submit button — the page-top banner
      // belongs to fetchData. Only ApiError carries a localized message.
      setAnalysisError(
        err instanceof ApiError
          ? err.message
          : "Belgeniz analiz edilemedi. Lütfen tekrar deneyin."
      );
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
        // Same distinction as handleAnalyze: signed-in but profile-less is
        // not the same problem as not being signed in at all.
        setAccError(
          user
            ? "Aday profiliniz doğrulanamadı. Lütfen çıkış yapıp yeniden giriş yapın."
            : "Deneyim eklemek için giriş yapmanız gerekiyor."
        );
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

      // The /extract response is the same ExtractionResult shape the CV-upload
      // path reads (status/reasoning/confidence_score/evidence_pointer). A 2xx
      // reply here can still carry CONTRADICTION or INSUFFICIENT EVIDENCE — that
      // verdict must reach the candidate, not just a "were you analyzed at all"
      // boolean. The list below reads the real verdict from `evidences`
      // (re-fetched just below), so no separate local record is kept here.
      if (analysis.success) {
        const verdict = analysis.data as FileAnalysisData | undefined;
        if (verdict?.status === "VERIFIED") {
          setAccSuccess("Deneyiminiz doğrulandı ve profilinize eklendi.");
        } else if (verdict?.status === "CONTRADICTION") {
          setAccSuccess(
            "Deneyiminiz eklendi, ancak yapay zeka yazdıklarınızla bir çelişki tespit etti. Aşağıdaki karttan ayrıntıyı görebilirsiniz."
          );
        } else if (verdict?.status === "INSUFFICIENT EVIDENCE") {
          setAccSuccess(
            "Deneyiminiz eklendi, ancak yapay zeka yeterli kanıt bulamadı. Aşağıdaki karttan ayrıntıyı görebilirsiniz."
          );
        } else {
          setAccSuccess("Deneyiminiz analiz edildi ve profilinize eklendi.");
        }
      } else {
        setAccSuccess(
          "Deneyiminiz kaydedildi, ancak yapay zeka analizi şu anda tamamlanamadı. Daha sonra tekrar deneyebilirsiniz."
        );
      }

      setAccTitle("");
      setAccContent("");
      setAccProofLink("");
      await fetchData();
    } catch (err: unknown) {
      // Same reasoning as handleAnalyze: keep the failure next to the form
      // it belongs to instead of the page-top fetch banner.
      setAccError(
        err instanceof ApiError
          ? err.message
          : "Deneyiminiz kaydedilemedi. Lütfen tekrar deneyin."
      );
    } finally {
      setPublishingAcc(false);
    }
  };

  // `jobs` only carries publicly listed (active) postings, so a miss here
  // almost always means the posting was closed after this application —
  // say that instead of echoing a bare id back at the reader. That reading
  // only holds once the list actually arrived: when getJobs() failed, `jobs`
  // is empty for a reason that has nothing to do with these postings, and
  // labelling every card "kapatıldı" would state a closure that never
  // happened. Stay neutral until we know.
  const getJobTitle = (jobId: number) => {
    const j = jobs.find((job) => job.id === jobId);
    if (j) return j.title;
    return jobsLoaded ? `İlan kapatıldı (#${jobId})` : `İş İlanı #${jobId}`;
  };

  // The evidence rows carry no title of their own (the typed title lives
  // inside the analyzed raw text, which this endpoint does not return), so
  // the submission moment is what tells otherwise identical cards apart.
  // created_at is a naive UTC timestamp from the engine; pin it to UTC
  // before parsing unless it already carries an offset.
  const formatEvidenceDate = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(/Z|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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

  // "Eklenen Deneyimler" reads straight from the fetched evidences instead of
  // a local, in-tab-only list: that way a submitted case study — and the AI's
  // actual verdict on it — survives a refresh, a new tab, or another device,
  // since it comes back from the server on every fetchData() call.
  const accomplishmentEvidences = evidences
    .filter((e) => e.requirement_external_id === "req_general_accomplishment")
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  // Neither this endpoint nor the backend query guarantees any ordering, so
  // the raw `applications` array can come back oldest-first. Sort newest
  // first here — by created_at, falling back to id when timestamps are
  // missing or tied — so both the "Başvurularım" list and the "Tam raporu
  // incele" shortcut below agree on which application is the most recent.
  const sortedApplications = [...applications].sort((a, b) => {
    const byDate = (b.created_at ?? "").localeCompare(a.created_at ?? "");
    if (byDate !== 0) return byDate;
    return (b.id ?? 0) - (a.id ?? 0);
  });

  // Role guard notice — the mirror of the employer dashboard's card, shown
  // to an employer or admin who lands on the candidate side of the platform.
  if (isNonCandidate) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="card p-8 space-y-4">
          <LedgerCheck className="w-28 h-auto mx-auto" />
          <h1 className="text-2xl font-semibold text-fg tracking-tight">Aday Paneli</h1>
          <p className="text-sm text-fg-soft leading-relaxed">
            Burası adayların belgelerini yükleyip başvurularını takip ettiği
            aday panelidir. İlanlarınızı yönetmek ve gelen başvuruları
            değerlendirmek için işveren panelini kullanabilirsiniz.
          </p>
          <div className="pt-2 flex justify-center">
            <Link href="/employer/dashboard" className="btn btn-brand btn-shine btn-sm">
              İşveren Paneline Git
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // A kept token with no profile: /auth/me failed on something that says
  // nothing about the session, so the redirect guard let this user stay.
  // AuthProvider exposes no way to re-run its mount fetch, which is why the
  // retry is a reload — that fetch runs on mount and nowhere else.
  if (!authLoading && !user && token) {
    return (
      <div className="max-w-md mx-auto my-16 card p-8 text-center space-y-4 animate-fade-in-up">
        <SealMark className="w-10 h-10 mx-auto" />
        <h1 className="text-lg font-semibold text-fg tracking-tight">
          Hesap bilgileriniz alınamadı
        </h1>
        <p className="text-sm text-fg-soft leading-relaxed">
          Oturumunuz açık, ancak hesap bilgileriniz şu anda getirilemedi.
          Bu genellikle geçici bir aksaklıktır; birkaç saniye sonra tekrar
          deneyebilirsiniz.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn btn-brand btn-shine btn-sm"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  // While auth resolves (or a visitor is being redirected to /login), hold
  // quietly instead of flashing an empty panel — same as hesap/page.tsx.
  if (authLoading || !user) {
    return (
      <div className="max-w-md mx-auto my-16 card p-8 text-center space-y-4 animate-fade-in-up">
        <SealMark className="w-10 h-10 mx-auto" />
        <p className="text-sm text-fg-soft">Aday paneliniz hazırlanıyor…</p>
      </div>
    );
  }

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
            className="btn btn-quiet btn-sm"
          >
            Profilimi gör
          </Link>
          <Link href="/jobs" className="btn btn-brand btn-shine btn-sm">
            İş ilanlarını incele
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
                    className="field field-sm"
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
                    className="field field-sm"
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
                  className="field field-sm leading-relaxed"
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
                  className="field field-sm"
                />
              </div>

              {/* Informed consent — same disclosure as the belge yükleme
                  formu, since both feed the same consent-gated /extract
                  endpoint on the same candidate's personal data. */}
              <div className="p-4 bg-brand/5 border border-brand/20 rounded-md space-y-3">
                <p className="text-xs font-semibold text-fg">
                  Onayınızı neden istiyoruz?
                </p>
                <p className="text-xs text-fg-soft leading-relaxed">
                  Yazdığınız deneyim ancak siz izin verirseniz değerlendirilir.
                  Değerlendirme için yazdığınız metin Google&apos;ın yapay
                  zeka servisine (yurt dışına) iletilir; sonuç yalnızca
                  başvurduğunuz işverene gösterilir. Yazdıklarınız reklam için
                  kullanılmaz, kimseye satılmaz. Ayrıntılar:{" "}
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
                    checked={accConsent}
                    disabled={publishingAcc}
                    onChange={(e) => setAccConsent(e.target.checked)}
                    className="mt-1 accent-[var(--brand)] w-4 h-4 shrink-0"
                  />
                  <span className="text-xs text-fg-soft leading-relaxed">
                    <strong className="text-fg">
                      Yazdığım deneyimin değerlendirilmesine onay veriyorum.
                    </strong>{" "}
                    Yazdığım deneyim doğrudur ve bana aittir. Bu onayı
                    istediğim zaman geri çekebilirim.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={publishingAcc}
                className="btn btn-brand btn-shine btn-sm w-full"
              >
                {publishingAcc ? "Analiz ediliyor…" : "Deneyimi Ekle"}
              </button>
            </form>
          </div>

          {/* Published Case Studies List — sourced from the persisted evidence
              records, so the AI's real verdict (and the record itself)
              survives a page reload instead of living only in this tab. */}
          {accomplishmentEvidences.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-fg tracking-tight">
                Eklenen Deneyimler ({accomplishmentEvidences.length})
              </h3>
              <div className="space-y-3">
                {accomplishmentEvidences.map((ev) => (
                  <div
                    key={ev.id ?? `${ev.requirement_external_id}-${ev.created_at}`}
                    className="card card-lift p-5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <h4 className="font-semibold text-fg text-sm">
                          Mesleki Deneyim Değerlendirmesi
                        </h4>
                        {formatEvidenceDate(ev.created_at) && (
                          <p className="text-[11px] text-fg-mute tabular-nums">
                            Eklendi: {formatEvidenceDate(ev.created_at)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`badge uppercase tracking-wider ${
                          AI_STATUS_STYLES[ev.status] ??
                          "bg-raised text-fg-soft border-line-strong"
                        }`}
                      >
                        {AI_STATUS_LABELS[ev.status] ?? ev.status}
                      </span>
                    </div>
                    {ev.reasoning && (
                      <p className="text-xs text-fg-soft leading-relaxed">{ev.reasoning}</p>
                    )}
                    {ev.evidence_pointer && (
                      <p className="text-[11px] text-fg-mute italic leading-relaxed break-words">
                        &ldquo;{ev.evidence_pointer}&rdquo;
                      </p>
                    )}
                    {ev.review_status === "pending" && (
                      <p className="text-[11px] text-warn">
                        İncelemede — onaylanana kadar işverene gösterilmez.
                      </p>
                    )}
                    {ev.review_status === "rejected" && (
                      <p className="text-[11px] text-err">
                        İncelemede onaylanmadı — işverene gösterilmiyor.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main CV Upload Box */}
          <div className="card p-7 space-y-6 relative overflow-hidden">
            {analyzing && (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-0 bg-well/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center space-y-4 rounded-lg"
              >
                <div
                  className="w-12 h-12 border-4 border-brand/25 border-t-brand rounded-full animate-spin"
                  aria-hidden="true"
                />
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
                  className="field field-sm"
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
                      {/* After a successful analysis the file is cleared; invite
                          the next document instead of repeating the first-run copy. */}
                      {analysisResult ? "Başka bir belge yüklemek için" : "Dosyanızı seçmek için"}{" "}
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
                    disabled={analyzing}
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
                className="btn btn-brand btn-shine btn-sm w-full"
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
              {loading ? (
                // The count is unknown while loading — a "0 başvuru" badge
                // here would be a lie until the data lands.
                <span className="skeleton h-4 w-20 rounded-full" aria-hidden="true" />
              ) : (
                <span className="badge bg-raised text-fg-soft border-line-strong tabular-nums">
                  {applications.length} başvuru
                </span>
              )}
            </h2>

            {loading ? (
              // Skeleton rows shaped like the eventual application cards below —
              // same pattern jobs/page.tsx uses for its own list — so this card
              // doesn't pop from a bare sentence straight into full content.
              <div className="space-y-3" role="status" aria-busy="true">
                <span className="sr-only">Başvurularınız yükleniyor…</span>
                {[0, 1].map((i) => (
                  <div key={i} aria-hidden="true" className="card bg-well p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="skeleton h-3.5 w-2/5" />
                      <div className="skeleton h-4 w-20 rounded-full" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="skeleton h-3 w-1/4" />
                      <div className="skeleton h-3 w-1/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-xs text-fg-mute">
                  Henüz hiçbir iş ilanına başvurmadınız.
                </p>
                <Link href="/jobs" className="btn btn-quiet btn-sm inline-flex">
                  İlanlara göz at
                </Link>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {sortedApplications.map((app) => (
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
                        className="text-xs py-1 text-brand hover:text-brand-strong hover:underline font-semibold shrink-0"
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
            {loading ? (
              <div className="space-y-2" role="status" aria-busy="true">
                <span className="sr-only">Kanıt özeti yükleniyor…</span>
                <div className="skeleton h-3.5 w-4/5" aria-hidden="true" />
                <div className="skeleton h-3.5 w-2/5" aria-hidden="true" />
              </div>
            ) : (
              <p className="text-xs text-fg-soft leading-relaxed">
                Sizin için kayıtlı{" "}
                <strong className="text-brand tabular-nums">
                  {verifiedCount}
                </strong>{" "}
                doğrulanmış yetkinlik kanıtı bulunuyor.
              </p>
            )}
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
                recent one (sortedApplications[0], newest-first — see above);
                every application in "Başvurularım" carries its own link. */}
            {sortedApplications.length > 0 ? (
              <Link
                href={`/reports/${sortedApplications[0].id}`}
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
