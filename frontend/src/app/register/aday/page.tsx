"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";

export default function CandidateRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await register(email, password, "candidate", fullName);
      router.push("/candidate/hub");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Kayıt tamamlanamadı. Lütfen bilgilerinizi kontrol edin.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 card border-gradient card-glow p-8 space-y-6 animate-fade-in-up">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <span className="badge bg-ok/10 text-ok border-ok/30 uppercase tracking-wider">
          Aday
        </span>
        <h1 className="text-2xl font-semibold text-fg tracking-tight">
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
          {loading ? "Hesap oluşturuluyor…" : "Hesap Oluştur"}
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
            Giriş Yap
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
  );
}
