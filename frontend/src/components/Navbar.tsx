"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { SealMark } from "@/components/illustrations";

// Same wording as the /hesap page — the badge and the account screen must
// call the same role by the same Turkish name.
const ROLE_LABELS: Record<string, string> = {
  employer: "İşveren",
  candidate: "Aday",
  admin: "Yönetici",
};

/** Nav link with an animated brass underline on hover and on the active route. */
function NavLink({
  href,
  children,
  accent = false,
}: {
  href: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative pb-0.5 font-medium rounded-sm transition-colors ${
        accent
          ? "text-brand hover:text-brand-strong"
          : active
          ? "text-fg"
          : "text-fg-soft hover:text-fg"
      }`}
    >
      {children}
      <span
        aria-hidden="true"
        className={`absolute left-0 -bottom-0.5 h-px bg-brand transition-all duration-300 ${
          active ? "w-full" : "w-0"
        }`}
      />
    </Link>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  const isCandidate = user?.role === "candidate";
  const isAdmin = user?.role === "admin";

  // A hairline of depth once the page moves — the bar reads as "floating"
  // over content instead of being part of it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-40 border-b bg-ground/90 backdrop-blur-md transition-shadow duration-300 ${
        scrolled
          ? "border-line-strong shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)]"
          : "border-line"
      }`}
    >
      <div className="container mx-auto p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-fg hover:text-brand-strong transition-colors group"
        >
          <SealMark className="w-7 h-7 shrink-0 transition-transform duration-500 group-hover:rotate-[20deg]" />
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
          <NavLink href="/jobs">İş İlanları</NavLink>

          {/* Employer links */}
          {isEmployer && (
            <>
              <NavLink href="/employer/dashboard" accent>
                İşveren Paneli
              </NavLink>
              <NavLink href="/candidates">Aday Havuzu</NavLink>
              <NavLink href="/requirements">Gereksinimler</NavLink>
            </>
          )}

          {/* Admin links */}
          {isAdmin && (
            <NavLink href="/admin/moderation" accent>
              Moderasyon
            </NavLink>
          )}

          {/* Candidate links */}
          {isCandidate && (
            <NavLink href="/candidate/hub" accent>
              Aday Paneli
            </NavLink>
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
                className="btn-shine px-3.5 py-1.5 rounded-md bg-brand text-brand-ink text-xs font-semibold hover:bg-brand-strong transition-colors"
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
