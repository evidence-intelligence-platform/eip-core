"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api";
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
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("İstek gönderilemedi. Lütfen tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 card p-8 space-y-6">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <h1 className="text-2xl font-semibold text-fg tracking-tight">
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
            className="p-4 bg-ok/10 border border-ok/30 text-ok text-sm rounded-md text-center leading-relaxed"
          >
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@sirket.com"
                className="field"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-brand w-full">
              {loading ? "Gönderiliyor…" : "Sıfırlama Bağlantısı Gönder"}
            </button>
          </form>

          <div className="text-center text-xs text-fg-mute pt-2 border-t border-line">
            Şifrenizi hatırladınız mı?{" "}
            <Link
              href="/login"
              className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
            >
              Giriş Yap
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
