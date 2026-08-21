"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRequirements, createRequirement, Requirement, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LedgerCheck } from "@/components/illustrations";
import Reveal from "@/components/Reveal";

export default function RequirementsPage() {
  const { user, loading: authLoading } = useAuth();
  const isCandidate = user?.role === "candidate";

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExternalId, setNewExternalId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  // Confirms a successful "Yeni Gereksinim Tanımla" submission — the form
  // otherwise just clears silently while the list refetches below the fold.
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  // Separate from `error`: that one drives the list panel's loading/error/
  // empty branch. A failed "Yeni Gereksinim Tanımla" submission (e.g. a
  // reserved req_job_ id) must not make an already-loaded requirement list
  // disappear behind the fetch-style error screen.
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchRequirements = async () => {
    try {
      setLoading(true);
      // Clear any stale error from a previous failed attempt up front — a
      // retry that succeeds must not still short-circuit to the old message.
      setError(null);
      setErrorStatus(null);
      const data = await getRequirements();
      setRequirements(data);
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
    fetchRequirements();
  }, [authLoading]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    // `req_job_` is reserved for the criterion auto-created alongside each
    // job posting (06_API_CONTRACTS.md §4.2/§4.5); claiming one here 403s
    // and the shared error mapper turns that into a generic "yetkiniz yok"
    // message that doesn't explain the real, fixable problem.
    if (newExternalId.trim().toLowerCase().startsWith("req_job_")) {
      setCreateError(
        "\"req_job_\" ile başlayan kimlikler sistem tarafından ilan oluşturulurken otomatik ayrılır; bu ön eki kullanamazsınız. Lütfen farklı bir kimlik seçin (örn. req_deneyim_2yil)."
      );
      return;
    }

    setSubmitting(true);
    try {
      await createRequirement({ external_id: newExternalId, description: newDescription });
      setCreateSuccess(`"${newExternalId.trim()}" gereksinimi eklendi.`);
      setNewExternalId("");
      setNewDescription("");
      await fetchRequirements();
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
          <LedgerCheck className="h-28 w-auto mx-auto" />
          <h1 className="text-title text-fg">Burası işverenlerin gereksinim alanı</h1>
          <p className="text-sm text-fg-soft leading-relaxed">
            Bu sayfa işverenlerin pozisyon gereksinimlerini tanımladığı alandır. Aday olarak başvurabileceğiniz aktif pozisyonları görmek için İş İlanları sayfasını kullanabilirsiniz.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-4">
            <Link href="/jobs" className="btn btn-brand text-xs px-6 py-3">
              İş ilanlarını incele
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/candidate/hub" className="btn btn-quiet text-xs px-6 py-3">
              Aday paneline git
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8 max-w-6xl mx-auto py-12 px-4">
      {/* Same quiet brand tint the landing, jobs and employer dashboard pages
          open with — the header read noticeably flatter without it. */}
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
        <h1 className="text-title text-fg">İş gereksinimleri</h1>
        <p className="text-fg-soft text-sm max-w-2xl">
          İlanlarınızda aranmasını istediğiniz yeterlilik kuralları. Adayların
          belgeleri bu kurallara göre, gerekçesiyle birlikte değerlendirilir.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-fg tracking-tight">Gereksinim Listesi</h2>
          {loading ? (
            // Skeleton rows shaped like the real requirement cards below —
            // same pattern the employer dashboard and /candidates use — so
            // the list doesn't pop in around a bare loading sentence.
            <div className="grid gap-4" role="status" aria-label="Gereksinimler yükleniyor" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card p-4 space-y-2">
                  <div className="skeleton h-3.5 w-1/3" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : error ? (
            // Same fix as /candidates: a 401 must not read as "no data" — it
            // gets a real way forward, not just muted grey text.
            <div className="space-y-3">
              <p className="text-fg-mute text-sm">{error}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fetchRequirements()}
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
          ) : requirements.length === 0 ? (
            // Same illustrated empty-state card /candidates uses — a bare
            // sentence read like an error, and never pointed at the form
            // that fixes it.
            <div className="card p-8 text-center space-y-3">
              <LedgerCheck className="h-20 w-auto mx-auto opacity-80" />
              <p className="text-fg-soft text-sm">Henüz gereksinim tanımlanmamış.</p>
              <p className="text-fg-mute text-xs max-w-sm mx-auto leading-relaxed">
                Yandaki formla ilk kuralınızı ekleyin; adayların belgeleri bu
                kurallara göre, gerekçesiyle birlikte değerlendirilir.
              </p>
            </div>
          ) : (
            <Reveal stagger as="div" className="grid gap-4">
              {requirements.map((r) => (
                <div key={r.external_id} className="card card-lift p-4 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-brand font-semibold">{r.external_id}</span>
                  </div>
                  <p className="text-sm text-fg-soft leading-relaxed">{r.description}</p>
                </div>
              ))}
            </Reveal>
          )}
        </div>

        <div>
          <div className="card p-6 sticky top-28 space-y-4">
            <h2 className="text-lg font-semibold text-fg tracking-tight">Yeni Gereksinim Tanımla</h2>
            <p className="text-xs text-fg-mute leading-relaxed">
              Bu kural, adayların yüklediği belgeler değerlendirilirken kullanılır: sistem her
              belgeyi burada tanımladığınız kriterle karşılaştırıp gerekçesiyle birlikte raporlar.
              Sonucu, adayın başvurduğu ilanın raporunda görürsünüz.
            </p>
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
                <label htmlFor="gereksinim-id" className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5">Gereksinim Kimliği</label>
                <input
                  id="gereksinim-id"
                  type="text"
                  required
                  value={newExternalId}
                  onChange={(e) => setNewExternalId(e.target.value)}
                  className="field"
                  placeholder="Örn: req_deneyim_2yil"
                />
                <p className="mt-1.5 text-[11px] text-fg-mute">
                  Kısa ve benzersiz bir kimlik seçin. &quot;req_job_&quot; ile başlayan kimlikler
                  ilan oluştururken sistem tarafından otomatik atanır ve buradan kullanılamaz.
                </p>
              </div>
              <div>
                <label htmlFor="gereksinim-aciklama" className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5">Gereksinim Açıklaması</label>
                <textarea
                  id="gereksinim-aciklama"
                  required
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="field leading-relaxed"
                  placeholder="Örn: React custom hook deneyimi en az 2 yıl olmalı."
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-brand w-full text-xs"
              >
                {submitting ? "Ekleniyor…" : "Gereksinim Ekle"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
