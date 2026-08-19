"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { getApplicationReport, ApplicationReport } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

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

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  // The route segment is the application id: the same person applying to two
  // postings is judged against two sets of requirements, so keying the report
  // on the candidate handed both applications the same document.
  const applicationId = use(params).id;
  const { loading: authLoading } = useAuth();
  const [report, setReport] = useState<ApplicationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getApplicationReport(applicationId);
      setReport(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Rapor yüklenemedi.");
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
            className="text-xs font-semibold text-fg-mute hover:text-fg transition-colors"
          >
            &larr; Aday Profiline Dön
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="text-right">
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
        ) : (
          <p className="text-fg-soft text-sm tabular-nums">Başvuru #{applicationId}</p>
        )}
      </div>

      {loading ? (
        <div className="card p-16 text-center space-y-4">
          <div className="w-10 h-10 mx-auto border-4 border-brand/25 border-t-brand rounded-full animate-spin" aria-hidden="true" />
          <p className="text-fg-soft text-sm">Rapor hazırlanıyor; değerlendirme sonuçları derleniyor…</p>
        </div>
      ) : error || !report ? (
        <div role="alert" className="p-6 bg-err/10 border border-err/30 text-err rounded-md text-sm text-center">
          {error ?? "Rapor yüklenemedi."}
        </div>
      ) : (
        <>
          {/* Executive Match Score & Summary */}
          <div className="card grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
            <div className="flex flex-col items-center justify-center p-4 border-b md:border-b-0 md:border-r border-line space-y-3">
              <span className="text-xs font-semibold text-fg-mute uppercase tracking-wider text-center text-balance">Belgeyle Doğrulanmış Uyum Oranı</span>
              <ScoreRing score={report.evidence_score} />
              <span className="text-xs text-fg-mute tabular-nums">
                {report.verified_count} / {report.counted_count} gereksinim belgeyle doğrulandı
              </span>
            </div>

            <div className="col-span-2 space-y-3 flex flex-col justify-center">
              <h3 className="text-sm font-semibold text-fg-soft uppercase tracking-wider">Özet Değerlendirme</h3>
              <p className="text-sm text-fg-soft leading-relaxed">
                {report.items.length === 0
                  ? `Bu başvuru için henüz değerlendirilmiş bir belge bulunmuyor. Aday panelinden özgeçmiş, sertifika veya belge yüklenebilir.`
                  : report.counted_count === 0
                  ? `Belgeleriniz incelemede; onaylandığında bu bölüm güncellenecek.`
                  : report.evidence_score >= 50
                  ? `${candidateName}, ${report.job_title} ilanının temel gereksinimleri için doğrulanabilir belge sundu. Değerlendirme yalnızca sunulan kanıtlara dayanmaktadır.`
                  : `${candidateName} için bazı gereksinimlerde belge yetersiz kaldı veya doğrulanamadı. Görüşmede bu başlıkların sorulması önerilir.`}
              </p>
              <div className="flex flex-wrap gap-4 text-xs text-fg-mute pt-1 tabular-nums">
                <span>Doğrulanan: <strong className="text-ok">{report.verified_count}</strong></span>
                <span>Yetersiz: <strong className="text-warn">{insufficientCount}</strong></span>
                <span>Çelişki: <strong className="text-err">{contradictionCount}</strong></span>
              </div>
            </div>
          </div>

          {/* Breakdown per requirement */}
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-fg tracking-tight text-balance">Gereksinim Bazında Değerlendirme</h2>

            {report.items.length === 0 ? (
              <div className="card p-8 text-center space-y-4">
                <p className="text-fg-soft text-sm">Bu başvuru için henüz değerlendirilmiş bir belge bulunmuyor.</p>
                <Link
                  href="/candidate/hub"
                  className="btn btn-quiet text-xs px-4 py-2"
                >
                  Aday paneline git
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {report.items.map((e, index) => (
                  <div
                    key={`${e.requirement_external_id}-${index}`}
                    className={`card card-lift p-6 space-y-4 border-l-2 ${
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
                        <span className="font-semibold text-fg text-sm">{e.requirement_external_id}</span>
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
                            <span
                              className="text-[11px] font-mono text-fg-mute tabular-nums"
                              title="Yapay zekanın bu değerlendirmedeki güven skoru"
                            >
                              Güven skoru: {formatConfidence(e.confidence_score)}
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

                    {e.requirement_description && (
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
                ))}
              </div>
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
