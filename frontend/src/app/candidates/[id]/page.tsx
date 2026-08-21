"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { getReportData, getJobs, ReportData, JobPosting } from "@/lib/api";
import { requirementLabel } from "@/lib/labels";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";

const AI_STATUS_LABELS: Record<string, string> = {
  VERIFIED: "Doğrulandı",
  "INSUFFICIENT EVIDENCE": "Yetersiz Kanıt",
  CONTRADICTION: "Çelişki",
};

// Human review outcome. Employers only ever receive approved rows; the
// owning candidate also sees pending/rejected ones, so those states must
// be visible instead of wearing the plain AI badge.
const REVIEW_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "İncelemede", className: "bg-warn/10 text-warn border-warn/30" },
  rejected: { label: "Reddedildi", className: "bg-err/10 text-err border-err/30" },
};

/** Animated brass score ring — sweeps from empty to the measured value once.
    Same SVG structure and ring-sweep keyframe as reports/[id]/page.tsx's
    ScoreRing, kept local here since components/** is out of scope. */
function ScoreRing({ score }: { score: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.min(Math.max(score, 0), 100) / 100);
  return (
    <div className="relative w-28 h-28 shrink-0" role="img" aria-label={`Doğrulama skoru yüzde ${score}`}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{
            ["--ring-circumference" as unknown as string]: `${C}`,
            animation: "ring-sweep 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-semibold text-brand tabular-nums">%{score}</span>
      </div>
    </div>
  );
}

const REVIEW_NOTES: Record<string, { className: string; text: string }> = {
  pending: {
    className: "bg-warn/10 border-warn/30 text-warn",
    text: "Bu belge ekibimiz tarafından kontrol ediliyor; onaylanana kadar işverene gösterilmez ve skora katılmaz.",
  },
  rejected: {
    className: "bg-err/10 border-err/30 text-err",
    text: "Bu belge, ekibimizin incelemesi sonucunda onaylanmadı; işverene gösterilmiyor ve skora katılmıyor. Daha net bir kopya yükleyerek yeniden deneyebilirsiniz.",
  },
};

export default function CandidateProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const candidateId = resolvedParams.id;
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<ReportData | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Defined outside the effect so the error screen's "Tekrar dene" button can
  // re-run it — same pattern as reports/[id]'s fetchReport.
  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      // Jobs are only needed to turn a req_job_<id> into a readable title
      // below; a failure to load them should not block the report itself.
      const [rep, jobsList] = await Promise.all([
        getReportData(candidateId),
        getJobs().catch(() => [] as JobPosting[]),
      ]);
      setData(rep);
      setJobs(jobsList);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Profil yüklenemedi.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // AuthProvider restores the bearer token in its own mount effect, which
    // runs *after* this one; fetching while it is still loading would fire
    // the request without an Authorization header and 401.
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/id-change, the standard data-load pattern used throughout this app
    fetchProfile();
  }, [authLoading, candidateId]);

  // Resolves the internal requirement id into what the evidence was actually
  // evaluated against, the same way the candidate hub already turns a bare
  // job_id into a real job title for the applications list — a non-technical
  // reader should never have to decode "req_job_42" themselves. An active
  // posting's real title beats the shared helper's generic "İlan gereksinimi
  // (#N)" fallback; the helper also covers every req_general_* id.
  const getRequirementLabel = (reqId: string): string => {
    const jobMatch = /^req_job_(\d+)$/.exec(reqId);
    if (jobMatch) {
      const job = jobs.find((j) => String(j.id) === jobMatch[1]);
      if (job) return job.title;
    }
    return requirementLabel(reqId);
  };

  // Same back link in every branch — a stale link, a 403/404, or a slow
  // network must not strand the reader with no way forward but the browser
  // back button. Candidates viewing their own profile are sent back to their
  // hub, not to the employer-only pool that would 403 them.
  const isCandidateViewer = user?.role === "candidate";
  const backLink = (
    <div>
      <Link
        href={isCandidateViewer ? "/candidate/hub" : "/candidates"}
        className="text-xs text-fg-mute hover:text-fg font-semibold flex items-center gap-1 transition-colors"
      >
        &larr; {isCandidateViewer ? "Aday Paneline Dön" : "Aday Havuzuna Dön"}
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8" role="status" aria-label="Aday profili yükleniyor" aria-busy="true">
        {backLink}
        {/* Skeleton mirrors the shape the page settles into — profile header
            (avatar circle, name lines, score box) plus a couple of evidence
            rows — instead of collapsing to a bare centered sentence. */}
        <div className="card p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="skeleton w-14 h-14 rounded-lg shrink-0" />
              <div className="space-y-2">
                <div className="skeleton h-6 w-48" />
                <div className="skeleton h-3 w-28" />
              </div>
            </div>
            <div className="skeleton w-[140px] h-[148px] rounded-md" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="skeleton h-6 w-64" />
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="card p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="skeleton h-5 w-40" />
                  <div className="skeleton h-4 w-20 rounded-full" />
                </div>
                <div className="skeleton h-3.5 w-full" />
                <div className="skeleton h-3.5 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
        {backLink}
        <div role="alert" className="max-w-md mx-auto my-12 p-6 bg-err/10 border border-err/30 text-err text-sm rounded-md text-center space-y-4">
          <p>{error || "Aday profili bulunamadı."}</p>
          {/* Same retry affordance as reports/[id] — a transient failure must
              not leave the browser back button as the only way forward. */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={fetchProfile}
              className="px-3 py-1.5 bg-err/10 hover:bg-err/20 border border-err/30 text-err rounded-md text-xs font-semibold transition-colors"
            >
              Tekrar dene
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { candidate, evidences, summary } = data;

  return (
    <div className="relative space-y-8 max-w-4xl mx-auto py-8 px-4">
      {/* Same quiet brand tint the landing, jobs and candidate-hub pages open with */}
      <div
        className="absolute inset-x-0 top-0 h-[20rem] -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 70% at 50% 0%, color-mix(in oklab, var(--brand) 6%, transparent), transparent 70%)",
        }}
        aria-hidden="true"
      />
      {backLink}

      {/* Profile Header Card */}
      <div className="card p-8 space-y-6 relative overflow-hidden">
        <SealMark className="absolute -right-8 -top-8 w-40 h-40 opacity-[0.06] pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-lg bg-brand/10 border border-brand/30 flex items-center justify-center text-brand font-semibold text-2xl"
                aria-hidden="true"
              >
                {candidate.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-fg tracking-tight text-balance">{candidate.name}</h1>
                <p className="text-xs font-mono text-fg-mute">{candidate.external_id}</p>
              </div>
            </div>
            <p className="text-xs text-fg-soft pt-1">
              Belgeye dayalı aday profili — her sonuç, gerekçesiyle birlikte.
            </p>
          </div>

          <div className="p-4 bg-well border border-line rounded-md flex flex-col items-center gap-1 min-w-[140px]">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-fg-mute block">Doğrulama Skoru</span>
            <ScoreRing score={summary.score} />
            <span className="text-[10px] text-fg-mute block tabular-nums">{summary.verified} / {summary.total} kanıt doğrulandı</span>
          </div>
        </div>
      </div>

      {/* Verified Evidences Timeline */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg tracking-tight text-balance">
            Değerlendirilmiş Mesleki Kanıtlar
          </h2>
          <span className="badge bg-raised text-fg-soft border-line-strong tabular-nums">
            {evidences.length} kanıt
          </span>
        </div>

        {evidences.length === 0 ? (
          <div className="card p-8 text-center text-fg-soft text-sm">
            Bu aday için henüz kayıtlı bir kanıt bulunamadı.
          </div>
        ) : (
          <div className="space-y-4">
            {evidences.map((ev) => (
              <div
                key={ev.id}
                className={`card card-lift p-6 space-y-3 border-l-2 ${
                  ev.status === "VERIFIED"
                    ? "border-l-ok/60"
                    : ev.status === "CONTRADICTION"
                    ? "border-l-err/60"
                    : "border-l-warn/60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-sm bg-well text-fg-soft border border-line">
                    {getRequirementLabel(ev.requirement_external_id)}
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span
                      className={`badge uppercase tracking-wider ${
                        ev.status === "VERIFIED"
                          ? "bg-ok/10 text-ok border-ok/30"
                          : ev.status === "CONTRADICTION"
                          ? "bg-err/10 text-err border-err/30"
                          : "bg-warn/10 text-warn border-warn/30"
                      }`}
                    >
                      {AI_STATUS_LABELS[ev.status] ?? ev.status}
                    </span>
                    {ev.review_status && REVIEW_BADGES[ev.review_status] && (
                      <span
                        className={`badge uppercase tracking-wider ${REVIEW_BADGES[ev.review_status].className}`}
                      >
                        {REVIEW_BADGES[ev.review_status].label}
                      </span>
                    )}
                  </div>
                </div>

                {ev.review_status && REVIEW_NOTES[ev.review_status] && (
                  <div className={`text-xs p-3 border rounded-md ${REVIEW_NOTES[ev.review_status].className}`}>
                    {REVIEW_NOTES[ev.review_status].text}
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-fg-soft">Değerlendirme gerekçesi</p>
                  <p className="text-sm text-fg-soft leading-relaxed">{ev.reasoning}</p>
                </div>

                {ev.evidence_pointer && (
                  <div className="p-3 bg-well border-l-2 border-brand text-xs font-mono text-fg-soft rounded-r-md break-all">
                    &ldquo;{ev.evidence_pointer}&rdquo;
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
