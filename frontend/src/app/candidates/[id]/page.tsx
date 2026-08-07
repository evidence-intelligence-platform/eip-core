"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { getReportData, ReportData } from "@/lib/api";
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
  const { loading: authLoading } = useAuth();

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // AuthProvider restores the bearer token in its own mount effect, which
    // runs *after* this one; fetching while it is still loading would fire
    // the request without an Authorization header and 401.
    if (authLoading) return;
    async function load() {
      try {
        setLoading(true);
        const rep = await getReportData(candidateId);
        setData(rep);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Profil yüklenemedi.");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authLoading, candidateId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center text-fg-soft text-sm">
        Aday profili yükleniyor…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className="max-w-md mx-auto my-12 p-6 bg-err/10 border border-err/30 text-err text-sm rounded-md text-center">
        {error || "Aday profili bulunamadı."}
      </div>
    );
  }

  const { candidate, evidences, summary } = data;

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-8 px-4">
      {/* Back Link */}
      <div>
        <Link
          href="/candidates"
          className="text-xs text-fg-mute hover:text-fg font-semibold flex items-center gap-1 transition-colors"
        >
          &larr; Aday Havuzuna Dön
        </Link>
      </div>

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

          <div className="p-4 bg-well border border-line rounded-md text-center space-y-1 min-w-[140px]">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-fg-mute block">Doğrulama Skoru</span>
            <p className="text-3xl font-semibold text-brand tabular-nums">%{summary.score}</p>
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
              <div key={ev.id} className="card card-hover p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono px-2.5 py-1 rounded-sm bg-well text-fg-soft border border-line">
                    {ev.requirement_external_id}
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
