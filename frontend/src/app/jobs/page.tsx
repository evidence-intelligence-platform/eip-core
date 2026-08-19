"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, MAX_UPLOAD_BYTES, validateDocument } from "@/lib/uploads";
import { CATEGORIES, categoryLabel, type CategoryKey } from "@/lib/categories";
import {
  getJobs,
  getCandidate,
  createCandidate,
  createApplication,
  analyzeCandidateFile,
  analyzeCandidateEvidence,
  getMyInterests,
  getApplications,
  JobPosting,
  type FileAnalysisData,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { IconHumanReview, SealMark } from "@/components/illustrations";
import { CategoryIcon, SearchIcon } from "@/components/CategoryIcon";

const AI_STATUS_LABELS: Record<string, string> = {
  VERIFIED: "Doğrulandı",
  "INSUFFICIENT EVIDENCE": "Yetersiz Kanıt",
  CONTRADICTION: "Çelişki",
};

const JOB_STATUS_LABELS: Record<string, string> = {
  active: "Yayında",
  draft: "Taslak",
  closed: "Kapandı",
};

// A negative verdict must not wear the success color.
const AI_STATUS_STYLES: Record<string, string> = {
  VERIFIED: "bg-ok/10 text-ok border-ok/30",
  "INSUFFICIENT EVIDENCE": "bg-warn/10 text-warn border-warn/30",
  CONTRADICTION: "bg-err/10 text-err border-err/30",
};

export default function JobListingsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Category Filter
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  // Job ids the signed-in candidate has already applied to — best-effort,
  // never blocks the page; used only to warn against an accidental duplicate.
  const [appliedJobIds, setAppliedJobIds] = useState<Set<number>>(new Set());

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
    aiResult?: FileAnalysisData | null;
    extraSourcesCount: number;
    failedSources: string[];
  } | null>(null);

  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  // The error banner sits at the top of the form; on short viewports the
  // viewer is usually scrolled down at the submit button when validation
  // fails, so bring the message to them instead of failing silently.
  useEffect(() => {
    if (formError) {
      formErrorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [formError]);

  // Dialog behaviour for the apply modal: focus moves into the dialog when it
  // opens and returns to the trigger when it closes.
  useEffect(() => {
    if (!selectedJob) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [selectedJob]);

  // Keep Tab inside the open dialog; Escape closes it (unless submitting).
  useEffect(() => {
    if (!selectedJob) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!submitting) setSelectedJob(null);
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = modalRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedJob, submitting]);

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

  // The backend scopes /applications/ to the caller's own role — a candidate
  // only ever gets their own rows back, never another candidate's.
  const refreshAppliedJobIds = () => {
    getApplications()
      .then((apps) => setAppliedJobIds(new Set(apps.map((a) => a.job_id))))
      .catch(() => setAppliedJobIds(new Set()));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, the standard data-load pattern used throughout this app
    fetchData();
  }, []);

  // Interests load once auth resolves (fetchData runs on mount, before the
  // AuthProvider has restored `user`). A signed-in candidate's picks lead the
  // feed; best-effort, never blocks the page.
  useEffect(() => {
    if (user?.role === "candidate") {
      getMyInterests()
        .then(setInterests)
        .catch(() => setInterests([]));
      refreshAppliedJobIds();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing candidate-only state when `user` changes away from candidate is the sync point itself
      setInterests([]);
      setAppliedJobIds(new Set());
    }
  }, [user]);

  const filteredJobs = jobs.filter((j) => {
    if (selectedCategory !== "ALL" && j.category !== selectedCategory) {
      // Real column now; the old title.includes() fallback never matched a
      // Turkish job title against an English category key.
      return false;
    }
    const q = searchQuery.trim().toLocaleLowerCase("tr");
    if (!q) return true;
    return [j.title, j.description, j.company_name]
      .filter(Boolean)
      .some((t) => String(t).toLocaleLowerCase("tr").includes(q));
  });

  // Personalized ordering: when the candidate has interests and is not
  // actively filtering/searching, lead with jobs in their chosen sectors —
  // stable within each group so the rest of the list keeps its order.
  const personalized =
    interests.length > 0 && selectedCategory === "ALL" && !searchQuery.trim();
  const orderedJobs = personalized
    ? [...filteredJobs].sort((a, b) => {
        const ai = interests.includes(a.category as string) ? 0 : 1;
        const bi = interests.includes(b.category as string) ? 0 : 1;
        return ai - bi;
      })
    : filteredJobs;

  const handleOpenApplyModal = (job: JobPosting) => {
    setSelectedJob(job);
    setFormError(null);
    setSubmitSuccessData(null);
    // Consent is per-application: a tick given for another ilan (or a
    // cancelled attempt) must not carry over as a pre-ticked box.
    setConsentVerified(false);
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
      // Identity comes from the server (/auth/me); building it here produced
      // a record the employer's report link could never resolve.
      if (!user?.candidate_external_id) {
        setFormError(
          user
            ? "Bu hesap bir aday hesabı değil. Başvurmak için aday hesabıyla giriş yapın."
            : "Başvuru yapmak için giriş yapmanız gerekiyor."
        );
        setSubmitting(false);
        return;
      }
      const extId = user.candidate_external_id;
      const cand = await createCandidate({
        external_id: extId,
        name: candidateName || user.email.split("@")[0] || "Aday Kullanıcı",
        consent_granted: consentVerified,
      }).catch(async (err) => {
        // Already registered from an earlier application — fetch that one record.
        // (Scanning the whole roster here would re-open the leak this change closed.)
        const existing = await getCandidate(extId).catch(() => null);
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

      // Job-specific requirement (this posting's own criterion) vs. job-neutral
      // evidence (a CV, a certificate, a profile link — describes the person,
      // not this posting). Filing everything under req_job_<id> made it
      // invisible to every *other* application: per API_CONTRACTS §5.2, only
      // req_job_<this job id> or anything outside the req_job_<n> namespace
      // counts toward a report, and job-neutral rows count toward *every*
      // application — including this one — so nothing is lost here.
      const GENERAL_REQ = {
        cv: "req_general_cv",
        linkedin: "req_general_linkedin",
        portfolio: "req_general_portfolio",
        certificate: "req_general_certificate",
        chatgpt: "req_general_chatgpt",
      } as const;
      const GENERAL_DESC = {
        linkedin: "Adayın profesyonel geçmişini yansıtan bir LinkedIn/profesyonel profil bağlantısı.",
        portfolio: "Adayın portföyünü, projelerini veya çalışma örneklerini gösteren bir bağlantı.",
        certificate: "Adayın sahip olduğu bir sertifika, ehliyet veya mesleki yetkinlik belgesi.",
        chatgpt: "Adayın yapay zeka sohbet geçmişinden elde edilen ek bağlam/kanıt.",
      } as const;
      let primaryAiResult = null;

      // 3. Process PDF/TXT Resume
      // Only count sources the engine actually accepted, so the success
      // screen cannot claim evidence that failed to process.
      const failedSources: string[] = [];
      if (resumeFile) {
        const extractRes = await analyzeCandidateFile(extId, GENERAL_REQ.cv, resumeFile, consentVerified);
        if (extractRes.success) {
          primaryAiResult = extractRes.data;
          extraSources++;
        } else {
          failedSources.push("CV");
        }
      }

      // 4. Process LinkedIn URL
      if (linkedinUrl.trim()) {
        const r = await analyzeCandidateEvidence(extId, "LINKEDIN_URL", `LinkedIn Profile URL: ${linkedinUrl.trim()}`, GENERAL_REQ.linkedin, GENERAL_DESC.linkedin, consentVerified);
        if (r.success) extraSources++;
        else failedSources.push("LinkedIn");
      }

      // 5. Process GitHub / Portfolio Link
      if (githubUrl.trim()) {
        const r = await analyzeCandidateEvidence(extId, "PORTFOLIO_LINK", `Portfolio Project Link: ${githubUrl.trim()}`, GENERAL_REQ.portfolio, GENERAL_DESC.portfolio, consentVerified);
        if (r.success) extraSources++;
        else failedSources.push("Portföy bağlantısı");
      }

      // 6. Process Certificate / License Link
      if (certificateLink.trim()) {
        const r = await analyzeCandidateEvidence(extId, "CERTIFICATE_LICENSE", `Certificate/License Link: ${certificateLink.trim()}`, GENERAL_REQ.certificate, GENERAL_DESC.certificate, consentVerified);
        if (r.success) extraSources++;
        else failedSources.push("Sertifika/belge bağlantısı");
      }

      // 7. Process ChatGPT Export JSON
      if (chatgptJsonFile) {
        const text = await chatgptJsonFile.text();
        const r = await analyzeCandidateEvidence(extId, "CHATGPT_EXPORT", text.slice(0, 4000), GENERAL_REQ.chatgpt, GENERAL_DESC.chatgpt, consentVerified);
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
      refreshAppliedJobIds();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Başvurunuz gönderilemedi, lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      {/* Single quiet brand tint behind the header — same grammar as the landing page */}
      <div
        className="absolute inset-x-0 top-0 h-[24rem] -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 70% at 50% 0%, color-mix(in oklab, var(--brand) 7%, transparent), transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="space-y-8 max-w-6xl mx-auto py-12 px-4">
        {/* Header */}
        <div className="text-center space-y-3 border-b border-line pb-8">
          <p className="eyebrow">Açık ilanlar</p>
          <h1 className="text-title text-fg">
            İlanı seçin, <span className="text-brand italic">belgenizle</span> başvurun
          </h1>
          <p className="text-fg-soft text-sm max-w-3xl mx-auto leading-relaxed">
            Sağlıktan lojistiğe, mutfaktan yazılıma her meslek grubundan açık
            pozisyonlar. Belgelerinizi ekleyin; başvurunuz gerekçesiyle birlikte
            değerlendirilsin.
          </p>
        </div>

        {/* Search */}
        <div className="max-w-xl mx-auto relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-mute pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pozisyon, şirket veya anahtar kelime arayın…"
            aria-label="İlanlarda ara"
            className="field !pl-11 !py-3 !rounded-full text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Aramayı temizle"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-fg-mute hover:text-fg hover:bg-raised transition-colors text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sector filters — a single horizontal strip with faded edges, so
            18 sectors take one row (not three) and an actual job card stays
            above the fold. The strip scrolls by wheel/drag/touch; the active
            chip scrolls itself into view. Mobile-first by construction. */}
        <div className="ticker-mask -mx-4 px-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar snap-x">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={(e) => {
                    setSelectedCategory(cat.key);
                    e.currentTarget.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
                  }}
                  aria-pressed={active}
                  className={`shrink-0 snap-start px-4 py-2 rounded-full text-xs font-semibold border transition-all duration-200 inline-flex items-center gap-1.5 ${
                    active
                      ? "bg-brand border-brand text-brand-ink shadow-lg shadow-brand/20"
                      : "bg-surface border-line text-fg-soft hover:text-fg hover:border-brand/50"
                  }`}
                >
                  <CategoryIcon k={cat.key} className="w-4 h-4" /> {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 bg-err/10 border border-err/30 text-err text-sm rounded-md flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchData}
              className="px-3 py-1.5 bg-err/10 hover:bg-err/20 border border-err/30 text-err rounded-md text-xs font-semibold transition-colors"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Job Cards */}
        {loading ? (
          /* Skeletons keep the page's shape while the roster loads — no
             layout jump when the real cards land. */
          <div className="grid grid-cols-1 gap-6" aria-label="İş ilanları yükleniyor" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-8 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2.5 flex-1">
                    <div className="skeleton h-7 w-2/5" />
                    <div className="skeleton h-3.5 w-1/4" />
                  </div>
                  <div className="skeleton h-11 w-44 shrink-0 rounded-md" />
                </div>
                <div className="skeleton h-16 w-full rounded-md" />
              </div>
            ))}
          </div>
        ) : orderedJobs.length === 0 ? (
          <div className="card p-12 text-center space-y-4">
            <IconHumanReview className="w-14 h-14 mx-auto opacity-60" aria-hidden="true" />
            <p className="text-fg-soft text-base">
              {error
                ? "İlanlar şu anda görüntülenemiyor."
                : searchQuery.trim()
                ? `"${searchQuery.trim()}" aramasıyla eşleşen ilan bulunamadı.`
                : "Bu kategoride henüz aktif bir iş ilanı yayınlanmadı."}
            </p>
            <p className="text-xs text-fg-mute">
              {searchQuery.trim()
                ? "Farklı bir anahtar kelime deneyin veya aramayı temizleyin."
                : "Farklı bir meslek kategorisi seçerek arama yapabilirsiniz."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {personalized && (
              <p className="text-xs text-brand/90 flex items-center gap-1.5 -mb-2">
                <span className="dot-live" aria-hidden="true" />
                İlgi alanlarınıza göre sıralandı — düzenlemek için Aday Paneli.
              </p>
            )}
            {orderedJobs.map((job) => {
              const alreadyApplied = job.id != null && appliedJobIds.has(job.id);
              return (
              <div
                key={job.id}
                className="card card-lift p-8 space-y-5 relative overflow-hidden group"
              >
                {/* Brass reading rail — appears as the card gains focus */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-brand/70 via-brand/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-semibold text-fg tracking-tight text-balance">{job.title}</h2>
                      <span className="badge bg-ok/10 text-ok border-ok/30 uppercase tracking-wider">
                        <span className="dot-live !w-1.5 !h-1.5" aria-hidden="true" />
                        {JOB_STATUS_LABELS[job.status] ?? "Yayında"}
                      </span>
                      {alreadyApplied && (
                        <span className="badge bg-brand/10 text-brand border-brand/30 uppercase tracking-wider">
                          Zaten başvurdunuz
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg-mute mt-1.5 flex flex-wrap items-center gap-x-2">
                      <span>{job.company_name || "EİP Partner Kurum"}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <CategoryIcon k={job.category || "OTHER"} className="w-3.5 h-3.5" />
                        {categoryLabel(job.category)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">İlan No #{job.id}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenApplyModal(job)}
                    title={alreadyApplied ? "Bu ilana daha önce başvurdunuz; yine de tekrar başvurabilirsiniz." : undefined}
                    className={
                      alreadyApplied
                        ? "btn btn-quiet text-sm shrink-0"
                        : "btn btn-brand btn-shine text-sm shrink-0"
                    }
                  >
                    {alreadyApplied ? "Tekrar başvur" : "Belgelerinle başvur"}
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                </div>

                <div className="p-4 bg-well rounded-md border border-line text-sm text-fg-soft leading-relaxed transition-colors group-hover:border-line-strong">
                  {job.description}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Apply Modal */}
        {selectedJob && (
          /* No items-center here: when the dialog is taller than the viewport,
             centering pushes its top into unreachable block-start overflow —
             the title, close button and error banner get clipped off with no
             way to scroll to them. m-auto on the child centers short dialogs
             and gracefully top-aligns tall ones inside the scroll container. */
          <div className="fixed inset-0 bg-well/80 backdrop-blur-sm flex p-4 z-50 overflow-y-auto">
            <div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="basvuru-modal-baslik"
              tabIndex={-1}
              className="card border-gradient p-8 max-w-xl w-full space-y-6 m-auto relative overflow-hidden animate-fade-in-up"
            >
              {submitting && (
                <div className="absolute inset-0 bg-well/85 backdrop-blur-sm z-10 flex flex-col items-center justify-center space-y-5 overflow-hidden rounded-lg">
                  <div className="absolute left-0 top-0 w-full h-1/2 bg-gradient-to-b from-transparent via-brand/15 to-transparent animate-scanning pointer-events-none" />
                  <div className="w-12 h-12 border-4 border-brand/25 border-t-brand rounded-full animate-spin relative z-20" />
                  <div className="text-center relative z-20 space-y-1.5">
                    <p className="text-fg font-semibold text-base">Belgeleriniz inceleniyor…</p>
                    <p className="text-xs text-fg-soft">Bu birkaç saniye sürebilir; lütfen sayfayı kapatmayın.</p>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center border-b border-line pb-4">
                <div>
                  <h3 id="basvuru-modal-baslik" className="text-lg font-semibold text-fg tracking-tight">Belgelerinizle başvurun</h3>
                  <p className="text-xs text-fg-mute mt-0.5">
                    Pozisyon: <span className="text-fg-soft font-medium">{selectedJob.title}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  disabled={submitting}
                  aria-label="Pencereyi kapat"
                  className="text-fg-mute hover:text-fg text-xl p-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  &times;
                </button>
              </div>

              {submitSuccessData ? (
                <div className="space-y-5 py-2">
                  <div className="relative p-4 pr-20 bg-ok/10 border border-ok/30 rounded-md space-y-2 overflow-hidden">
                    {/* The seal lands: the application is now on record. */}
                    <SealMark
                      className="animate-stamp absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 opacity-80 pointer-events-none"
                      aria-hidden="true"
                    />
                    <p className="font-semibold text-base text-ok">
                      Başvurunuz alındı — <span className="tabular-nums">{submitSuccessData.extraSourcesCount}</span> kanıt kaynağı işlendi.{" "}
                      <span className="tabular-nums">(Başvuru No #{submitSuccessData.appId})</span>
                    </p>
                    <p className="text-xs text-fg-soft">
                      {submitSuccessData.aiResult?.review_status === "pending"
                        ? "Belgeniz incelemeye alındı; işverene gösterilmeden önce ekibimiz tarafından kontrol edilir. Sizin yapmanız gereken bir şey yok."
                        : submitSuccessData.extraSourcesCount > 0
                        ? "Belgeleriniz işverenin değerlendirme ekranına aktarıldı."
                        : // No source made it through — claiming the employer received
                          // documents here would contradict the failure notice below.
                          "Başvurunuz işverenin ekranına düştü; işlenen belge olmadığı için rapor şimdilik boş görünecek."}
                    </p>
                    {submitSuccessData.failedSources.length > 0 && (
                      <p className="text-xs text-warn border-t border-ok/20 pt-2">
                        Şu kaynaklar işlenemedi: {submitSuccessData.failedSources.join(", ")}. Başvurunuz geçerli; bu belgeleri profilinizden tekrar yükleyebilirsiniz.
                      </p>
                    )}
                  </div>

                  {submitSuccessData.aiResult && (
                    <div className="p-4 bg-well border border-line rounded-md space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-fg">Özgeçmiş değerlendirmesi</span>
                        <span
                          className={`badge uppercase tracking-wider ${
                            AI_STATUS_STYLES[submitSuccessData.aiResult.status] ??
                            "bg-raised text-fg-soft border-line-strong"
                          }`}
                        >
                          {AI_STATUS_LABELS[submitSuccessData.aiResult.status] ?? submitSuccessData.aiResult.status}
                        </span>
                      </div>
                      <p className="text-fg-soft leading-relaxed">{submitSuccessData.aiResult.reasoning}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-center gap-3 pt-2">
                    <Link
                      href={`/reports/${submitSuccessData.appId}`}
                      className="btn btn-brand text-xs px-5 py-2.5"
                    >
                      Raporumu ve kanıtlarımı gör
                      <span aria-hidden="true">&rarr;</span>
                    </Link>
                    <Link
                      href="/candidate/hub"
                      className="btn btn-quiet text-xs px-5 py-2.5"
                    >
                      Aday paneline git
                    </Link>
                  </div>
                </div>
              ) : !user?.email ? (
                <div className="space-y-4 py-2">
                  <div className="p-4 bg-brand/5 border border-brand/20 rounded-md text-sm text-fg-soft">
                    <p className="font-semibold text-fg mb-1">Başvurmak için giriş yapın</p>
                    <p className="text-xs leading-relaxed">
                      Belgelerinizin başvurunuza bağlanabilmesi için hesabınıza giriş yapmanız gerekiyor.
                      Hesabınız yoksa kayıt olmanız birkaç saniye sürer.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href="/login" className="btn btn-brand text-xs px-5 py-2.5">
                      Giriş Yap
                    </Link>
                    <Link href="/register" className="btn btn-quiet text-xs px-5 py-2.5">
                      Hesap Oluştur
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="space-y-5">
                  {formError && (
                    <div
                      ref={formErrorRef}
                      role="alert"
                      className="p-3 bg-err/10 border border-err/30 text-err text-xs rounded-md"
                    >
                      {formError}
                    </div>
                  )}
                  {/* Honesty note — the cross-check is real, so say it plainly, without shouting */}
                  <div className="p-4 bg-brand/5 border border-brand/20 rounded-md flex gap-3">
                    <IconHumanReview className="w-9 h-9 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-fg">Dürüstlük burada işe yarar</p>
                      <p className="text-xs text-fg-soft leading-relaxed">
                        Sunduğunuz özgeçmiş, profil ve bağlantılar birbirleriyle
                        çapraz kontrol edilir; tutarsızlıklar raporda görünür
                        olur. Lütfen yalnızca size ait, gerçek bilgileri ekleyin
                        — gerçek belgeniz, süslü cümleden her zaman daha
                        güçlüdür.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="basvuru-ad-soyad"
                      className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                    >
                      Adınız ve Soyadınız
                    </label>
                    <input
                      id="basvuru-ad-soyad"
                      type="text"
                      required
                      disabled={submitting}
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="Örn: Ayşe Yılmaz"
                      className="field"
                    />
                  </div>

                  {/* Main Resume Upload — a real button so keyboard users can
                      open the file picker too */}
                  <div>
                    <label
                      htmlFor="basvuru-belge"
                      className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                    >
                      Özgeçmiş, sertifika, ehliyet veya diploma
                    </label>
                    <input
                      ref={resumeInputRef}
                      type="file"
                      accept={DOCUMENT_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        const picked = e.target.files?.[0];
                        if (!picked) return;
                        // Fail here rather than after a 5 MB upload round-trip.
                        const problem = validateDocument(picked);
                        if (problem) {
                          setFormError(problem);
                          e.target.value = "";
                          return;
                        }
                        setFormError(null);
                        setResumeFile(picked);
                      }}
                    />
                    <button
                      id="basvuru-belge"
                      type="button"
                      disabled={submitting}
                      onClick={() => resumeInputRef.current?.click()}
                      className="w-full p-5 border-2 border-dashed border-line-strong hover:border-brand bg-well rounded-md text-center cursor-pointer transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {resumeFile ? (
                        <span className="block text-brand text-sm font-semibold">
                          {resumeFile.name}{" "}
                          <span className="text-fg-mute font-normal tabular-nums">
                            ({(resumeFile.size / 1024).toFixed(1)} KB)
                          </span>
                        </span>
                      ) : (
                        <span className="block text-fg-mute text-xs">
                          Dosyanızı seçmek için{" "}
                          <span className="text-brand underline underline-offset-2">tıklayın</span>{" "}
                          — {DOCUMENT_HINT}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Multi-Industry Evidence Boosters */}
                  <div className="p-4 bg-well border border-line rounded-md space-y-4">
                    <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                      <span className="text-xs font-semibold text-fg">
                        Başvuruyu güçlendiren belgeler (isteğe bağlı)
                      </span>
                      <span className="text-[10px] text-fg-mute">Doğrulanabilir belgeler değerlendirmeyi güçlendirir</span>
                    </div>

                    {/* LinkedIn URL Input */}
                    <div>
                      <label
                        htmlFor="basvuru-linkedin"
                        className="block text-[11px] font-semibold text-fg-soft mb-1"
                      >
                        LinkedIn / Profesyonel Profil Bağlantısı
                      </label>
                      <input
                        id="basvuru-linkedin"
                        type="url"
                        disabled={submitting}
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        placeholder="https://linkedin.com/in/aday-profil-adi"
                        className="field text-xs"
                      />
                    </div>

                    {/* Certificate / Driver License Link */}
                    <div>
                      <label
                        htmlFor="basvuru-sertifika"
                        className="block text-[11px] font-semibold text-fg-soft mb-1"
                      >
                        Sertifika / Ehliyet / Mesleki Belge Bağlantısı
                      </label>
                      <input
                        id="basvuru-sertifika"
                        type="url"
                        disabled={submitting}
                        value={certificateLink}
                        onChange={(e) => setCertificateLink(e.target.value)}
                        placeholder="https://drive.google.com/sertifikam-ehliyetim"
                        className="field text-xs"
                      />
                    </div>

                    {/* GitHub / Portfolio Link */}
                    <div>
                      <label
                        htmlFor="basvuru-portfoy"
                        className="block text-[11px] font-semibold text-fg-soft mb-1"
                      >
                        Portföy / Proje / GitHub Bağlantısı
                      </label>
                      <input
                        id="basvuru-portfoy"
                        type="url"
                        disabled={submitting}
                        value={githubUrl}
                        onChange={(e) => setGithubUrl(e.target.value)}
                        placeholder="https://portfoyum.com veya https://github.com/proje"
                        className="field text-xs"
                      />
                    </div>

                    {/* ChatGPT JSON Export Upload */}
                    <div>
                      <label
                        htmlFor="basvuru-json"
                        className="block text-[11px] font-semibold text-fg-soft mb-1"
                      >
                        ChatGPT Veri Dışa Aktarım Dosyası (.json)
                      </label>
                      <input
                        ref={jsonInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={(e) => {
                          const picked = e.target.files?.[0];
                          if (!picked) return;
                          // The file is read in full (then sliced to 4000 chars) before
                          // upload — a real multi-hundred-MB export would freeze a
                          // low-end browser with no feedback. Same ceiling as the
                          // resume upload.
                          if (picked.size > MAX_UPLOAD_BYTES) {
                            const mb = (picked.size / (1024 * 1024)).toFixed(1);
                            setFormError(`Dosya çok büyük (${mb} MB). En fazla 5 MB yükleyebilirsiniz.`);
                            e.target.value = "";
                            return;
                          }
                          if (picked.size === 0) {
                            setFormError("Dosya boş görünüyor. Lütfen başka bir dosya seçin.");
                            e.target.value = "";
                            return;
                          }
                          setFormError(null);
                          setChatgptJsonFile(picked);
                        }}
                      />
                      <button
                        id="basvuru-json"
                        type="button"
                        disabled={submitting}
                        onClick={() => jsonInputRef.current?.click()}
                        className="w-full py-2 px-3 bg-surface border border-line hover:border-brand/50 rounded-md text-xs text-fg-soft text-left transition-colors flex items-center justify-between gap-3 disabled:opacity-50"
                      >
                        <span className="truncate">{chatgptJsonFile ? chatgptJsonFile.name : "conversations.json dosyanızı yükleyin…"}</span>
                        <span className="text-[10px] text-brand font-semibold shrink-0">Gözat</span>
                      </button>
                    </div>
                  </div>

                  {/* Consent Gate Checkbox */}
                  <div className="p-4 bg-brand/5 border border-brand/20 rounded-md">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentVerified}
                        onChange={(e) => setConsentVerified(e.target.checked)}
                        className="mt-1 accent-[var(--brand)] w-4 h-4 shrink-0"
                      />
                      <span className="text-xs text-fg-soft leading-relaxed">
                        <strong className="text-fg">Belgelerimin incelenmesine onay veriyorum.</strong>{" "}
                        Yüklediğim belgeler bana aittir ve doğrudur. Başvurduğum ilan
                        kapsamında değerlendirilip sonucun işverenle paylaşılmasını kabul
                        ediyorum. Belgelerimin metni ve görüntüsü, değerlendirme için Google&apos;ın
                        yapay zeka servisine (yurt dışına) aktarılır.{" "}
                        <Link
                          href="/kvkk"
                          target="_blank"
                          className="text-brand underline underline-offset-2 hover:text-brand-strong transition-colors"
                        >
                          KVKK aydınlatma metni
                        </Link>
                      </span>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-line">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setSelectedJob(null)}
                      className="btn btn-quiet text-xs px-4 py-2.5"
                    >
                      İptal
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn btn-brand text-xs px-6 py-3"
                    >
                      {submitting ? "Belgeler inceleniyor…" : "Başvuruyu ve Belgeleri Gönder"}
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
