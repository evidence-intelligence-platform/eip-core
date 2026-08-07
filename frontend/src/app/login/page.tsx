"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuth();
  const router = useRouter();

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
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("E-posta veya şifre hatalı.");
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="field"
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-brand w-full">
          {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>
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
          Hesap Oluştur
        </Link>
      </div>
    </div>
  );
}
