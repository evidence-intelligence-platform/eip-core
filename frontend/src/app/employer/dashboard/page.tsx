"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SELECTABLE_CATEGORIES } from "@/lib/categories";
import {
  getApplications,
  getMyJobs,
  createJob,
  updateJob,
  updateApplicationStatus,
  JobApplication,
  JobPosting,
  ProfessionCategory,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LedgerCheck, SealMark } from "@/components/illustrations";
import { BuildingIcon } from "@/components/CategoryIcon";
import Reveal from "@/components/Reveal";

export default function EmployerDashboard() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const isCandidate = user?.role === "candidate";

  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [jobFilter, setJobFilter] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  // Fetch (page-load) errors only — action failures render inline next to
  // the control that raised them (decisionErrors / jobToggleErrors /
  // jobFormError below), where the person who pressed the button can see them.
  const [error, setError] = useState<string | null>(null);
  // Accept/decline failures keyed by application id, shown inside the card
  // they belong to: the cards live in a scrollable panel far below the global
  // banner, so a top-of-page message went unseen (same idea as the
  // moderation panel's failedNotes map).
  const [decisionErrors, setDecisionErrors] = useState<Record<number, string>>({});
  // Close/republish failures keyed by posting id, same inline treatment.
  const [jobToggleErrors, setJobToggleErrors] = useState<Record<number, string>>({});
  // Publish-form failures — rendered next to jobSuccess inside the form card.
  const [jobFormError, setJobFormError] = useState<string | null>(null);
  // Application ids with an accept/decline PATCH currently in flight — used
  // to disable just that card's buttons instead of the whole list.
  const [decidingIds, setDecidingIds] = useState<Set<number>>(new Set());
  // Job ids with a status-change PATCH currently in flight.
  const [updatingJobIds, setUpdatingJobIds] = useState<Set<number>>(new Set());
  // Accept/decline is irreversible, so the decision buttons are swapped for
  // an in-place "emin misiniz?" panel (themed, not window.confirm) before the
  // PATCH actually fires. Holds which application + which decision.
  const [pendingAppDecision, setPendingAppDecision] = useState<{
    id: number;
    status: "accepted" | "declined";
  } | null>(null);
  // Optional message the employer attaches to that decision. It travels with
  // the PATCH into the candidate's decision e-mail and is kept only in the
  // audit log: the API never returns it and it is not stored on the
  // application row, so this state is the single copy and nothing can show it
  // again afterwards. Cleared with the panel so one decision's words can never
  // ride along with the next one.
  const [decisionNote, setDecisionNote] = useState("");
  // Same in-place confirm pattern for closing/reopening a posting.
  const [pendingJobToggle, setPendingJobToggle] = useState<number | null>(null);

  // New Job Form State
  const [jobTitle, setJobTitle] = useState("");
  // Seeded empty: on a hard load `user` is still null here, and a dummy
  // default would get published verbatim on the public /jobs cards. The
  // effect below suggests a name from the account once auth resolves.
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState<string>("OTHER");
  const [description, setDescription] = useState("");
  const [submittingJob, setSubmittingJob] = useState(false);
  const [jobSuccess, setJobSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      // The inline action errors are cleared with the global one: they are
      // verdicts on rows that are about to be replaced by fresh server state,
      // so keeping them would leave a stale red notice inside a card whose own
      // badge now says the opposite (e.g. a 409 warning under "Kabul edildi").
      setDecisionErrors({});
      setJobToggleErrors({});
      // Jobs are fetched alongside applications so each application card can
      // show which posting it belongs to, and so the employer can see their
      // own postings (including drafts/closed) below the creation form.
      // getMyJobs() is ownership-scoped server-side, unlike the public,
      // active-only GET /jobs.
      const [appsData, jobsData] = await Promise.all([getApplications(), getMyJobs()]);
      setApplications(appsData);
      setJobs(jobsData);
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

  // Auth guard: a signed-out visitor is sent to login instead of being shown
  // the full employer workspace over a bare 401 banner. Candidates keep their
  // own in-place notice below rather than a redirect. Same pattern as
  // admin/moderation's role guard.
  //
  // Gated on the *token*, not on `user`: AuthContext deliberately keeps a
  // token whose getMe failed with a 5xx or a network drop (only a 401/403
  // verdict ends the session), leaving user null with a still-valid session.
  // Redirecting there would turn a brief engine outage into a forced re-login
  // — exactly what AuthContext is holding the token to prevent. That case
  // falls through to the retry card below instead.
  useEffect(() => {
    if (!authLoading && !user && !token) {
      router.replace("/login");
    }
  }, [authLoading, user, token, router]);

  useEffect(() => {
    // AuthProvider restores the bearer token in its own mount effect, which
    // runs *after* this one; fetching while it is still loading would fire
    // the requests without an Authorization header and 401.
    if (authLoading) return;
    if (!user) {
      // Logging out while the page is open must not leave the previously
      // fetched applications and postings on screen.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale data on logout is the sync point itself
      setApplications([]);
      setJobs([]);
      setLoading(false);
      return;
    }
    if (isCandidate) {
      // GET /jobs/mine is require_employer-gated, so a candidate's fetch is a
      // guaranteed 403 whose error would never be seen anyway — the role-guard
      // card returns before the banner renders. Closing `loading` here keeps
      // the skeletons from spinning forever behind that card.
      setLoading(false);
      return;
    }
    fetchData();
  }, [authLoading, user, isCandidate]);

  // Suggest a company name from the account e-mail once auth resolves,
  // but never overwrite something the employer already typed.
  useEffect(() => {
    if (user?.email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deriving a one-time default from `user` is the sync point itself, guarded by the prev-value check above
      setCompanyName((prev) => prev || user.email.split("@")[0] + " Şirketi");
    }
  }, [user]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle || !companyName || !description) return;

    try {
      setSubmittingJob(true);
      setJobSuccess(null);
      setJobFormError(null);
      await createJob({
        title: jobTitle,
        company_name: companyName,
        category: category,
        description: description,
        status: "active",
      });
      setJobSuccess("İlanınız yayında. Adaylar artık başvurabilir.");
      setJobTitle("");
      setDescription("");
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setJobFormError(err.message);
      } else {
        setJobFormError("İlan yayınlanamadı.");
      }
    } finally {
      setSubmittingJob(false);
    }
  };

  // The backend treats this decision as irreversible (409 once already
  // accepted/declined) — the card swaps to a themed "emin misiniz?" panel
  // (see pendingAppDecision) instead of firing the PATCH right away.
  const requestUpdateStatus = (appId: number, newStatus: "accepted" | "declined") => {
    // Guard against a double-click firing a second PATCH while one is
    // already in flight.
    if (decidingIds.has(appId)) return;
    setDecisionNote("");
    setPendingAppDecision({ id: appId, status: newStatus });
  };

  const cancelAppDecision = () => {
    setPendingAppDecision(null);
    setDecisionNote("");
  };

  const handleUpdateStatus = async (
    appId: number,
    newStatus: "accepted" | "declined",
    // Read from state at the call site rather than here, because the panel
    // (and with it the note) is cleared before the request goes out.
    note?: string
  ) => {
    setPendingAppDecision(null);
    setDecisionNote("");
    if (decidingIds.has(appId)) return;

    setDecidingIds((prev) => new Set(prev).add(appId));
    setDecisionErrors((prev) => {
      const next = { ...prev };
      delete next[appId];
      return next;
    });
    try {
      const updated = await updateApplicationStatus(appId, newStatus, note);
      // Update just this card in place — a full refetch would blank the
      // whole scrollable panel and reset scroll position on every decision.
      setApplications((cur) => cur.map((a) => (a.id === appId ? { ...a, ...updated } : a)));
    } catch (err: unknown) {
      // The message never contained "409" — the status lives on ApiError.
      let message: string;
      if (err instanceof ApiError && err.status === 409) {
        message = "Bu başvurunun durumu daha önce değiştirilmiş. Lütfen sayfayı yenileyin.";
      } else if (err instanceof Error) {
        message = err.message;
      } else {
        message = "Başvuru durumu güncellenemedi.";
      }
      setDecisionErrors((prev) => ({ ...prev, [appId]: message }));
    } finally {
      setDecidingIds((prev) => {
        const next = new Set(prev);
        next.delete(appId);
        return next;
      });
    }
  };

  const requestToggleJobStatus = (job: JobPosting) => {
    if (!job.id || updatingJobIds.has(job.id)) return;
    setPendingJobToggle(job.id);
  };

  const handleToggleJobStatus = async (job: JobPosting) => {
    setPendingJobToggle(null);
    if (!job.id || updatingJobIds.has(job.id)) return;
    const closing = job.status === "active";

    setUpdatingJobIds((prev) => new Set(prev).add(job.id!));
    setJobToggleErrors((prev) => {
      const next = { ...prev };
      delete next[job.id!];
      return next;
    });
    try {
      const updated = await updateJob(job.id, { status: closing ? "closed" : "active" });
      setJobs((cur) => cur.map((j) => (j.id === job.id ? { ...j, ...updated } : j)));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "İlan güncellenemedi.";
      setJobToggleErrors((prev) => ({ ...prev, [job.id!]: message }));
    } finally {
      setUpdatingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id!);
        return next;
      });
    }
  };

  // job_id -> title lookup so each application card can show which posting
  // it belongs to, instead of only the application id.
  const jobTitleById = new Map<number, string>();
  jobs.forEach((j) => {
    if (j.id !== undefined) jobTitleById.set(j.id, j.title);
  });
  const jobTitleFor = (jobId: number) => jobTitleById.get(jobId) || `İlan #${jobId}`;

  // Distinct postings that actually have applications, for the filter
  // dropdown — built from applications rather than `jobs` so it still works
  // for a posting that no longer appears in the (active-only) jobs list.
  const jobOptions = Array.from(new Set(applications.map((a) => a.job_id))).map((id) => ({
    id,
    title: jobTitleFor(id),
  }));

  const visibleApplications =
    jobFilter === "all" ? applications : applications.filter((a) => a.job_id === jobFilter);

  // The employer's own postings, including drafts/closed — getMyJobs() is
  // already scoped server-side to the authenticated account.
  const myJobs = jobs;

  // Role Guard Notice if a Candidate accidentally lands here
  if (isCandidate) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="card p-8 space-y-4">
          <LedgerCheck className="w-28 h-auto mx-auto" />
          <h1 className="text-2xl font-semibold text-fg tracking-tight">İşveren Paneli</h1>
          <p className="text-sm text-fg-soft leading-relaxed">
            Bu alan işverenlerin yeni iş ilanları yayınladığı ve gelen
            başvuruları değerlendirdiği yönetim panelidir. Aday paneline geçmek
            için aşağıdaki bağlantıyı kullanabilirsiniz.
          </p>
          <div className="pt-2 flex justify-center">
            <Link href="/candidate/hub" className="btn btn-brand btn-shine text-xs">
              Aday Paneline Git
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // While auth resolves (or a signed-out visitor is being redirected), show a
  // quiet holding state instead of flashing the full employer workspace —
  // same pattern as the moderation panel. The middle case is a live session
  // whose profile read failed on something other than a 401/403: no redirect
  // fires for it, so it needs a way out of its own.
  if (authLoading || !user) {
    const profileUnreadable = !authLoading && !!token;
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="card p-8 space-y-4">
          <SealMark className="w-12 h-12 mx-auto" />
          <h1 className="text-2xl font-semibold text-fg tracking-tight">İşveren Paneli</h1>
          <p className="text-sm text-fg-soft leading-relaxed">
            {authLoading
              ? "Hesap bilgileriniz doğrulanıyor…"
              : profileUnreadable
              ? "Oturumunuz açık, ancak hesap bilgileriniz şu anda alınamadı. Bağlantı yeniden kurulduğunda tekrar deneyebilirsiniz."
              : "Bu alan için giriş yapmanız gerekiyor. Giriş sayfasına yönlendiriliyorsunuz."}
          </p>
          {profileUnreadable && (
            <div className="pt-2 flex justify-center">
              {/* AuthContext reads the profile only in its mount effect and
                  exposes no way to re-run it, so a reload is the retry. */}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn btn-brand btn-shine"
              >
                Tekrar dene
              </button>
            </div>
          )}
        </div>
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
          <p className="eyebrow">İşveren Paneli</p>
          <h1 className="text-title text-fg">İlanlar ve başvurular</h1>
          <p className="text-fg-mute text-sm">
            Giriş yapan:{" "}
            <span className="font-medium text-fg-soft">
              {user?.email || "İşveren Kullanıcı"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/candidates" className="btn btn-quiet text-xs px-4 py-2.5">
            Aday Havuzu &amp; Raporlar
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

      {/* Quiet guidance */}
      <Reveal stagger className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            t: "Nitelikleri net yazın",
            b: "İlanda aradığınız deneyim ve sertifikaları açıkça belirtin; adayların belgeleri bu kriterlerle karşılaştırılır.",
          },
          {
            t: "Gerekçeli raporu inceleyin",
            b: "Her adayın raporunda hangi yeterliliğin hangi belgeye dayandığı madde madde yazar.",
          },
          {
            t: "Kararı siz verin",
            b: "Rapor bir öneridir, hüküm değil. Başvuruyu kabul veya reddetmek her zaman sizin elinizde.",
          },
        ].map((tip, i) => (
          <div key={tip.t} className="card card-hover p-4 flex gap-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-brand/40 text-brand text-xs font-semibold tabular-nums shrink-0">
              {i + 1}
            </span>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-fg">{tip.t}</p>
              <p className="text-xs text-fg-mute leading-relaxed">{tip.b}</p>
            </div>
          </div>
        ))}
      </Reveal>

      {/* Main Employer Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Create New Job Posting Section (3 Cols) */}
        <Reveal as="div" className="lg:col-span-3 space-y-6">
          <div className="card p-7 space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-lg font-semibold text-fg tracking-tight">
                Yeni İş İlanı Yayınla
              </h2>
              <span className="badge bg-ok/10 text-ok border-ok/30 uppercase tracking-wider">
                Anında yayında
              </span>
            </div>

            {jobSuccess && (
              <div
                role="status"
                className="relative p-3.5 pr-16 bg-ok/10 border border-ok/30 text-ok text-xs rounded-md font-medium overflow-hidden"
              >
                {/* Publishing a job is the employer's equivalent of a
                    candidate's successful application — same brass seal. */}
                <SealMark className="animate-stamp absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 opacity-80 pointer-events-none" />
                {jobSuccess}
              </div>
            )}

            {jobFormError && (
              <div role="alert" className="p-3 bg-err/10 border border-err/30 text-err text-xs rounded-md">
                {jobFormError}
              </div>
            )}

            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <span className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5">
                  Şirket / Kurum
                </span>
                {/* The posting is published under the REGISTERED company — a
                    single, verifiable identity, not a name retyped each time. */}
                <div className="flex items-center gap-2 field text-xs !bg-well/60 cursor-not-allowed">
                  <BuildingIcon className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-fg font-medium truncate">
                    {user?.company_name || companyName || "Kayıtlı şirket"}
                  </span>
                  <span className="ml-auto badge bg-ok/10 text-ok border-ok/25 !text-[10px] shrink-0">
                    Vergi no ile kayıtlı
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-fg-mute">
                  İlanlar kayıtlı şirketiniz adına yayınlanır.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="ilan-baslik"
                    className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                  >
                    Pozisyon Başlığı
                  </label>
                  <input
                    id="ilan-baslik"
                    type="text"
                    required
                    disabled={submittingJob}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Örn: Kıdemli Uzman Doktor / Makam Şoförü"
                    className="field text-xs"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ilan-sektor"
                    className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                  >
                    Meslek Sektörü
                  </label>
                  <select
                    id="ilan-sektor"
                    value={category}
                    disabled={submittingJob}
                    onChange={(e) => setCategory(e.target.value as ProfessionCategory)}
                    className="field text-xs"
                  >
                    {SELECTABLE_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ilan-tanim"
                  className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                >
                  İlan Tanımı &amp; Aranan Nitelikler
                </label>
                <textarea
                  id="ilan-tanim"
                  required
                  rows={5}
                  disabled={submittingJob}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Pozisyonun detaylarını, aranan sertifikaları, çalışma şartlarını ve beklentilerinizi ayrıntılı yazın…"
                  className="field text-xs leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={submittingJob}
                className="btn btn-brand btn-shine w-full text-xs"
              >
                {submittingJob ? "İlan yayınlanıyor…" : "İlanı Yayınla"}
              </button>
            </form>
          </div>

          {/* Employer's own postings, including drafts/closed. A posting can
              be closed here to stop new applications once a role is filled. */}
          <div className="card p-7 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-semibold text-fg tracking-tight">
                İlanlarım
              </h2>
              <span className="badge bg-raised text-fg-soft border-line-strong tabular-nums">
                {myJobs.length} ilan
              </span>
            </div>
            {loading ? (
              // Skeleton rows shaped like the real posting rows below, so the
              // panel doesn't pop in around a bare loading sentence.
              <div className="space-y-2" role="status" aria-label="İlanlar yükleniyor" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 bg-well border border-line rounded-md px-3.5 py-2.5"
                  >
                    <div className="skeleton h-3.5 w-2/5" />
                    <div className="skeleton h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : myJobs.length === 0 ? (
              <div className="text-center py-4 space-y-2">
                <BuildingIcon className="w-10 h-10 mx-auto text-fg-mute opacity-60" />
                <p className="text-xs text-fg-mute">
                  Henüz yayınlanmış bir ilanınız yok. Yukarıdaki formla ilk ilanınızı oluşturabilirsiniz.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {myJobs.map((j) => {
                  const isActive = j.status === "active";
                  const isUpdating = j.id !== undefined && updatingJobIds.has(j.id);
                  const isConfirming = j.id !== undefined && pendingJobToggle === j.id;
                  return (
                    <div
                      key={j.id}
                      className="bg-well border border-line rounded-md card-hover overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <span className="text-xs font-medium text-fg truncate">{j.title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={
                              isActive
                                ? "badge bg-ok/10 text-ok border-ok/30 !text-[10px]"
                                : "badge bg-raised text-fg-mute border-line-strong !text-[10px]"
                            }
                          >
                            {isActive ? "Yayında" : j.status === "closed" ? "Kapalı" : "Taslak"}
                          </span>
                          <button
                            type="button"
                            onClick={() => requestToggleJobStatus(j)}
                            disabled={isUpdating}
                            className="btn btn-quiet btn-sm"
                          >
                            {isUpdating ? "…" : isActive ? "Kapat" : "Yeniden yayınla"}
                          </button>
                        </div>
                      </div>
                      {/* Close/republish failure, shown inside the row the
                          action belongs to — the global banner is reserved
                          for page-load errors. */}
                      {j.id !== undefined && jobToggleErrors[j.id] && (
                        <div
                          role="alert"
                          className="px-3.5 py-2 border-t border-err/30 bg-err/5 text-err text-[11px] leading-relaxed"
                        >
                          {jobToggleErrors[j.id]}
                        </div>
                      )}
                      {/* Themed in-place confirm — replaces the bare
                          window.confirm() dialog that used to gate this
                          irreversible decision. */}
                      {isConfirming && (
                        <div
                          className={`px-3.5 py-2.5 border-t space-y-2 ${
                            isActive ? "bg-err/5 border-err/30" : "bg-ok/5 border-ok/30"
                          }`}
                        >
                          <p className={`text-[11px] leading-relaxed ${isActive ? "text-err" : "text-ok"}`}>
                            {isActive
                              ? "Bu ilanı kapatmak istediğinize emin misiniz? Kapatılan ilanlara yeni başvuru yapılamaz."
                              : "Bu ilanı tekrar yayına almak istediğinize emin misiniz?"}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPendingJobToggle(null)}
                              className="btn btn-quiet flex-1 text-[11px] py-1.5"
                            >
                              Vazgeç
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleJobStatus(j)}
                              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold border transition-colors ${
                                isActive
                                  ? "bg-err/10 hover:bg-err/20 border-err/30 text-err"
                                  : "bg-ok/10 hover:bg-ok/20 border-ok/30 text-ok"
                              }`}
                            >
                              {isActive ? "Evet, Kapat" : "Evet, Yayınla"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Reveal>

        {/* Active Applications Review & Approval Panel (2 Cols) */}
        <Reveal as="div" className="lg:col-span-2 space-y-6">
          <div className="card p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-semibold text-fg tracking-tight">
                Gelen Başvurular
              </h2>
              <span className="badge bg-raised text-fg-soft border-line-strong tabular-nums">
                {visibleApplications.length} başvuru
              </span>
            </div>

            {jobOptions.length > 1 && (
              <div>
                <label
                  htmlFor="basvuru-ilan-filtre"
                  className="block text-[11px] font-semibold text-fg-mute uppercase tracking-wider mb-1.5"
                >
                  Pozisyona göre filtrele
                </label>
                <select
                  id="basvuru-ilan-filtre"
                  value={jobFilter}
                  onChange={(e) =>
                    setJobFilter(e.target.value === "all" ? "all" : Number(e.target.value))
                  }
                  className="field text-xs"
                >
                  <option value="all">Tüm ilanlar</option>
                  {jobOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {loading ? (
              // Skeleton cards shaped like the real application cards below,
              // so the panel holds its shape instead of a bare loading line.
              <div className="space-y-4" role="status" aria-label="Başvurular yükleniyor" aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className="card bg-well p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="skeleton h-3.5 w-20" />
                      <div className="skeleton h-5 w-24 rounded-full" />
                    </div>
                    <div className="skeleton h-3 w-2/5" />
                    <div className="skeleton h-3 w-3/5" />
                    <div className="flex items-center gap-2 pt-2 border-t border-line">
                      <div className="skeleton h-7 flex-1 rounded-md" />
                      <div className="skeleton h-7 flex-1 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleApplications.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <LedgerCheck className="w-10 h-10 mx-auto opacity-60" />
                <p className="text-xs text-fg-mute">
                  {applications.length === 0
                    ? "Henüz ilanlarınıza başvuran aday bulunmuyor."
                    : "Bu ilana ait başvuru bulunmuyor."}
                </p>
                <p className="text-[11px] text-fg-mute">
                  Adaylar başvurdukça burada listelenecek.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {visibleApplications.map((app) => (
                  <div key={app.id} className="card card-lift bg-well p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-fg tabular-nums">
                        Başvuru #{app.id}
                      </span>
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

                    {/* Which posting this application belongs to — without this
                        an employer with more than one active listing cannot
                        tell what they are accepting or declining. */}
                    <p className="text-[11px] text-fg-mute -mt-2">
                      Pozisyon:{" "}
                      <span className="text-fg-soft font-medium">{jobTitleFor(app.job_id)}</span>
                    </p>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center gap-3 text-xs">
                        {/* The name and identity now come from the API; building
                            "cand_{id}" here pointed at a record that never existed. */}
                        <span className="text-fg-soft font-medium truncate">
                          {app.candidate_name || `Aday #${app.candidate_id}`}
                        </span>
                        {/* The report belongs to the application, not the person:
                            linking by candidate showed the same document for
                            every posting the same applicant had applied to. */}
                        {app.id !== undefined ? (
                          <Link
                            href={`/reports/${app.id}`}
                            className="text-brand hover:text-brand-strong hover:underline font-semibold shrink-0 transition-colors"
                          >
                            Raporu incele &rarr;
                          </Link>
                        ) : (
                          <span className="text-fg-mute shrink-0">Rapor hazır değil</span>
                        )}
                      </div>

                      {/* AI standout signals — the recruiter reads the highlight
                          before opening the full report. Styled and labelled
                          distinctly from the ok/green "Kabul edildi" badge so
                          it reads as an AI suggestion to check, not a
                          completed human verification. */}
                      {app.standout_traits && app.standout_traits.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wider text-brand/80 font-semibold">
                            Yapay zekâ: öne çıkan
                          </span>
                          {app.standout_traits.map((t) => (
                            <span
                              key={t}
                              className="badge bg-brand/10 text-brand border-brand/25 !text-[10px] !py-0.5"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Accept/decline failure, shown right above the buttons
                        that raised it — the global banner scrolls out of view
                        behind this panel's own scrollbar. */}
                    {app.id !== undefined && decisionErrors[app.id] && (
                      <div
                        role="alert"
                        className="p-2.5 bg-err/10 border border-err/30 text-err text-[11px] leading-relaxed rounded-md"
                      >
                        {decisionErrors[app.id]}
                      </div>
                    )}

                    {/* Status Update Buttons */}
                    {/* "pending" is not a status the backend ever produces —
                        new applications default to "submitted". */}
                    {["submitted", "pending", "reviewing"].includes(app.status) &&
                      // Gated on the backend's ownership signal, not status
                      // alone: employers also see applications into ownerless
                      // (pre-ownership) postings, and deciding those always
                      // 403s — showing the buttons was a dead-end.
                      (app.decidable !== false ? (
                        pendingAppDecision && pendingAppDecision.id === app.id ? (
                          // Themed in-place confirm — replaces the bare
                          // window.confirm() dialog that used to gate this
                          // irreversible decision.
                          <div className="pt-2 border-t border-line">
                            <div
                              className={`rounded-md border p-3 space-y-2 ${
                                pendingAppDecision.status === "accepted"
                                  ? "bg-ok/5 border-ok/30"
                                  : "bg-err/5 border-err/30"
                              }`}
                            >
                              <p
                                className={`text-[11px] leading-relaxed ${
                                  pendingAppDecision.status === "accepted" ? "text-ok" : "text-err"
                                }`}
                              >
                                {pendingAppDecision.status === "accepted"
                                  ? "Bu başvuruyu kabul etmek istediğinize emin misiniz? Bu karar daha sonra geri alınamaz."
                                  : "Bu başvuruyu reddetmek istediğinize emin misiniz? Bu karar daha sonra geri alınamaz."}
                              </p>
                              {/* The note leaves the platform: it is quoted in
                                  the candidate's decision e-mail, so the
                                  helper text below says so before anything is
                                  typed. 2000 is the backend's own limit. */}
                              <div>
                                <label
                                  htmlFor={`karar-notu-${app.id}`}
                                  className="block text-[11px] font-semibold text-fg-soft mb-1"
                                >
                                  Adaya not (opsiyonel)
                                </label>
                                <textarea
                                  id={`karar-notu-${app.id}`}
                                  rows={3}
                                  maxLength={2000}
                                  value={decisionNote}
                                  disabled={decidingIds.has(app.id!)}
                                  onChange={(e) => setDecisionNote(e.target.value)}
                                  aria-describedby={`karar-notu-aciklama-${app.id}`}
                                  placeholder={
                                    pendingAppDecision.status === "accepted"
                                      ? "Örn: Görüşme için en kısa sürede sizinle iletişime geçeceğiz."
                                      : "Örn: Bu pozisyonda aradığımız saha deneyimi eksik kaldı; diğer ilanlarımıza başvurabilirsiniz."
                                  }
                                  className="field field-sm leading-relaxed"
                                />
                                <p
                                  id={`karar-notu-aciklama-${app.id}`}
                                  className="mt-1 text-[10px] text-fg-mute leading-relaxed"
                                >
                                  Bu not, karar e-postasıyla adaya olduğu gibi iletilir. Gönderdikten
                                  sonra bu ekranda tekrar görüntülenemez. En fazla 2000 karakter.
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={decidingIds.has(app.id!)}
                                  onClick={cancelAppDecision}
                                  className="btn btn-quiet flex-1 text-[11px] py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Vazgeç
                                </button>
                                <button
                                  type="button"
                                  disabled={decidingIds.has(app.id!)}
                                  onClick={() =>
                                    handleUpdateStatus(app.id!, pendingAppDecision.status, decisionNote)
                                  }
                                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                    pendingAppDecision.status === "accepted"
                                      ? "bg-ok/10 hover:bg-ok/20 border-ok/30 text-ok"
                                      : "bg-err/10 hover:bg-err/20 border-err/30 text-err"
                                  }`}
                                >
                                  {decidingIds.has(app.id!)
                                    ? "Kaydediliyor…"
                                    : pendingAppDecision.status === "accepted"
                                    ? "Evet, Kabul Et"
                                    : "Evet, Reddet"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pt-2 border-t border-line">
                            <button
                              onClick={() => requestUpdateStatus(app.id!, "accepted")}
                              disabled={decidingIds.has(app.id!)}
                              className="flex-1 py-1.5 bg-ok/10 hover:bg-ok/20 border border-ok/30 text-ok rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {decidingIds.has(app.id!) ? "Kaydediliyor…" : "Kabul Et"}
                            </button>
                            <button
                              onClick={() => requestUpdateStatus(app.id!, "declined")}
                              disabled={decidingIds.has(app.id!)}
                              className="flex-1 py-1.5 bg-err/10 hover:bg-err/20 border border-err/30 text-err rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {decidingIds.has(app.id!) ? "Kaydediliyor…" : "Reddet"}
                            </button>
                          </div>
                        )
                      ) : (
                        <p className="pt-2 border-t border-line text-[11px] text-fg-mute leading-relaxed">
                          Bu ilanın kayıtlı bir işvereni olmadığından başvuruyu
                          yalnızca sistem yöneticisi karara bağlayabilir.
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
