"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset, ApiError } from "@/lib/api";
import { SealMark } from "@/components/illustrations";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await requestPasswordReset(email);
      // The backend answers the same way for known and unknown addresses;
      // the UI mirrors that and never confirms whether an account exists.
      setSent(true);
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
          ["--aurora-dur" as string]: "24s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 14%, transparent), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob -bottom-16 -left-14 w-56 h-56 -z-10"
        aria-hidden="true"
        style={{
          ["--aurora-dur" as string]: "31s",
          animationDelay: "-12s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand-strong) 9%, transparent), transparent 70%)",
        }}
      />
      <div className="card border-gradient card-glow p-8 space-y-6 animate-fade-in-up">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <h1 className="text-title text-fg">
          Şifremi Unuttum
        </h1>
        <p className="text-sm text-fg-soft">
          Hesabınızın e-posta adresini girin; size bir şifre sıfırlama
          bağlantısı gönderelim.
        </p>
      </div>

      {sent ? (
        <div className="space-y-4">
          <div
            role="status"
            className="relative p-4 pr-16 bg-ok/10 border border-ok/30 text-ok text-sm rounded-md text-left leading-relaxed overflow-hidden"
          >
            <SealMark
              className="animate-stamp absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 opacity-80 pointer-events-none"
              aria-hidden="true"
            />
            Bu adrese kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı
            gönderildi. Gelen kutunuzu (ve spam klasörünü) kontrol edin —
            bağlantı 30 dakika geçerlidir.
          </div>
          <div className="text-center text-xs text-fg-mute">
            <Link
              href="/login"
              className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
            >
              Girişe dön
            </Link>
          </div>
        </div>
      ) : (
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
                htmlFor="unuttum-eposta"
                className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
              >
                E-posta Adresi
              </label>
              <input
                id="unuttum-eposta"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@sirket.com"
                className="field"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-brand btn-shine w-full">
              {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
            </button>
          </form>

          <div className="text-center text-xs text-fg-mute pt-2 border-t border-line">
            Şifrenizi hatırladınız mı?{" "}
            <Link
              href="/login"
              className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
            >
              Giriş yap
            </Link>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
