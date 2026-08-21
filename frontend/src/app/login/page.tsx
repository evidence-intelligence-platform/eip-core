"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, loading: authLoading, login } = useAuth();
  const router = useRouter();

  // A signed-in user landing here (stale bookmark, back button) should not
  // be shown a login form for the account they're already in — send them
  // to their panel instead of letting a resubmit silently swap sessions.
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
  // in flight — rendering the form would flash a login screen at someone who
  // is signed in; hold a brief wait state instead.
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
      const profile = await login(email, password);
      // Route by role: a job seeker landing on the employer dashboard hits a
      // "this area is for employers" wall right after signing in — and an
      // admin landing on the candidate hub gets a screen that cannot work
      // without a candidate record. Their home is the moderation panel.
      router.push(
        profile.role === "admin"
          ? "/admin/moderation"
          : profile.role === "employer"
          ? "/employer/dashboard"
          : "/candidate/hub"
      );
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
          ["--aurora-dur" as string]: "21s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 14%, transparent), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob -bottom-16 -left-14 w-56 h-56 -z-10"
        aria-hidden="true"
        style={{
          ["--aurora-dur" as string]: "27s",
          animationDelay: "-9s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand-strong) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="card border-gradient card-glow p-8 space-y-6 animate-fade-in-up">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <h1 className="text-title text-fg">
          Giriş Yap
        </h1>
        <p className="text-sm text-fg-soft">
          Hesabınıza girerek başvurularınızı ve ilanlarınızı yönetin.
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
            htmlFor="giris-eposta"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
          >
            E-posta Adresi
          </label>
          <input
            id="giris-eposta"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@sirket.com"
            className="field"
          />
        </div>

        <div>
          <label
            htmlFor="giris-sifre"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
          >
            Şifre
          </label>
          <input
            id="giris-sifre"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="field"
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-brand btn-shine w-full">
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>

        <div className="text-right">
          <Link
            href="/sifremi-unuttum"
            className="text-xs text-fg-mute hover:text-brand hover:underline transition-colors"
          >
            Şifremi unuttum
          </Link>
        </div>
      </form>

      {/* Why we ask, what we never do */}
      <p className="text-xs text-fg-mute leading-relaxed text-center">
        E-postanızı yalnızca hesabınıza girmeniz ve başvuru durumlarınızı
        görmeniz için kullanırız. Şifreniz şifrelenerek saklanır; belgeleriniz
        onayınız olmadan kimseye gösterilmez.
      </p>

      <div className="text-center text-xs text-fg-mute pt-2 border-t border-line">
        Hesabınız yok mu?{" "}
        <Link
          href="/register"
          className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
        >
          Hesap oluştur
        </Link>
      </div>
      </div>
    </div>
  );
}
