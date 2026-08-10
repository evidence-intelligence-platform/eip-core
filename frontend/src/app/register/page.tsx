"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Most visitors are job seekers, and the engine's own default is
  // "candidate" — the form should greet the majority with the right side
  // already chosen.
  const [role, setRole] = useState<"employer" | "candidate">("candidate");
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
      await register(email, password, role, fullName);
      if (role === "employer") {
        router.push("/employer/dashboard");
      } else {
        router.push("/candidate/hub");
      }
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
        <h1 className="text-2xl font-semibold text-fg tracking-tight">
          Hesap Oluştur
        </h1>
        <p className="text-sm text-fg-soft">
          İş arıyorsanız kanıtlarınızı yükleyin, işveren iseniz ilan yayınlayın.
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
          {/* Not a <label>: it has no single control to point at. The id ties
              the caption to the button group so screen readers announce it,
              and aria-pressed says which side is selected — color alone did
              not survive the trip through assistive technology. */}
          <span
            id="hesap-turu-etiket"
            className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-2"
          >
            Hesap Türü
          </span>
          <div
            role="group"
            aria-labelledby="hesap-turu-etiket"
            className="grid grid-cols-2 gap-3"
          >
            {(
              [
                {
                  value: "candidate",
                  icon: "🧑‍🔧",
                  title: "İş Arıyorum",
                  hint: "Belgemle başvuracağım",
                },
                {
                  value: "employer",
                  icon: "🏢",
                  title: "İşveren / İlan Veren",
                  hint: "Kanıta bakarak seçeceğim",
                },
              ] as const
            ).map((opt) => {
              const active = role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRole(opt.value)}
                  className={`rounded-md border p-3.5 text-left space-y-1 transition-all duration-200 ${
                    active
                      ? "bg-brand/10 border-brand text-fg shadow-lg shadow-brand/10 scale-[1.02]"
                      : "bg-well border-line text-fg-soft hover:text-fg hover:border-line-strong"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden="true">{opt.icon}</span>
                    {opt.title}
                    {active && (
                      <span className="ml-auto text-brand" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] leading-snug text-fg-mute">
                    {opt.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

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
            placeholder="ayse@sirket.com"
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

      {/* Why we ask, what we never do */}
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

      <div className="text-center text-xs text-fg-mute pt-2 border-t border-line">
        Zaten hesabınız var mı?{" "}
        <Link
          href="/login"
          className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
        >
          Giriş Yap
        </Link>
      </div>
    </div>
  );
}
