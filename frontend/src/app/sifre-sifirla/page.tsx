"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword, ApiError } from "@/lib/api";
import { SealMark } from "@/components/illustrations";

// Kept as a constant so the second field's aria-invalid can key off the
// exact message instead of a duplicated string.
const PASSWORD_MISMATCH = "Şifreler birbiriyle aynı değil.";

/**
 * useSearchParams must live under a Suspense boundary so the rest of the
 * route can still be prerendered (Next.js app router requirement).
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A link without a token cannot succeed; say so instead of showing a form
  // whose submit is doomed.
  if (!token) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="p-4 bg-err/10 border border-err/30 text-err text-sm rounded-md text-center leading-relaxed"
        >
          Şifre sıfırlama bağlantısı eksik veya hatalı. Lütfen e-postanızdaki
          bağlantıya tıklayarak gelin ya da yeni bir bağlantı isteyin.
        </div>
        <div className="text-center text-xs text-fg-mute">
          <Link
            href="/sifremi-unuttum"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            Yeni bağlantı iste
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="relative p-4 pr-16 bg-ok/10 border border-ok/30 text-ok text-sm rounded-md text-left leading-relaxed overflow-hidden"
        >
          <SealMark
            className="animate-stamp absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 opacity-80 pointer-events-none"
            aria-hidden="true"
          />
          Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.
        </div>
        <Link href="/login" className="btn btn-brand w-full text-center block">
          Giriş yap
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== passwordAgain) {
      setError(PASSWORD_MISMATCH);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await resetPassword(token, password);
      setDone(true);
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
    <>
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
            htmlFor="yeni-sifre"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
          >
            Yeni Şifre
          </label>
          <input
            id="yeni-sifre"
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

        <div>
          <label
            htmlFor="yeni-sifre-tekrar"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
          >
            Yeni Şifre (Tekrar)
          </label>
          <input
            id="yeni-sifre-tekrar"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={passwordAgain}
            onChange={(e) => setPasswordAgain(e.target.value)}
            placeholder="••••••••"
            aria-invalid={error === PASSWORD_MISMATCH ? true : undefined}
            className="field"
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-brand btn-shine w-full">
          {loading ? "Güncelleniyor…" : "Şifreyi güncelle"}
        </button>
      </form>

      <p className="text-xs text-fg-mute leading-relaxed text-center">
        Bağlantı 30 dakika geçerlidir ve yalnızca bir kez kullanılabilir.
        Süresi dolduysa yeni bir bağlantı isteyebilirsiniz.
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative max-w-md mx-auto my-12">
      <div
        className="aurora-blob -top-16 -right-14 w-64 h-64 -z-10"
        aria-hidden="true"
        style={{
          ["--aurora-dur" as string]: "25s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 14%, transparent), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob -bottom-16 -left-14 w-56 h-56 -z-10"
        aria-hidden="true"
        style={{
          ["--aurora-dur" as string]: "32s",
          animationDelay: "-13s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand-strong) 9%, transparent), transparent 70%)",
        }}
      />
      <div className="card border-gradient card-glow p-8 space-y-6 animate-fade-in-up">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <h1 className="text-title text-fg">
          Yeni Şifre Belirle
        </h1>
        <p className="text-sm text-fg-soft">
          Hesabınız için yeni bir şifre seçin.
        </p>
      </div>

      <Suspense
        fallback={
          /* Mirror the two-field + button form with the app's skeleton
             shimmer so the card holds its height while useSearchParams
             hydrates — no blank card, no layout jump. */
          <div className="space-y-4" aria-hidden="true">
            <div>
              <div className="skeleton h-3 w-24 mb-2" />
              <div className="skeleton h-11 w-full" />
            </div>
            <div>
              <div className="skeleton h-3 w-36 mb-2" />
              <div className="skeleton h-11 w-full" />
            </div>
            <div className="skeleton h-11 w-full" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
      </div>
    </div>
  );
}
