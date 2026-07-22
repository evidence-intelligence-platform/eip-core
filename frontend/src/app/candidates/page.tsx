"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCandidates, createCandidate, Candidate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function CandidatesPage() {
  const { user } = useAuth();
  const isCandidate = user?.role === "candidate";

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExternalId, setNewExternalId] = useState("");
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const data = await getCandidates();
      setCandidates(data);
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
    fetchCandidates();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createCandidate({ external_id: newExternalId, name: newName });
      setNewExternalId("");
      setNewName("");
      await fetchCandidates();
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
          <div className="text-4xl">👥</div>
          <h1 className="text-2xl font-bold text-white">İşveren Aday Havuzu</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Bu sayfa işverenlerin başvuran adayları ve yetkinlik raporlarını incelediği alandır. Bir aday olarak kendi profilinizi yönetmek, CV yüklemek ve ilanlara başvurmak için Aday Paneli&apos;ni kullanabilirsiniz.
          </p>
          <div className="pt-2 flex justify-center gap-4">
            <Link
              href="/candidate/hub"
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition shadow"
            >
              🎯 Aday Paneline Git &rarr;
            </Link>
            <Link
              href="/jobs"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition shadow"
            >
              💼 İş İlanlarını İncele &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Aday Havuzu & Değerlendirme</h1>
        <p className="text-zinc-400 mt-2 text-sm">Sistemde kayıtlı adayları ve AI tarafından çıkarılan kanıt raporlarını inceleyin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold text-white">Aday Listesi</h2>
          {loading ? (
            <p className="text-zinc-400 text-sm">Yükleniyor...</p>
          ) : candidates.length === 0 ? (
            <p className="text-zinc-500 text-sm">Kayıtlı aday bulunamadı.</p>
          ) : (
            <div className="grid gap-4">
              {candidates.map((c) => (
                <div key={c.external_id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 flex justify-between items-center hover:border-zinc-700 transition">
                  <div>
                    <h3 className="font-medium text-lg text-white">{c.name}</h3>
                    <p className="text-xs text-zinc-500 font-mono">{c.external_id}</p>
                  </div>
                  <Link href={`/candidates/${c.external_id}`} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition">
                    📊 Rapor & Kanıtlar &rarr;
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 sticky top-8 space-y-4">
            <h2 className="text-xl font-semibold text-white">Manuel Aday Ekle</h2>
            {error && <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-lg text-xs">{error}</div>}
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Aday ID (External ID)</label>
                <input
                  type="text"
                  required
                  value={newExternalId}
                  onChange={(e) => setNewExternalId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Örn: cand_001"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Aday Adı & Soyadı</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Örn: Jane Doe"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg text-xs transition disabled:opacity-50"
              >
                {submitting ? "Ekleniyor..." : "Aday Ekle"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
