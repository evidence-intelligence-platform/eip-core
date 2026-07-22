"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { getReportData, ReportData } from "@/lib/api";

export default function CandidateProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const candidateId = resolvedParams.id;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [candidateId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center text-zinc-400 text-sm">
        Profesyonel Aday Portföyü Yükleniyor...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl text-center">
        ❌ {error || "Aday profili bulunamadı."}
      </div>
    );
  }

  const { candidate, evidences, summary } = data;

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-8 px-4">
      {/* Back Link */}
      <div>
        <Link href="/candidates" className="text-xs text-blue-400 hover:underline font-semibold flex items-center gap-1">
          &larr; Aday Havuzuna Dön
        </Link>
      </div>

      {/* Profile Header Card */}
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl space-y-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-lg">
                {candidate.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">{candidate.name}</h1>
                <p className="text-xs font-mono text-blue-400">{candidate.external_id}</p>
              </div>
            </div>
            <p className="text-xs text-zinc-400 pt-1">
              Doğrulanmış Profesyonel Kariyer Portföyü & AI Yetkinlik Kanıtları
            </p>
          </div>

          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-center space-y-1 min-w-[140px]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Doğrulama Skoru</span>
            <p className="text-3xl font-extrabold text-emerald-400">{summary.score}%</p>
            <span className="text-[9px] text-zinc-500 block">{summary.verified} / {summary.total} Kanıt Doğrulandı</span>
          </div>
        </div>
      </div>

      {/* Verified Evidences Timeline */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span>🏆</span> AI Tarafından Doğrulanmış Mesleki Kanıtlar ({evidences.length})
        </h2>

        {evidences.length === 0 ? (
          <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl text-zinc-400 text-sm">
            Bu aday için henüz kayıtlı bir kanıt bulunamadı.
          </div>
        ) : (
          <div className="space-y-4">
            {evidences.map((ev) => (
              <div key={ev.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-3 hover:border-zinc-700 transition shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-zinc-950 text-blue-400 font-bold border border-zinc-800">
                    {ev.requirement_external_id}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                      ev.status === "VERIFIED"
                        ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                        : ev.status === "CONTRADICTION"
                        ? "bg-red-950 text-red-400 border-red-800"
                        : "bg-amber-950 text-amber-400 border-amber-800"
                    }`}
                  >
                    {ev.status}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-300">AI Değerlendirme Gerekçesi:</p>
                  <p className="text-sm text-zinc-400 leading-relaxed">{ev.reasoning}</p>
                </div>

                {ev.evidence_pointer && (
                  <div className="p-3 bg-zinc-950 border-l-4 border-emerald-500 text-xs font-mono text-emerald-400 rounded-r-lg">
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
