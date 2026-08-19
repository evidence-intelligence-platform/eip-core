"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";
import { PersonIcon, BuildingIcon } from "@/components/CategoryIcon";

/** Registration gate — the fork between the two platforms. Everything past
    this screen (form fields, redirect target, dashboard) is persona-specific;
    this page's only job is to send the visitor down the right path. */
export default function RegisterGatePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // A signed-in visitor landing here should be sent to their own panel
  // rather than being offered a fork into forms that would overwrite their
  // session if submitted. Mirrors the guard on the two persona-specific pages.
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

  return (
    <div className="max-w-2xl mx-auto my-12 space-y-8 animate-fade-in-up">
      <div className="text-center space-y-3">
        <SealMark className="w-10 h-10 mx-auto" />
        <h1 className="text-2xl font-semibold text-fg tracking-tight">
          Hesap Oluştur
        </h1>
        <p className="text-sm text-fg-soft">
          İki ayrı platform, tek kanıt kaydı. Hangi taraftasınız?
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Link
          href="/register/aday"
          className="card card-glow card-lift p-7 space-y-3 text-left group"
        >
          <span className="badge bg-ok/10 text-ok border-ok/30 uppercase tracking-wider">
            Aday
          </span>
          <PersonIcon className="w-8 h-8 text-ok" />
          <h2 className="text-lg font-semibold text-fg tracking-tight">
            İş Arıyorum
          </h2>
          <p className="text-sm text-fg-soft leading-relaxed">
            Belgelerimle başvuracağım.
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok group-hover:gap-2 transition-all">
            Aday olarak devam et <span aria-hidden="true">&rarr;</span>
          </span>
        </Link>

        <Link
          href="/register/isveren"
          className="card card-glow card-lift p-7 space-y-3 text-left group"
        >
          <span className="badge bg-brand/10 text-brand border-brand/30 uppercase tracking-wider">
            İşveren
          </span>
          <BuildingIcon className="w-8 h-8 text-brand" />
          <h2 className="text-lg font-semibold text-fg tracking-tight">
            İşe Alım Yapacağım
          </h2>
          <p className="text-sm text-fg-soft leading-relaxed">
            İlan yayınlayıp kanıta bakarak seçeceğim.
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand group-hover:gap-2 transition-all">
            İşveren olarak devam et <span aria-hidden="true">&rarr;</span>
          </span>
        </Link>
      </div>

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
