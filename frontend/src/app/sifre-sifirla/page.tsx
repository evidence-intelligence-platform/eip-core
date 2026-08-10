"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/api";
import { SealMark } from "@/components/illustrations";

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
          className="p-4 bg-ok/10 border border-ok/30 text-ok text-sm rounded-md text-center leading-relaxed"
        >
          Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.
        </div>
        <Link href="/login" className="btn btn-brand w-full text-center block">
          Giriş Yap
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== passwordAgain) {
      setError("Şifreler birbiriyle aynı değil.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await resetPassword(token, password);
      setDone(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Şifre güncellenemedi. Lütfen tekrar deneyin.");
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="En az 8 karakter"
            className="field"
          />
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
            value={passwordAgain}
            onChange={(e) => setPasswordAgain(e.target.value)}
            placeholder="••••••••"
            className="field"
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-brand btn-shine w-full">
          {loading ? "Güncelleniyor…" : "Şifreyi Güncelle"}
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
    <div className="max-w-md mx-auto my-12 card border-gradient card-glow p-8 space-y-6 animate-fade-in-up">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <h1 className="text-2xl font-semibold text-fg tracking-tight">
          Yeni Şifre Belirle
        </h1>
        <p className="text-sm text-fg-soft">
          Hesabınız için yeni bir şifre seçin.
        </p>
      </div>

      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
