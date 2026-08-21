"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";
import { PersonIcon } from "@/components/CategoryIcon";
import { ApiError } from "@/lib/api";

export default function CandidateRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, loading: authLoading, register } = useAuth();
  const router = useRouter();

  // A signed-in candidate (or any signed-in user) landing here — e.g. a
  // stale bookmark, shared link, or browser back/forward — should not see a
  // fresh signup form: submitting it would silently create a new account
  // and overwrite their current session. Mirrors register/isveren.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(
        user.role === "admin"
          ? "/admin/moderation"
          : user.role === "employer"
          ? "/employer/dashboard"
          : "/candidate/hub"
      );
    }
  }, [authLoading, user, router]);

  // While the session is being restored — or the redirect above is already
  // in flight — rendering the form would flash a signup screen at someone
  // who is signed in; hold a brief wait state instead.
  if (authLoading || user) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <SealMark className="w-12 h-12 opacity-80 animate-float" />
        <div role="status" className="flex items-center gap-2 text-fg-mute text-sm">
          <span
            className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin"
            aria-hidden="true"
          />
          {user ? "Yönlendiriliyorsunuz…" : "Yükleniyor…"}
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await register(email, password, "candidate", fullName);
      router.push("/candidate/hub");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // fetch() itself rejected (offline, DNS, dropped connection, CORS) —
        // the thrown TypeError's English message must never reach the UI.
        setError("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative max-w-md mx-auto my-12">
      <div
        className="aurora-blob -top-16 -right-14 w-64 h-64 -z-10"
        aria-hidden="true"
        style={{
          ["--aurora-dur" as string]: "20s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--ok) 14%, transparent), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob -bottom-16 -left-14 w-56 h-56 -z-10"
        aria-hidden="true"
        style={{
          ["--aurora-dur" as string]: "28s",
          animationDelay: "-8s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 8%, transparent), transparent 70%)",
        }}
      />
      <div className="card border-gradient card-glow p-8 space-y-6 animate-fade-in-up">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <span className="badge bg-ok/10 text-ok border-ok/30 uppercase tracking-wider">
          Aday
        </span>
        <PersonIcon className="w-8 h-8 text-ok mx-auto" />
        <h1 className="text-title text-fg">
          Aday Hesabı Oluştur
        </h1>
        <p className="text-sm text-fg-soft">
          Belgelerinizle başvurmaya başlayın.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-err/10 border border-err/30 text-err text-sm rounded-md text-center"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="kayit-ad-soyad"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
          >
            Ad Soyad
          </label>
          <input
            id="kayit-ad-soyad"
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ayşe Yılmaz"
            className="field"
          />
        </div>

        <div>
          <label
            htmlFor="kayit-eposta"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
          >
            E-posta Adresi
          </label>
          <input
            id="kayit-eposta"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ayse@gmail.com"
            className="field"
          />
        </div>

        <div>
          <label
            htmlFor="kayit-sifre"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
          >
            Şifre
          </label>
          <input
            id="kayit-sifre"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-describedby="sifre-kurali"
            className="field"
          />
          <p id="sifre-kurali" className="mt-1.5 text-xs text-fg-mute">
            En az 8 karakter olmalı.
          </p>
        </div>

        <button type="submit" disabled={loading} className="btn btn-brand btn-shine w-full">
          {loading ? "Hesap oluşturuluyor…" : "Hesap oluştur"}
        </button>
      </form>

      <p className="text-xs text-fg-mute leading-relaxed text-center">
        Adınızı ve e-postanızı yalnızca hesabınızı yönetmek için isteriz.
        Hesap açarak{" "}
        <Link
          href="/kullanim-sartlari"
          className="underline underline-offset-2 hover:text-fg-soft transition-colors"
        >
          Kullanım Şartları
        </Link>
        &apos;nı kabul etmiş olursunuz. Belge yüklemek her zaman ayrıca
        onayınıza bağlıdır ve bu onayı{" "}
        <Link
          href="/kvkk"
          className="underline underline-offset-2 hover:text-fg-soft transition-colors"
        >
          KVKK metninde
        </Link>{" "}
        yazdığı gibi geri çekebilirsiniz.
      </p>

      <div className="text-center text-xs text-fg-mute pt-2 border-t border-line space-y-2">
        <p>
          Zaten hesabınız var mı?{" "}
          <Link
            href="/login"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            Giriş yap
          </Link>
        </p>
        <p>
          İşveren misiniz?{" "}
          <Link
            href="/register/isveren"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            İşveren kaydına geçin
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
