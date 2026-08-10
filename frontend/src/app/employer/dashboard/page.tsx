"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SELECTABLE_CATEGORIES } from "@/lib/categories";
import {
  getJobs,
  getApplications,
  createJob,
  updateApplicationStatus,
  JobPosting,
  JobApplication,
  ProfessionCategory,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LedgerCheck } from "@/components/illustrations";

export default function EmployerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const isCandidate = user?.role === "candidate";

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Job Form State
  const [jobTitle, setJobTitle] = useState("");
  // Seeded empty: on a hard load `user` is still null here, and a dummy
  // default would get published verbatim on the public /jobs cards. The
  // effect below suggests a name from the account once auth resolves.
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState<string>("OTHER");
  const [description, setDescription] = useState("");
  const [submittingJob, setSubmittingJob] = useState(false);
  const [jobSuccess, setJobSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsData, appsData] = await Promise.all([
        getJobs(),
        getApplications(),
      ]);
      setJobs(jobsData);
      setApplications(appsData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Veriler yüklenemedi.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // AuthProvider restores the bearer token in its own mount effect, which
    // runs *after* this one; fetching while it is still loading would fire
    // the requests without an Authorization header and 401.
    if (authLoading) return;
    fetchData();
  }, [authLoading]);

  // Suggest a company name from the account e-mail once auth resolves,
  // but never overwrite something the employer already typed.
  useEffect(() => {
    if (user?.email) {
      setCompanyName((prev) => prev || user.email.split("@")[0] + " Şirketi");
    }
  }, [user]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle || !companyName || !description) return;

    try {
      setSubmittingJob(true);
      setJobSuccess(null);
      await createJob({
        title: jobTitle,
        company_name: companyName,
        category: category,
        description: description,
        status: "active",
      });
      setJobSuccess("İlanınız yayında. Adaylar artık başvurabilir.");
      setJobTitle("");
      setDescription("");
      await fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setSubmittingJob(false);
    }
  };

  const handleUpdateStatus = async (appId: number, newStatus: "accepted" | "declined") => {
    try {
      await updateApplicationStatus(appId, newStatus);
      await fetchData();
    } catch (err: unknown) {
      // The message never contained "409" — the status lives on ApiError.
      if (err instanceof ApiError && err.status === 409) {
        setError("Bu başvurunun durumu daha önce değiştirilmiş. Lütfen sayfayı yenileyin.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Başvuru durumu güncellenemedi.");
      }
    }
  };

  // Role Guard Notice if a Candidate accidentally lands here
  if (isCandidate) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="card p-8 space-y-4">
          <LedgerCheck className="w-28 h-auto mx-auto" />
          <h1 className="text-2xl font-semibold text-fg tracking-tight">İşveren Paneli</h1>
          <p className="text-sm text-fg-soft leading-relaxed">
            Bu alan işverenlerin yeni iş ilanları yayınladığı ve gelen
            başvuruları değerlendirdiği yönetim panelidir. Aday paneline geçmek
            için aşağıdaki bağlantıyı kullanabilirsiniz.
          </p>
          <div className="pt-2 flex justify-center">
            <Link href="/candidate/hub" className="btn btn-brand btn-shine text-xs">
              Aday Paneline Git
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative max-w-6xl mx-auto py-10 px-2 sm:px-4 space-y-8">
      {/* Same quiet brand tint the landing and jobs pages open with */}
      <div
        className="absolute inset-x-0 top-0 h-[20rem] -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 70% at 50% 0%, color-mix(in oklab, var(--brand) 6%, transparent), transparent 70%)",
        }}
        aria-hidden="true"
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6">
        <div className="space-y-1">
          <p className="eyebrow">İşveren Paneli</p>
          <h1 className="text-title text-fg">İlanlar ve başvurular</h1>
          <p className="text-fg-mute text-sm">
            Giriş yapan:{" "}
            <span className="font-medium text-fg-soft">
              {user?.email || "İşveren Kullanıcı"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/candidates" className="btn btn-quiet text-xs px-4 py-2.5">
            Aday Havuzu &amp; Raporlar
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 bg-err/10 border border-err/30 text-err text-sm rounded-md"
        >
          {error}
        </div>
      )}

      {/* Quiet guidance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            t: "Nitelikleri net yazın",
            b: "İlanda aradığınız deneyim ve sertifikaları açıkça belirtin; adayların belgeleri bu kriterlerle karşılaştırılır.",
          },
          {
            t: "Gerekçeli raporu inceleyin",
            b: "Her adayın raporunda hangi yeterliliğin hangi belgeye dayandığı madde madde yazar.",
          },
          {
            t: "Kararı siz verin",
            b: "Rapor bir öneridir, hüküm değil. Başvuruyu kabul veya reddetmek her zaman sizin elinizde.",
          },
        ].map((tip, i) => (
          <div key={tip.t} className="card p-4 flex gap-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-brand/40 text-brand text-xs font-semibold tabular-nums shrink-0">
              {i + 1}
            </span>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-fg">{tip.t}</p>
              <p className="text-xs text-fg-mute leading-relaxed">{tip.b}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Employer Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Create New Job Posting Section (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="card p-7 space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-lg font-semibold text-fg tracking-tight">
                Yeni İş İlanı Yayınla
              </h2>
              <span className="badge bg-ok/10 text-ok border-ok/30 uppercase tracking-wider">
                Anında yayında
              </span>
            </div>

            {jobSuccess && (
              <div className="p-3.5 bg-ok/10 border border-ok/30 text-ok text-xs rounded-md font-medium">
                {jobSuccess}
              </div>
            )}

            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label
                  htmlFor="ilan-sirket"
                  className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                >
                  Şirket / Kurum Adı
                </label>
                <input
                  id="ilan-sirket"
                  type="text"
                  required
                  disabled={submittingJob}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Örn: Acme Sağlık A.Ş."
                  className="field text-xs"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="ilan-baslik"
                    className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                  >
                    Pozisyon Başlığı
                  </label>
                  <input
                    id="ilan-baslik"
                    type="text"
                    required
                    disabled={submittingJob}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Örn: Kıdemli Uzman Doktor / Makam Şoförü"
                    className="field text-xs"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ilan-sektor"
                    className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                  >
                    Meslek Sektörü
                  </label>
                  <select
                    id="ilan-sektor"
                    value={category}
                    disabled={submittingJob}
                    onChange={(e) => setCategory(e.target.value as ProfessionCategory)}
                    className="field text-xs"
                  >
                    {SELECTABLE_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ilan-tanim"
                  className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
                >
                  İlan Tanımı &amp; Aranan Nitelikler
                </label>
                <textarea
                  id="ilan-tanim"
                  required
                  rows={5}
                  disabled={submittingJob}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Pozisyonun detaylarını, aranan sertifikaları, çalışma şartlarını ve beklentilerinizi ayrıntılı yazın…"
                  className="field text-xs leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={submittingJob}
                className="btn btn-brand btn-shine w-full text-xs"
              >
                {submittingJob ? "İlan yayınlanıyor…" : "İlanı Yayınla"}
              </button>
            </form>
          </div>
        </div>

        {/* Active Applications Review & Approval Panel (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-semibold text-fg tracking-tight">
                Gelen Başvurular
              </h2>
              <span className="badge bg-raised text-fg-soft border-line-strong tabular-nums">
                {applications.length} başvuru
              </span>
            </div>

            {loading ? (
              <p className="text-xs text-fg-mute">Başvurular yükleniyor…</p>
            ) : applications.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-xs text-fg-mute">
                  Henüz ilanlarınıza başvuran aday bulunmuyor.
                </p>
                <p className="text-[11px] text-fg-mute">
                  Adaylar başvurdukça burada listelenecek.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {applications.map((app) => (
                  <div key={app.id} className="card card-lift bg-well p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-fg tabular-nums">
                        Başvuru #{app.id}
                      </span>
                      <span
                        className={`badge uppercase tracking-wider ${
                          app.status === "accepted"
                            ? "bg-ok/10 text-ok border-ok/30"
                            : app.status === "declined"
                            ? "bg-err/10 text-err border-err/30"
                            : "bg-warn/10 text-warn border-warn/30"
                        }`}
                      >
                        {app.status === "accepted"
                          ? "Kabul edildi"
                          : app.status === "declined"
                          ? "Reddedildi"
                          : "Değerlendiriliyor"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center gap-3 text-xs">
                      {/* The name and identity now come from the API; building
                          "cand_{id}" here pointed at a record that never existed. */}
                      <span className="text-fg-soft font-medium truncate">
                        {app.candidate_name || `Aday #${app.candidate_id}`}
                      </span>
                      {app.candidate_external_id ? (
                        <Link
                          href={`/reports/${app.candidate_external_id}`}
                          className="text-brand hover:text-brand-strong hover:underline font-semibold shrink-0 transition-colors"
                        >
                          Raporu incele &rarr;
                        </Link>
                      ) : (
                        <span className="text-fg-mute shrink-0">Rapor hazır değil</span>
                      )}
                    </div>

                    {/* Status Update Buttons */}
                    {/* "pending" is not a status the backend ever produces —
                        new applications default to "submitted". */}
                    {["submitted", "pending", "reviewing"].includes(app.status) &&
                      // Gated on the backend's ownership signal, not status
                      // alone: employers also see applications into ownerless
                      // (pre-ownership) postings, and deciding those always
                      // 403s — showing the buttons was a dead-end.
                      (app.decidable !== false ? (
                        <div className="flex items-center gap-2 pt-2 border-t border-line">
                          <button
                            onClick={() => handleUpdateStatus(app.id!, "accepted")}
                            className="flex-1 py-1.5 bg-ok/10 hover:bg-ok/20 border border-ok/30 text-ok rounded-md text-[11px] font-semibold transition-colors"
                          >
                            Kabul Et
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(app.id!, "declined")}
                            className="flex-1 py-1.5 bg-err/10 hover:bg-err/20 border border-err/30 text-err rounded-md text-[11px] font-semibold transition-colors"
                          >
                            Reddet
                          </button>
                        </div>
                      ) : (
                        <p className="pt-2 border-t border-line text-[11px] text-fg-mute leading-relaxed">
                          Bu ilanın kayıtlı bir işvereni olmadığından başvuruyu
                          yalnızca sistem yöneticisi karara bağlayabilir.
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
