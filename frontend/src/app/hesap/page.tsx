"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { deleteMyAccount, exportMyData, ApiError, type DataExportCategory } from "@/lib/api";
import { SealMark, IconKvkk } from "@/components/illustrations";

const ROLE_LABELS: Record<string, string> = {
  employer: "İşveren",
  candidate: "Aday",
  admin: "Yönetici",
};

/** The user must type this to arm the delete button. Compared with a
 *  Turkish-locale uppercase so "sil" also counts — a QWERTY layout cannot
 *  produce the dotted İ, and the flow must not silently lock those users out.
 *  toLocaleUpperCase("tr-TR") only re-maps *lowercase* i → İ on the way up;
 *  an already-uppercase ASCII "I" (what Shift+I types on any layout) passes
 *  through unchanged, so typing "SIL" failed silently. The trailing replace
 *  folds that leftover ASCII I onto İ after the locale uppercasing runs. */
const CONFIRM_WORD = "SİL";

/** What the confirmation shows after a successful download — the document
 *  itself is handed to the browser, never rendered, so only this tally of it
 *  and the engine's own notes stay on screen. */
interface ExportSummary {
  fileName: string;
  categoryCount: number;
  recordCount: number;
  notes: string[];
}

/** Names the file by the export's own moment, in the reader's local time.
 *  toISOString() would stamp yesterday's date for anyone east of UTC after
 *  midnight; an unparseable timestamp falls back to now rather than "NaN". */
function exportFileName(exportedAt: string): string {
  const parsed = new Date(exportedAt);
  const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `eip-verilerim-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export default function HesapPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Guard: any logged-in role may view; visitors go to /login. The `deleted`
  // flag matters because logout() clears the user while the goodbye screen
  // is still on — without it, the goodbye would bounce to the login page.
  useEffect(() => {
    if (!authLoading && !user && !deleted) {
      router.replace("/login");
    }
  }, [authLoading, user, deleted, router]);

  // After the goodbye has had a moment to land, go home quietly.
  useEffect(() => {
    if (!deleted) return;
    const t = setTimeout(() => router.push("/"), 6000);
    return () => clearTimeout(t);
  }, [deleted, router]);

  const confirmed =
    confirmText.trim().toLocaleUpperCase("tr-TR").replace(/I/g, "İ") === CONFIRM_WORD;

  const handleExport = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      setExportError(null);
      setExportSummary(null);

      const doc = await exportMyData();
      const fileName = exportFileName(doc.exported_at);

      const url = URL.createObjectURL(
        new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      // Firefox only honours the download for a link that is in the document.
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking in the same tick cancels the download the click just started
      // in some browsers, so hand the URL back on the next one instead.
      setTimeout(() => URL.revokeObjectURL(url), 0);

      // The payload is the engine's to shape and carries no runtime
      // validation, so nothing here assumes the header arrived intact.
      const categories: DataExportCategory[] = Array.isArray(doc.categories)
        ? doc.categories
        : [];
      const notes: unknown[] = Array.isArray(doc.notes) ? doc.notes : [];
      setExportSummary({
        fileName,
        categoryCount: categories.length,
        recordCount: categories.reduce(
          (total, c) => total + (typeof c.count === "number" ? c.count : 0),
          0
        ),
        notes: notes.filter(
          (n): n is string => typeof n === "string" && n.trim() !== ""
        ),
      });
    } catch (err: unknown) {
      // Same rule as the delete flow: only ApiError carries Turkish wording.
      setExportError(
        err instanceof ApiError
          ? err.message
          : "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
      );
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed || deleting) return;
    try {
      setDeleting(true);
      setError(null);
      await deleteMyAccount();
      // Order matters: mark deleted first so the guard above does not
      // redirect to /login the instant logout() clears the user.
      setDeleted(true);
      logout();
    } catch (err: unknown) {
      // fetch() itself rejecting (offline, DNS, dropped connection, CORS)
      // throws a plain TypeError whose raw English message must never reach
      // the UI — only ApiError carries a message we've already localized.
      setError(
        err instanceof ApiError
          ? err.message
          : "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
      );
    } finally {
      setDeleting(false);
    }
  };

  // Calm goodbye — no confetti, no guilt trip. Just confirmation and an exit.
  if (deleted) {
    return (
      <div className="max-w-md mx-auto my-16 card p-8 text-center space-y-5 animate-fade-in-up">
        <SealMark className="animate-stamp w-12 h-12 mx-auto" />
        <h1 className="text-2xl font-semibold text-fg tracking-tight">
          Hesabınız silindi
        </h1>
        <p className="text-sm text-fg-soft leading-relaxed">
          Belgeleriniz, başvurularınız ve değerlendirme kayıtlarınız sistemden
          kaldırıldı. Bize güvendiğiniz için teşekkür ederiz — yolunuz açık
          olsun.
        </p>
        <p className="text-xs text-fg-mute">
          Birazdan ana sayfaya yönlendirileceksiniz.
        </p>
        <Link href="/" className="btn btn-quiet btn-sm">
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  // While auth resolves (or a visitor is being redirected), hold quietly
  // instead of flashing account content.
  if (authLoading || !user) {
    return (
      <div className="max-w-md mx-auto my-16 card p-8 text-center space-y-4 animate-fade-in-up">
        <SealMark className="w-10 h-10 mx-auto" />
        <p className="text-sm text-fg-soft">Hesap bilgileriniz doğrulanıyor…</p>
      </div>
    );
  }

  const isEmployerish = user.role === "employer" || user.role === "admin";

  return (
    <div className="max-w-2xl mx-auto py-12 space-y-8 animate-fade-in-up">
      <header className="space-y-1 border-b border-line pb-6">
        <p className="eyebrow">Hesap</p>
        <h1 className="text-title text-fg">Hesabınız</h1>
        <p className="text-sm text-fg-mute">
          Bilgileriniz, verileriniz ve hesabınız üzerindeki haklarınız.
        </p>
      </header>

      {/* Account info */}
      <section className="card p-7 space-y-4">
        <h2 className="text-sm font-semibold text-fg tracking-tight">
          Hesap bilgileri
        </h2>
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <dt className="text-fg-mute">E-posta</dt>
            <dd className="font-medium text-fg-soft break-all">{user.email}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <dt className="text-fg-mute">Hesap türü</dt>
            <dd>
              <span
                className={`badge uppercase tracking-wider ${
                  isEmployerish
                    ? "bg-brand/10 text-brand border-brand/30"
                    : "bg-ok/10 text-ok border-ok/30"
                }`}
              >
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {/* Your data, in one breath */}
      <section className="card p-7 space-y-4">
        <div className="flex items-center gap-3">
          <IconKvkk className="w-8 h-8 shrink-0" />
          <h2 className="text-sm font-semibold text-fg tracking-tight">
            Verileriniz
          </h2>
        </div>
        <p className="text-sm text-fg-soft leading-relaxed">
          Belgeleriniz yalnızca başvurduğunuz ilanların değerlendirilmesi için
          işlenir; reklam için kullanılmaz, üçüncü kişilere satılmaz. Hesabınız
          açık kaldığı sürece saklanır, hesabınızı sildiğinizde tamamen
          silinir.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <Link
            href="/kvkk"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            KVKK Aydınlatma Metni &rarr;
          </Link>
          <Link
            href="/kullanim-sartlari"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            Kullanım Şartları &rarr;
          </Link>
        </div>
      </section>

      {/* Portability sits before erasure on purpose: taking a copy is the
          harmless half of the same right, and nobody should have to walk past
          the delete box to find it. */}
      <section className="card p-7 space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-fg tracking-tight">
            Verilerimi indir
          </h2>
          <p className="text-sm text-fg-soft leading-relaxed">
            KVKK md. 11 kapsamında, hakkınızda tuttuğumuz kayıtların tamamını
            tek bir dosya olarak indirebilirsiniz: hesap bilgileriniz, aday
            profiliniz, kanıt kayıtlarınız, başvurularınız, raporlarınız ve
            onay geçmişiniz. Yüklediğiniz belgelerin içeriği bu dosyada yer
            almaz; yalnızca dosya adı, türü ve tarihi gibi üst veriler bulunur.
          </p>
        </div>

        {exportError && (
          <div
            role="alert"
            className="p-3 bg-err/10 border border-err/30 text-err text-sm rounded-md"
          >
            {exportError}
          </div>
        )}

        {exportSummary && (
          <div
            role="status"
            className="p-3 bg-ok/10 border border-ok/30 rounded-md space-y-2"
          >
            <p className="text-xs font-medium text-ok break-all">
              Dosyanız indirildi: {exportSummary.fileName}
            </p>
            <p className="text-xs text-fg-soft">
              {exportSummary.categoryCount} kategoride toplam{" "}
              {exportSummary.recordCount} kayıt aktarıldı. Dosya, tarayıcınızın
              indirilenler klasöründe.
            </p>
            {exportSummary.notes.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-xs text-fg-mute leading-relaxed">
                {exportSummary.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-quiet w-full sm:w-auto"
          >
            {exporting
              ? "Dosyanız hazırlanıyor…"
              : exportSummary
                ? "Yeniden indir"
                : "Verilerimi indir"}
          </button>
          {exporting && (
            <span
              role="status"
              className="flex items-center gap-2 text-xs text-fg-mute"
            >
              <span
                aria-hidden="true"
                className="w-3.5 h-3.5 border-2 border-brand/30 border-t-brand rounded-full animate-spin"
              />
              Kayıtlarınız derleniyor, birkaç saniye sürebilir.
            </span>
          )}
        </div>
      </section>

      {/* Danger zone — visually apart from everything above */}
      <section className="rounded-lg border border-err/30 bg-err/5 p-7 space-y-5">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-err tracking-tight">
            Hesabımı kalıcı olarak sil
          </h2>
          <p className="text-sm text-fg-soft leading-relaxed">
            Bu işlem geri alınamaz. Hesabınızla birlikte yüklediğiniz belgeler,
            başvurularınız ve değerlendirme kayıtlarınız kalıcı olarak silinir.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 bg-err/10 border border-err/30 text-err text-sm rounded-md"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleDelete} className="space-y-3">
          <label
            htmlFor="sil-onay"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider"
          >
            Onaylamak için kutuya{" "}
            <span className="text-err">{CONFIRM_WORD}</span> yazın
          </label>
          <input
            id="sil-onay"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            disabled={deleting}
            className="field max-w-xs"
          />
          <div>
            <button
              type="submit"
              disabled={!confirmed || deleting}
              className="btn bg-err/15 text-err enabled:hover:bg-err/25 w-full sm:w-auto"
            >
              {deleting ? "Hesabınız siliniyor…" : "Hesabımı kalıcı olarak sil"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
