"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";
import { BuildingIcon } from "@/components/CategoryIcon";
import { ApiError } from "@/lib/api";

const COMPANY_SIZE_BANDS = ["1-5", "6-20", "21-50", "50+"] as const;

export default function EmployerRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [companySize, setCompanySize] = useState<string>("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, loading: authLoading, register } = useAuth();
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const sizeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // A signed-in employer (or any signed-in user) landing here — e.g. via the
  // "İşveren kaydına geçin" link from the candidate page, or a stale bookmark
  // — should not see a fresh signup form: submitting it would silently create
  // a new account and overwrite their current session. Mirrors register/aday.
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

  // Seven fields put the submit button below the fold on phones, while the
  // alert box lives at the top of the card — when an error lands there,
  // bring it into view and focus it so a sighted user is not left staring
  // at a button that seemingly did nothing.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      errorRef.current?.focus({ preventScroll: true });
    }
  }, [error]);

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
    if (companySize === "") {
      setError("Lütfen çalışan sayısı seçin.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await register(email, password, "employer", fullName, {
        company_name: companyName,
        tax_number: taxNumber,
        company_size: companySize,
        // Omitted (not "") when the field isn't shown — the backend's
        // EmailStr | None accepts a missing value but rejects "" as an
        // invalid address, which made every "1-5 çalışan" signup 422.
        company_email: companySize && companySize !== "1-5" ? companyEmail : undefined,
      });
      router.push("/employer/dashboard");
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

  // Native-radio arrow-key behaviour for the styled band buttons: arrows
  // move (and select, wrapping around) within the group; Tab leaves it.
  const handleSizeKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (index + 1) % COMPANY_SIZE_BANDS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (index - 1 + COMPANY_SIZE_BANDS.length) % COMPANY_SIZE_BANDS.length;
    } else {
      return;
    }
    e.preventDefault();
    setCompanySize(COMPANY_SIZE_BANDS[next]);
    sizeButtonRefs.current[next]?.focus();
  };

  return (
    <div className="relative max-w-md mx-auto my-12">
      <div
        className="aurora-blob -top-16 -right-14 w-64 h-64 -z-10"
        aria-hidden="true"
        style={{
          ["--aurora-dur" as string]: "23s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 15%, transparent), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob -bottom-16 -left-14 w-56 h-56 -z-10"
        aria-hidden="true"
        style={{
          ["--aurora-dur" as string]: "30s",
          animationDelay: "-11s",
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand-strong) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="card border-gradient card-glow p-8 space-y-6 animate-fade-in-up">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <span className="badge bg-brand/10 text-brand border-brand/30 uppercase tracking-wider">
          İşveren
        </span>
        <BuildingIcon className="w-8 h-8 text-brand mx-auto" />
        <h1 className="text-title text-fg">
          İşveren Hesabı Oluştur
        </h1>
        <p className="text-sm text-fg-soft">
          İlan yayınlayıp kanıta bakarak seçin.
        </p>
      </div>

      {error && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
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
            Yetkili Adı Soyadı
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
            Kişisel E-posta Adresiniz
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
          <p className="mt-1.5 text-xs text-fg-mute">
            Kişisel e-postanız yeterli — hesabınız buna bağlıdır.
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-brand/25 bg-brand/5 p-6">
          <p className="text-xs font-semibold text-brand uppercase tracking-wider">
            Şirket Bilgileri
          </p>

          <div>
            <label
              htmlFor="kayit-sirket"
              className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
            >
              Şirket / Kurum Adı
            </label>
            <input
              id="kayit-sirket"
              type="text"
              required
              autoComplete="organization"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Örn: Acme Yazılım A.Ş."
              className="field"
            />
          </div>

          <div>
            <label
              htmlFor="kayit-vergi"
              className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
            >
              Vergi Numarası
            </label>
            <input
              id="kayit-vergi"
              type="text"
              inputMode="numeric"
              required
              minLength={10}
              maxLength={11}
              pattern="[0-9]{10,11}"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value.replace(/\D/g, ""))}
              // The browser's validation bubble speaks English by default;
              // give the length/pattern failure a Turkish sentence and clear
              // it on input so a corrected value can submit.
              onInvalid={(e) => {
                const input = e.currentTarget;
                input.setCustomValidity(
                  input.validity.valueMissing
                    ? ""
                    : "Vergi numarası 10 haneli VKN veya 11 haneli TCKN olmalıdır."
                );
              }}
              onInput={(e) => e.currentTarget.setCustomValidity("")}
              placeholder="10 haneli VKN veya 11 haneli TCKN"
              className="field"
            />
            <p className="mt-1.5 text-xs text-fg-mute">
              Her şirket için zorunlu — ilanlar doğrulanabilir bir tüzel kişiliğe bağlanır.
            </p>
          </div>

          <fieldset className="border-0 p-0 m-0 min-w-0">
            <legend
              id="kayit-calisan-sayisi"
              className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5 p-0"
            >
              Çalışan Sayısı
            </legend>
            {/* Styled buttons carrying real radio semantics: one tab stop
                (roving tabIndex), arrow keys move the selection. */}
            <div
              role="radiogroup"
              aria-labelledby="kayit-calisan-sayisi"
              className="grid grid-cols-4 gap-2"
            >
              {COMPANY_SIZE_BANDS.map((band, index) => (
                <button
                  key={band}
                  ref={(el) => {
                    sizeButtonRefs.current[index] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={companySize === band}
                  tabIndex={
                    companySize === band || (companySize === "" && index === 0)
                      ? 0
                      : -1
                  }
                  onClick={() => setCompanySize(band)}
                  onKeyDown={(e) => handleSizeKeyDown(e, index)}
                  className={`py-2 rounded-md text-xs font-semibold border transition-all active:scale-[0.98] ${
                    companySize === band
                      ? "bg-brand border-brand text-brand-ink"
                      : "bg-well border-line text-fg-soft hover:text-fg hover:border-line-strong"
                  }`}
                >
                  {band}
                </button>
              ))}
            </div>
          </fieldset>

          {companySize && companySize !== "1-5" && (
            <div className="animate-fade-in-up">
              <label
                htmlFor="kayit-kurumsal"
                className="block text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5"
              >
                Kurumsal E-posta
              </label>
              <input
                id="kayit-kurumsal"
                type="email"
                required
                autoComplete="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="ik@sirket.com"
                className="field"
              />
              <p className="mt-1.5 text-xs text-fg-mute">
                5&apos;ten fazla çalışanı olan şirketler için isteniyor.
              </p>
            </div>
          )}
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
        &apos;nı kabul etmiş olursunuz.
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
          İş mi arıyorsunuz?{" "}
          <Link
            href="/register/aday"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            Aday kaydına geçin
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
