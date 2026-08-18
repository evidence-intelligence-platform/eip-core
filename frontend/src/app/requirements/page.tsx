"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRequirements, createRequirement, Requirement } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LedgerCheck } from "@/components/illustrations";

export default function RequirementsPage() {
  const { user, loading: authLoading } = useAuth();
  const isCandidate = user?.role === "candidate";

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExternalId, setNewExternalId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequirements = async () => {
    try {
      setLoading(true);
      const data = await getRequirements();
      setRequirements(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
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
    fetchRequirements();
  }, [authLoading]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createRequirement({ external_id: newExternalId, description: newDescription });
      setNewExternalId("");
      setNewDescription("");
      await fetchRequirements();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Bir hata oluştu.");
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
    <div className="space-y-8 max-w-6xl mx-auto py-12 px-4">
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
            <p className="text-fg-soft text-sm">Yükleniyor…</p>
          ) : error ? (
            // Same fix as /candidates: a 401 must not read as "no data".
            <p className="text-fg-mute text-sm">{error}</p>
          ) : requirements.length === 0 ? (
            <p className="text-fg-mute text-sm">Kayıtlı gereksinim bulunamadı.</p>
          ) : (
            <div className="grid gap-4">
              {requirements.map((r) => (
                <div key={r.external_id} className="card card-lift p-4 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-brand font-semibold">{r.external_id}</span>
                  </div>
                  <p className="text-sm text-fg-soft leading-relaxed">{r.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="card p-6 sticky top-28 space-y-4">
            <h2 className="text-lg font-semibold text-fg tracking-tight">Yeni Gereksinim Tanımla</h2>
            {error && (
              <div role="alert" className="p-3 bg-err/10 border border-err/30 text-err rounded-md text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="gereksinim-id" className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5">Gereksinim ID (External ID)</label>
                <input
                  id="gereksinim-id"
                  type="text"
                  required
                  value={newExternalId}
                  onChange={(e) => setNewExternalId(e.target.value)}
                  className="field"
                  placeholder="Örn: req_001"
                />
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
