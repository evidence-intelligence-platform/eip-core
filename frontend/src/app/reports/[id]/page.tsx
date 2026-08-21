"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { getApplicationReport, ApplicationReport } from "@/lib/api";
import { requirementLabel } from "@/lib/labels";
import { useAuth } from "@/context/AuthContext";
import Reveal from "@/components/Reveal";
import { SealMark } from "@/components/illustrations";

// Human review outcome. Only the owning candidate (and admins) receive
// pending/rejected rows; employers never see them, so the badge tells the
// candidate why a document does not count toward the score.
const REVIEW_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "İncelemede", className: "bg-warn/10 text-warn border-warn/30" },
  rejected: { label: "Reddedildi", className: "bg-err/10 text-err border-err/30" },
};

const REVIEW_NOTES: Record<string, { className: string; text: string }> = {
  pending: {
    className: "bg-warn/10 border-warn/30 text-warn",
    text: "Bu belge ekibimiz tarafından kontrol ediliyor. Onaylanana kadar işverene gösterilmez ve uyum oranına katılmaz.",
  },
  rejected: {
    className: "bg-err/10 border-err/30 text-err",
    text: "Bu belge, ekibimizin incelemesi sonucunda onaylanmadı; işverene gösterilmiyor ve uyum oranına katılmıyor. Daha net ve okunaklı bir kopya yükleyerek yeniden deneyebilirsiniz.",
  },
};

// The engine lets three parties read a report (reports.py
// _assert_may_read_report): the candidate it is about, the employer who
// published the posting, and admins. Every escape link on this page therefore
// has to be three-way — /candidate/hub answers a non-candidate with a
// dead-end card whose only exit is the employer dashboard, so an admin sent
// there has nowhere left to go.
const PANELS = {
  employer: {
    href: "/employer/dashboard",
    back: "İşveren paneline dön",
    go: "İşveren paneline git",
  },
  admin: {
    href: "/admin/moderation",
    back: "Yönetici paneline dön",
    go: "Yönetici paneline git",
  },
  candidate: {
    href: "/candidate/hub",
    back: "Aday paneline dön",
    go: "Aday paneline git",
  },
} as const;

/** Animated brass score ring — sweeps from empty to the measured value once. */
function ScoreRing({ score }: { score: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.min(Math.max(score, 0), 100) / 100);
  return (
    <div className="relative w-36 h-36" role="img" aria-label={`Uyum oranı yüzde ${score}`}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="var(--line)"
          strokeWidth="8"
        />
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
        <span className="text-3xl font-semibold text-brand tabular-nums">
          %{score}
        </span>
      </div>
    </div>
  );
}

/** Document stamp. A malformed timestamp yields no stamp rather than "Invalid Date". */
function formatGeneratedAt(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

// The engine's confidence_score is an int 0-100; a value of 1 means 1%, not a
// 0-1 float to be scaled up. Same rule as admin/moderation and candidate/hub.
function formatConfidence(score: number | null): string | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return `%${Math.round(score)}`;
}

/**
 * The sentence under the score ring, split by audience as well as by state.
 * The candidate is the only reader who can act on "upload a document" and the
 * only one whose documents can be addressed as "Belgeleriniz". The employer is
 * not a bystander here: the engine filters their copy of `items` down to the
 * counted rows, so a candidate whose evidence is all still pending drops them
 * straight into the first branch — the one that used to hand them instructions
 * for a panel they cannot open, about documents that are not theirs.
 */
function summaryText(
  report: ApplicationReport,
  candidateName: string,
  isCandidateViewer: boolean
): string {
  if (report.items.length === 0) {
    return isCandidateViewer
      ? "Bu başvuru için henüz değerlendirilmiş bir belge bulunmuyor. Aday panelinden özgeçmiş, sertifika veya belge yüklenebilir."
      : "Bu adayın bu başvuru için değerlendirmeye giren onaylı belgesi bulunmuyor.";
  }
  if (report.counted_count === 0) {
    return isCandidateViewer
      ? "Belgeleriniz incelemede; onaylandığında bu bölüm güncellenecek."
      : "Bu adayın belgeleri incelemede; onaylandığında bu bölüm güncellenecek.";
  }
  if (report.evidence_score >= 50) {
    return `${candidateName}, ${report.job_title} ilanının temel gereksinimleri için doğrulanabilir belge sundu. Değerlendirme yalnızca sunulan kanıtlara dayanmaktadır.`;
  }
  return `${candidateName} için bazı gereksinimlerde belge yetersiz kaldı veya doğrulanamadı. Görüşmede bu başlıkların sorulması önerilir.`;
}

// The engine files two kinds of source under a requirement id: a job's own
// criterion (req_job_<id>, scoped to this application's posting) and the
// job-neutral document types filed under req_general_* at application time
// (see jobs/page.tsx GENERAL_REQ). Neither is meant for a reader — the shared
// requirementLabel helper (lib/labels.ts) maps the general ones to the same
// short Turkish labels the candidate picked them by, and falls back to the
// requirement's own description for job-specific criteria.

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  // The route segment is the application id: the same person applying to two
  // postings is judged against two sets of requirements, so keying the report
  // on the candidate handed both applications the same document.
  const applicationId = use(params).id;
  const { user, loading: authLoading } = useAuth();
  const [report, setReport] = useState<ApplicationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The application id the viewer is looking at *right now*. In-flight
  // fetches compare against it so a late response from a previous id cannot
  // write over the current report.
  const activeIdRef = useRef(applicationId);
  // Everyone but the candidate is reading about someone else's documents, so
  // the panel links and the second-person copy below both branch on the role.
  // A viewer with no role resolved (the 401 branch) keeps the candidate
  // wording, which is where this page's links have always defaulted.
  const isEmployer = user?.role === "employer";
  const isAdmin = user?.role === "admin";
  const isCandidateViewer = !isEmployer && !isAdmin;
  const panel = isEmployer ? PANELS.employer : isAdmin ? PANELS.admin : PANELS.candidate;

  const fetchReport = async () => {
    // Pin the id this request belongs to: the viewer can navigate to another
    // application's report while it is in flight, and a late response from
    // the previous id must not overwrite the new report — same stale-response
    // guard as admin/moderation's activeTabRef.
    const id = applicationId;
    activeIdRef.current = id;
    try {
      setLoading(true);
      setError(null);
      // Clear the previous id's report immediately: the header (candidate
      // name, job title, company, 'Aday Profiline Dön') renders straight off
      // `report` outside the loading/error branch below, so leaving the old
      // value in place while a new id's request is in flight shows a fresh
      // RAPOR NO next to a stale candidate/job/company.
      setReport(null);
      const data = await getApplicationReport(id);
      if (activeIdRef.current !== id) return; // stale: viewer moved on
      setReport(data);
    } catch (err: unknown) {
      if (activeIdRef.current !== id) return; // stale: viewer moved on
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Rapor yüklenemedi.");
      }
    } finally {
      // A stale response must not clear the skeleton the current id's
      // still-in-flight request owns.
      if (activeIdRef.current === id) setLoading(false);
    }
  };

  useEffect(() => {
    // AuthProvider restores the bearer token in its own mount effect, which
    // runs *after* this one; fetching while it is still loading would fire
    // the request without an Authorization header and 401.
    if (authLoading) return;
    if (applicationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/id-change, the standard data-load pattern used throughout this app
      fetchReport();
    }
  }, [authLoading, applicationId]);

  // The engine already decided the score and its denominator; these tallies
  // only break that same denominator down by outcome, so the three numbers
  // under the ring always add up to what the ring shows.
  const countedItems = report?.items.filter((item) => item.counted) ?? [];
  const insufficientCount = countedItems.filter(
    (item) => item.status === "INSUFFICIENT EVIDENCE"
  ).length;
  const contradictionCount = countedItems.filter(
    (item) => item.status === "CONTRADICTION"
  ).length;
  const candidateName = report?.candidate_name?.trim() || "Aday";
  const generatedAt = report ? formatGeneratedAt(report.generated_at) : null;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        {report ? (
          <Link
            href={`/candidates/${report.candidate_external_id}`}
            className="text-xs font-semibold text-fg-mute hover:text-fg transition-colors no-print"
          >
            &larr; Aday Profiline Dön
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        {/* print-push-right keeps the stamp on the right edge once the back
            link above is dropped from the printed sheet. */}
        <div className="text-right print-push-right">
          <span className="block text-xs font-mono text-fg-mute">RAPOR NO: EXP-{applicationId}</span>
          {generatedAt && (
            <span className="block text-[11px] text-fg-mute">Hazırlanma: {generatedAt}</span>
          )}
        </div>
      </div>

      {/* Header Title */}
      <div className="text-center space-y-3">
        <p className="eyebrow">Kanıt değerlendirme raporu</p>
        <h1 className="text-title text-fg">
          Aday Uyum ve Gerekçe Raporu
        </h1>
        {report ? (
          // Fragment, not a wrapper: the parent's space-y-3 has to keep
          // spacing the identity block and the print button apart.
          <>
            <div className="space-y-1">
              <p className="text-fg-soft text-sm">
                Aday: <span className="font-semibold text-fg">{candidateName}</span>{" "}
                (Kayıt: <span className="font-mono text-fg-soft">{report.candidate_external_id}</span>)
              </p>
              <p className="text-fg-mute text-xs">
                İlan: <span className="font-medium text-fg-soft">{report.job_title}</span> &middot;{" "}
                {report.company_name}
              </p>
            </div>
            {/* The browser's own print flow — no server-side renderer, so
                this costs the deployment nothing. Every desktop and mobile
                print dialog offers "Save as PDF" as a destination, which is
                what the label promises. Rendered only in this branch: there
                is nothing worth printing while the report is loading, and a
                failed one would print its own error box. .no-print keeps the
                button out of the sheet it produces. */}
            <button
              type="button"
              onClick={() => window.print()}
              className="btn btn-quiet btn-sm no-print"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5 shrink-0"
                aria-hidden="true"
              >
                <path d="M6 9V3h12v6" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v7H6z" />
              </svg>
              PDF olarak kaydet
              <span className="sr-only">
                {" "}
                (tarayıcının yazdırma penceresi açılır; hedef olarak &quot;PDF olarak
                kaydet&quot; seçilebilir)
              </span>
            </button>
          </>
        ) : (
          <p className="text-fg-soft text-sm tabular-nums">Başvuru #{applicationId}</p>
        )}
      </div>

      {loading ? (
        // Shaped like the real report below (chrome card + score ring +
        // summary lines, then a few requirement rows) so the page holds its
        // layout instead of collapsing to a spinner — same doctrine as
        // jobs/page.tsx's own loading skeletons.
        <div className="space-y-8" aria-label="Rapor hazırlanıyor" aria-busy="true">
          <div className="card border-gradient overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-line bg-well/60">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-5 w-32 rounded-full" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
              <div className="flex flex-col items-center justify-center p-4 border-b md:border-b-0 md:border-r border-line space-y-3">
                <div className="skeleton h-3 w-48" />
                <div className="skeleton w-36 h-36 rounded-full" />
                <div className="skeleton h-3 w-40" />
              </div>
              <div className="md:col-span-2 space-y-3 flex flex-col justify-center">
                <div className="skeleton h-3 w-32" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-5/6" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-6 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                  <div className="skeleton h-4 w-52" />
                  <div className="skeleton h-5 w-24 rounded-full" />
                </div>
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-16 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ) : error || !report ? (
        <div role="alert" className="p-6 bg-err/10 border border-err/30 text-err rounded-md text-sm text-center space-y-4">
          <p>{error ?? "Rapor yüklenemedi."}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={fetchReport}
              className="px-3 py-1.5 bg-err/10 hover:bg-err/20 border border-err/30 text-err rounded-md text-xs font-semibold transition-colors"
            >
              Tekrar dene
            </button>
            <Link
              href={panel.href}
              className="px-3 py-1.5 bg-surface hover:bg-raised border border-line text-fg-soft rounded-md text-xs font-semibold transition-colors"
            >
              {panel.back}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Executive Match Score & Summary — same brass-gradient chrome
              (SealMark + mono label, bg-well/60 header) as the "örnek rapor"
              mockup on the landing page, so the delivered report reads as
              polished as its own promotional preview. */}
          <Reveal>
            <div className="card border-gradient overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line bg-well/60">
                <div className="flex items-center gap-2.5">
                  <SealMark className="w-5 h-5" aria-hidden="true" />
                  <span className="text-xs font-mono text-fg-mute tracking-wider">DEĞERLENDİRME RAPORU</span>
                </div>
                <span className="badge bg-brand/10 text-brand border-brand/30 tabular-nums">
                  {report.verified_count} / {report.counted_count} gereksinim doğrulandı
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
                <div className="flex flex-col items-center justify-center p-4 border-b md:border-b-0 md:border-r border-line space-y-3">
                  <span className="text-xs font-semibold text-fg-mute uppercase tracking-wider text-center text-balance">Belgeyle Doğrulanmış Uyum Oranı</span>
                  <ScoreRing score={report.evidence_score} />
                  <span className="text-xs text-fg-mute tabular-nums">
                    {report.verified_count} / {report.counted_count} gereksinim belgeyle doğrulandı
                  </span>
                </div>

                <div className="md:col-span-2 space-y-3 flex flex-col justify-center">
                  <h3 className="text-sm font-semibold text-fg-soft uppercase tracking-wider">Özet Değerlendirme</h3>
                  <p className="text-sm text-fg-soft leading-relaxed">
                    {summaryText(report, candidateName, isCandidateViewer)}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-fg-mute pt-1 tabular-nums">
                    <span>Doğrulanan: <strong className="text-ok">{report.verified_count}</strong></span>
                    <span>Yetersiz: <strong className="text-warn">{insufficientCount}</strong></span>
                    <span>Çelişki: <strong className="text-err">{contradictionCount}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Transparency strip. The engine serves these two notes to every
              reader, employer included — they are flags, never document
              content — precisely so the number above is not read as a verdict
              it is not: a 0% next to an empty matrix means "nothing has been
              approved yet", not "this candidate sent nothing". Each note is
              non-null exactly when its flag is set, so the string is the
              condition. */}
          {(report.pending_evidence_note || report.low_confidence_note) && (
            <div className="space-y-3">
              {report.pending_evidence_note && (
                <div className="text-xs p-3 bg-warn/10 border border-warn/30 text-warn rounded-md leading-relaxed">
                  <strong>İncelemedeki belgeler:</strong> {report.pending_evidence_note}
                </div>
              )}
              {report.low_confidence_note && (
                <div className="text-xs p-3 bg-warn/10 border border-warn/30 text-warn rounded-md leading-relaxed">
                  <strong>Düşük güven skoru:</strong> {report.low_confidence_note}
                </div>
              )}
            </div>
          )}

          {/* Breakdown per requirement */}
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-fg tracking-tight text-balance">Gereksinim Bazında Değerlendirme</h2>

            {report.items.length === 0 ? (
              <div className="card p-8 text-center space-y-4">
                <p className="text-fg-soft text-sm">Bu başvuru için henüz değerlendirilmiş bir belge bulunmuyor.</p>
                <Link
                  href={panel.href}
                  className="btn btn-quiet text-xs px-4 py-2 no-print"
                >
                  {panel.go}
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            ) : (
              // Stagger, not card-lift: this is a tightly stacked vertical
              // list (not a grid), so entrance is a per-row cascade and hover
              // is a flat tint — the same distinction the landing page's own
              // report mockup makes for this exact row pattern.
              <Reveal stagger className="space-y-4">
                {report.items.map((e, index) => {
                  const title = requirementLabel(e.requirement_external_id, e.requirement_description);
                  return (
                  <div
                    key={`${e.requirement_external_id}-${index}`}
                    className={`card p-6 space-y-4 border-l-2 hover:bg-raised/50 transition-colors ${
                      e.status === "VERIFIED"
                        ? "border-l-ok/60"
                        : e.status === "CONTRADICTION"
                        ? "border-l-err/60"
                        : "border-l-warn/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-fg-mute tabular-nums">[{index + 1}] GEREKSİNİM:</span>
                        <span className="font-semibold text-fg text-sm">{title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`badge uppercase tracking-wider ${
                            e.status === "VERIFIED"
                              ? "bg-ok/10 text-ok border-ok/30"
                              : e.status === "CONTRADICTION"
                              ? "bg-err/10 text-err border-err/30"
                              : "bg-warn/10 text-warn border-warn/30"
                          }`}
                        >
                          {e.status === "VERIFIED" ? "Doğrulandı" : e.status === "CONTRADICTION" ? "Çelişki" : "Yetersiz Belge"}
                        </span>
                        {(e.status === "VERIFIED" || e.status === "CONTRADICTION") &&
                          formatConfidence(e.confidence_score) && (
                            // The explanation lives in visible/sr-only text,
                            // not a title tooltip — keyboard and touch users
                            // never see a title.
                            <span className="text-[11px] font-mono text-fg-mute tabular-nums">
                              Güven skoru: {formatConfidence(e.confidence_score)}
                              <span className="sr-only">
                                {" "}
                                (yapay zekânın bu değerlendirmedeki güven düzeyi)
                              </span>
                            </span>
                          )}
                        {/* Cannot collide with the review badge below: the
                            engine only sets this flag on rows human review
                            has already cleared. */}
                        {e.low_confidence && (
                          <span className="badge uppercase tracking-wider bg-warn/10 text-warn border-warn/30">
                            Düşük güven
                            <span className="sr-only">
                              {" "}
                              (model bu satırdan emin değil; bu değerlendirme ayrıca insan
                              incelemesinden geçmedi)
                            </span>
                          </span>
                        )}
                        {REVIEW_BADGES[e.review_status] && (
                          <span
                            className={`badge uppercase tracking-wider ${REVIEW_BADGES[e.review_status].className}`}
                          >
                            {REVIEW_BADGES[e.review_status].label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Skipped when the description is already doing duty as
                        the row's title above (job-specific requirements with
                        no shorter label) — showing the same sentence twice
                        would read as a copy-paste mistake. */}
                    {e.requirement_description && e.requirement_description !== title && (
                      <p className="text-xs text-fg-mute leading-relaxed">{e.requirement_description}</p>
                    )}

                    {/* Keyed off `counted` rather than the review verdict alone:
                        the note claims the row is out of the score, so the
                        engine's own accounting has to be the one that says so. */}
                    {!e.counted && REVIEW_NOTES[e.review_status] && (
                      <div className={`text-xs p-3 border rounded-md ${REVIEW_NOTES[e.review_status].className}`}>
                        {REVIEW_NOTES[e.review_status].text}
                      </div>
                    )}

                    <div className="p-4 bg-well border border-line rounded-md space-y-1">
                      <strong className="text-[11px] font-semibold text-brand uppercase tracking-wider block">
                        Değerlendirme Gerekçesi
                      </strong>
                      <p className="text-sm text-fg-soft leading-relaxed">{e.reasoning}</p>
                    </div>

                    {e.evidence_pointer ? (
                      <div className="flex items-start gap-3 text-xs p-3 bg-well border-l-2 border-brand rounded-r-md">
                        <span className="font-mono text-fg-mute uppercase tracking-wider shrink-0">DAYANAK:</span>
                        <span className="font-mono text-fg-soft break-all">{e.evidence_pointer}</span>
                      </div>
                    ) : e.status === "INSUFFICIENT EVIDENCE" ? (
                      <div className="text-xs p-3 bg-warn/10 border border-warn/30 text-warn rounded-md">
                        <strong>Görüşme önerisi:</strong> Adaydan bu başlıkla ilgili somut bir çalışma örneği, belge veya referans göstermesini isteyin.
                      </div>
                    ) : null}
                  </div>
                  );
                })}
              </Reveal>
            )}
          </div>

          {/* Decision Bar */}
          {/* Decisions belong to the employer dashboard, where they are actually
              persisted. The buttons that used to sit here only changed local
              state while telling the viewer the decision had been recorded —
              and this page is linked from the candidate's own screens. */}
          <div className="pt-6 border-t border-line text-center">
            <p className="text-xs text-fg-mute">
              Bu rapor değerlendirme içindir. Başvuru kararları işveren panelinden verilir.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
