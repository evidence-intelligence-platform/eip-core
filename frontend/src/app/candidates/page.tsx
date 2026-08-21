"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCandidates, createCandidate, Candidate, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MagnifierDoc } from "@/components/illustrations";

export default function CandidatesPage() {
  const { user, loading: authLoading } = useAuth();
  const isCandidate = user?.role === "candidate";

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExternalId, setNewExternalId] = useState("");
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  // Separate from `error`: that one drives the list panel's loading/error/
  // empty branch. A failed "Manuel Aday Ekle" submission (e.g. duplicate
  // external_id) must not make an already-loaded candidate list disappear
  // behind the fetch-style error screen.
  const [createError, setCreateError] = useState<string | null>(null);
  // Confirms a successful "Manuel Aday Ekle" submission — the form otherwise
  // just clears silently while the list refetches. Same pattern as the
  // requirements page's createSuccess.
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      // Clear any stale error from a previous failed attempt up front — a
      // retry that succeeds must not still short-circuit to the old message.
      setError(null);
      setErrorStatus(null);
      const data = await getCandidates();
      setCandidates(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorStatus(err.status);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Bir hata oluştu.");
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/auth-ready, the standard data-load pattern used throughout this app
    fetchCandidates();
  }, [authLoading]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await createCandidate({ external_id: newExternalId, name: newName });
      setCreateSuccess(`"${newName.trim()}" adayı eklendi.`);
      setNewExternalId("");
      setNewName("");
      await fetchCandidates();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError("Bir hata oluştu.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // If candidate logs in and lands here, show clean role notice
  if (isCandidate) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="card p-8 space-y-4">
          <MagnifierDoc className="h-28 w-auto mx-auto" />
          <h1 className="text-title text-fg">Burası işverenlerin aday havuzu</h1>
          <p className="text-sm text-fg-soft leading-relaxed">
            Bu sayfa işverenlerin başvuran adayları ve yetkinlik raporlarını incelediği alandır. Bir aday olarak kendi profilinizi yönetmek, CV yüklemek ve ilanlara başvurmak için Aday Paneli&apos;ni kullanabilirsiniz.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-4">
            <Link href="/candidate/hub" className="btn btn-brand text-xs px-6 py-3">
              Aday paneline git
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/jobs" className="btn btn-quiet text-xs px-6 py-3">
              İş ilanlarını incele
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8 max-w-6xl mx-auto py-12 px-4">
      {/* Same quiet brand tint the landing, jobs and candidate-hub pages open with */}
      <div
        className="absolute inset-x-0 top-0 h-[20rem] -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 70% at 50% 0%, color-mix(in oklab, var(--brand) 6%, transparent), transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div className="space-y-3">
        <p className="eyebrow">İşveren alanı</p>
        <h1 className="text-title text-fg">Aday havuzu</h1>
        <p className="text-fg-soft text-sm max-w-2xl">
          Kayıtlı adayları ve belgeye dayalı değerlendirme raporlarını inceleyin.
          Her raporda sonucun gerekçesi de yazar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-fg tracking-tight">Aday Listesi</h2>
          {loading ? (
            // Skeleton rows shaped like the real candidate cards below — same
            // pattern jobs/page.tsx uses for its own list — so the two-column
            // grid doesn't pop in around a bare loading sentence.
            <div className="grid gap-4" role="status" aria-label="Aday listesi yükleniyor" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card p-4 flex justify-between items-center gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="skeleton h-5 w-2/5" />
                    <div className="skeleton h-3 w-1/4" />
                  </div>
                  <div className="skeleton h-9 w-32 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          ) : error ? (
            // A 401 here previously fell through to "Kayıtlı aday
            // bulunamadı." — indistinguishable from a genuinely empty list,
            // so an anonymous visitor never learned they needed to log in.
            // Now it also gets a concrete way forward instead of a dead end.
            <div className="space-y-3">
              <p className="text-fg-mute text-sm">{error}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fetchCandidates()}
                  className="btn btn-quiet text-xs px-4 py-2"
                >
                  Tekrar dene
                </button>
                {errorStatus === 401 && (
                  <Link href="/login" className="btn btn-brand text-xs px-4 py-2">
                    Giriş yap
                  </Link>
                )}
              </div>
            </div>
          ) : candidates.length === 0 ? (
            <div className="card p-8 text-center space-y-3">
              <MagnifierDoc className="h-20 w-auto mx-auto opacity-80" />
              <p className="text-fg-soft text-sm">Kayıtlı aday bulunamadı.</p>
              <p className="text-fg-mute text-xs max-w-sm mx-auto leading-relaxed">
                Henüz başvuran veya eklenen bir aday yok. Adaylar bir ilana
                başvurduğunda ya da sağdaki formla eklendiğinde burada listelenir.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {candidates.map((c) => (
                <div key={c.external_id} className="card card-lift p-4 flex justify-between items-center gap-4">
                  <div>
                    <h3 className="font-medium text-lg text-fg tracking-tight">{c.name}</h3>
                    <p className="text-xs text-fg-mute font-mono">{c.external_id}</p>
                  </div>
                  <Link
                    href={`/candidates/${c.external_id}`}
                    className="btn btn-quiet text-xs px-4 py-2 shrink-0"
                  >
                    Rapor ve kanıtlar
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="card p-6 sticky top-28 space-y-4">
            <h2 className="text-lg font-semibold text-fg tracking-tight">Manuel Aday Ekle</h2>
            {createSuccess && (
              <div role="status" className="p-3 bg-ok/10 border border-ok/30 text-ok text-xs rounded-md font-medium">
                {createSuccess}
              </div>
            )}
            {createError && (
              <div role="alert" className="p-3 bg-err/10 border border-err/30 text-err rounded-md text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="aday-id" className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5">Aday ID (External ID)</label>
                <input
                  id="aday-id"
                  type="text"
                  required
                  disabled={submitting}
                  value={newExternalId}
                  onChange={(e) => setNewExternalId(e.target.value)}
                  className="field"
                  placeholder="Örn: cand_001"
                />
              </div>
              <div>
                <label htmlFor="aday-ad" className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5">Aday Adı ve Soyadı</label>
                <input
                  id="aday-ad"
                  type="text"
                  required
                  disabled={submitting}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="field"
                  placeholder="Örn: Ayşe Yılmaz"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-brand w-full text-xs"
              >
                {submitting ? "Ekleniyor…" : "Aday Ekle"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
