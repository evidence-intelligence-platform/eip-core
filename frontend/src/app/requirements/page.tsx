"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRequirements, createRequirement, Requirement } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function RequirementsPage() {
  const { user } = useAuth();
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
        setError("An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequirements();
  }, []);

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
        setError("An error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // If candidate logs in and lands here, show clean role notice
  if (isCandidate) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-4 shadow-xl">
          <div className="text-4xl">📋</div>
          <h1 className="text-2xl font-bold text-white">İşveren Gereksinim Yönetimi</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Bu sayfa işverenlerin teknik pozisyon gereksinimlerini tanımladığı alandır. Aday olarak başvurabileceğiniz aktif pozisyonları görmek için İş İlanları sayfasını kullanabilirsiniz.
          </p>
          <div className="pt-2 flex justify-center gap-4">
            <Link
              href="/jobs"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition shadow"
            >
              💼 İş İlanlarını İncele &rarr;
            </Link>
            <Link
              href="/candidate/hub"
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition shadow"
            >
              🎯 Aday Paneline Git &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">İş Gereksinimleri & Kriterleri</h1>
        <p className="text-zinc-400 mt-2 text-sm">İşverenlerin AI tarafından aranmasını istediği teknik gereksinim kuralları.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold text-white">Gereksinim Listesi</h2>
          {loading ? (
            <p className="text-zinc-400 text-sm">Yükleniyor...</p>
          ) : requirements.length === 0 ? (
            <p className="text-zinc-500 text-sm">Kayıtlı gereksinim bulunamadı.</p>
          ) : (
            <div className="grid gap-4">
              {requirements.map((r) => (
                <div key={r.external_id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 space-y-1 hover:border-zinc-700 transition">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-blue-400 font-bold">{r.external_id}</span>
                  </div>
                  <p className="text-sm text-zinc-200">{r.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 sticky top-8 space-y-4">
            <h2 className="text-xl font-semibold text-white">Yeni Gereksinim Tanımla</h2>
            {error && <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-lg text-xs">{error}</div>}
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Gereksinim ID (External ID)</label>
                <input
                  type="text"
                  required
                  value={newExternalId}
                  onChange={(e) => setNewExternalId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950 focus:border-blue-500"
                  placeholder="Örn: req_001"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Gereksinim Açıklaması</label>
                <textarea
                  required
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950 focus:border-blue-500"
                  placeholder="Örn: React custom hook deneyimi en az 2 yıl olmalı."
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg text-xs transition disabled:opacity-50"
              >
                {submitting ? "Ekleniyor..." : "Gereksinim Ekle"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
