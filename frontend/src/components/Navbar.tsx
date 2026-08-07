"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";

// Same wording as the /hesap page — the badge and the account screen must
// call the same role by the same Turkish name.
const ROLE_LABELS: Record<string, string> = {
  employer: "İşveren",
  candidate: "Aday",
  admin: "Yönetici",
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  const isCandidate = user?.role === "candidate";
  const isAdmin = user?.role === "admin";

  const linkCls =
    "text-fg-soft hover:text-fg transition-colors font-medium rounded-sm";

  return (
    <nav className="sticky top-0 z-40 border-b border-line bg-ground/90 backdrop-blur-md">
      <div className="container mx-auto p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-fg hover:text-brand-strong transition-colors"
        >
          <SealMark className="w-7 h-7 shrink-0" />
          <span className="font-semibold tracking-tight text-lg leading-none">
            EİP
            <span className="hidden sm:inline text-fg-mute font-normal text-sm">
              {" "}
              — Evidence Intelligence Platform
            </span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          {/* Always visible */}
          <Link href="/jobs" className={linkCls}>
            İş İlanları
          </Link>

          {/* Employer links */}
          {isEmployer && (
            <>
              <Link
                href="/employer/dashboard"
                className="text-brand hover:text-brand-strong transition-colors font-medium rounded-sm"
              >
                İşveren Paneli
              </Link>
              <Link href="/candidates" className={linkCls}>
                Aday Havuzu
              </Link>
              <Link href="/requirements" className={linkCls}>
                Gereksinimler
              </Link>
            </>
          )}

          {/* Admin links */}
          {isAdmin && (
            <Link
              href="/admin/moderation"
              className="text-brand hover:text-brand-strong transition-colors font-medium rounded-sm"
            >
              Moderasyon
            </Link>
          )}

          {/* Candidate links */}
          {isCandidate && (
            <Link
              href="/candidate/hub"
              className="text-brand hover:text-brand-strong transition-colors font-medium rounded-sm"
            >
              Aday Paneli
            </Link>
          )}

          {/* Auth section */}
          {user ? (
            <div className="flex flex-wrap items-center gap-3 md:pl-4 md:border-l md:border-line">
              <div className="flex items-center gap-2">
                <span className="text-xs text-fg-soft">{user.email}</span>
                <span
                  className={`badge uppercase tracking-wider ${
                    isEmployer
                      ? "bg-brand/10 text-brand border-brand/30"
                      : "bg-ok/10 text-ok border-ok/30"
                  }`}
                >
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </div>
              <Link
                href="/hesap"
                className="text-xs font-semibold text-fg-soft hover:text-fg transition-colors rounded-sm"
              >
                Hesap
              </Link>
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-md border border-line-strong text-xs font-semibold text-fg-soft hover:text-fg hover:border-brand transition-colors"
              >
                Çıkış Yap
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 md:pl-4 md:border-l md:border-line">
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs font-semibold text-fg-soft hover:text-fg transition-colors rounded-sm"
              >
                Giriş Yap
              </Link>
              <Link
                href="/register"
                className="px-3.5 py-1.5 rounded-md bg-brand text-brand-ink text-xs font-semibold hover:bg-brand-strong transition-colors"
              >
                Hesap Oluştur
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
