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
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  accent?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
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
  const pathname = usePathname();
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  const isCandidate = user?.role === "candidate";
  const isAdmin = user?.role === "admin";

  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const [acctOpen, setAcctOpen] = useState(false);

  // A hairline of depth once the page moves — the bar reads as "floating"
  // over content instead of being part of it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the drawer and the account menu whenever the route changes — a
  // tapped link must not leave either hanging open over the new page.
  useEffect(() => {
    setOpen(false);
    setAcctOpen(false);
  }, [pathname]);

  // Dismiss the account menu on any outside click or Esc.
  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-acct-menu]")) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAcctOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);

  // While the drawer is open, lock body scroll and let Esc close it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The link set is identical on desktop and in the drawer; render it once.
  const navLinks = (onNavigate?: () => void) => (
    <>
      <NavLink href="/jobs" onNavigate={onNavigate}>
        İş İlanları
      </NavLink>
      {isEmployer && (
        <>
          <NavLink href="/employer/dashboard" accent onNavigate={onNavigate}>
            İşveren Paneli
          </NavLink>
          <NavLink href="/candidates" onNavigate={onNavigate}>
            Aday Havuzu
          </NavLink>
          <NavLink href="/requirements" onNavigate={onNavigate}>
            Gereksinimler
          </NavLink>
        </>
      )}
      {isAdmin && (
        <NavLink href="/admin/moderation" accent onNavigate={onNavigate}>
          Moderasyon
        </NavLink>
      )}
      {isCandidate && (
        <NavLink href="/candidate/hub" accent onNavigate={onNavigate}>
          Aday Paneli
        </NavLink>
      )}
    </>
  );

  const roleBadge = user && (
    <span
      className={`badge uppercase tracking-wider ${
        isEmployer
          ? "bg-brand/10 text-brand border-brand/30"
          : "bg-ok/10 text-ok border-ok/30"
      }`}
    >
      {ROLE_LABELS[user.role] ?? user.role}
    </span>
  );

  return (
    <nav
      className={`sticky top-0 z-40 border-b bg-ground/90 backdrop-blur-md transition-shadow duration-300 ${
        scrolled
          ? "border-line-strong shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)]"
          : "border-line"
      }`}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link
          href="/"
          onClick={close}
          className="flex items-center gap-2.5 text-fg hover:text-brand-strong transition-colors group shrink-0"
        >
          <SealMark className="w-7 h-7 shrink-0 transition-transform duration-500 group-hover:rotate-[20deg]" />
          <span className="leading-none flex items-baseline gap-2">
            <span className="font-display font-semibold text-xl tracking-[0.02em]">
              EİP
            </span>
            <span className="hidden sm:inline text-fg-mute font-normal text-xs tracking-wide">
              Evidence Intelligence Platform
            </span>
          </span>
        </Link>

        {/* ── Desktop nav (md+) ─────────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-x-5 gap-y-2 text-sm">
          {navLinks()}

          {user ? (
            <div className="relative pl-4 border-l border-line" data-acct-menu>
              <button
                type="button"
                onClick={() => setAcctOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={acctOpen}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-raised transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-brand/15 border border-brand/30 text-brand inline-flex items-center justify-center text-xs font-semibold uppercase">
                  {(user.email?.[0] ?? "?").toLocaleUpperCase("tr")}
                </span>
                {roleBadge}
                <span
                  aria-hidden="true"
                  className={`text-fg-mute text-[10px] transition-transform duration-200 ${
                    acctOpen ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>

              {/* Dropdown */}
              <div
                role="menu"
                className={`absolute right-0 top-full mt-2 w-56 origin-top-right card border-line-strong shadow-2xl p-1.5 transition-[opacity,transform] duration-200 ${
                  acctOpen
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 -translate-y-1 pointer-events-none"
                }`}
              >
                <p className="px-3 pt-2 pb-1 text-xs text-fg-mute break-all">
                  {user.email}
                </p>
                <Link
                  href="/hesap"
                  role="menuitem"
                  onClick={() => setAcctOpen(false)}
                  className="block px-3 py-2 rounded-md text-sm text-fg-soft hover:text-fg hover:bg-raised transition-colors"
                >
                  Hesabım
                </Link>
                <button
                  role="menuitem"
                  onClick={() => {
                    setAcctOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm text-fg-soft hover:text-err hover:bg-err/10 transition-colors"
                >
                  Çıkış Yap
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 pl-4 border-l border-line">
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

        {/* ── Mobile: role badge + hamburger (< md) ─────────────────── */}
        <div className="flex md:hidden items-center gap-3">
          {roleBadge}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
            aria-expanded={open}
            aria-controls="mobil-menu"
            className="relative w-10 h-10 -mr-1.5 inline-flex items-center justify-center rounded-md text-fg hover:bg-raised transition-colors"
          >
            {/* Three bars that morph into an X */}
            <span className="sr-only">Menü</span>
            <span aria-hidden="true" className="block w-5 h-4 relative">
              <span
                className={`absolute left-0 top-0 h-0.5 w-5 bg-current rounded-full transition-transform duration-300 ${
                  open ? "translate-y-[7px] rotate-45" : ""
                }`}
              />
              <span
                className={`absolute left-0 top-[7px] h-0.5 w-5 bg-current rounded-full transition-opacity duration-200 ${
                  open ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 top-[14px] h-0.5 w-5 bg-current rounded-full transition-transform duration-300 ${
                  open ? "-translate-y-[7px] -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ───────────────────────────────────────────── */}
      {/* Dim backdrop */}
      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 top-16 z-30 bg-well/70 backdrop-blur-sm md:hidden transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      {/* Sliding panel */}
      <div
        id="mobil-menu"
        className={`fixed inset-x-0 top-16 z-30 md:hidden origin-top bg-ground border-b border-line-strong shadow-2xl transition-[transform,opacity] duration-300 ${
          open
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-3 pointer-events-none"
        }`}
      >
        <div className="container mx-auto px-4 py-5 flex flex-col gap-1 text-base">
          <div className="flex flex-col gap-1 [&>a]:py-2.5 [&>a]:text-lg">
            {navLinks(close)}
          </div>

          <div className="mt-4 pt-4 border-t border-line">
            {user ? (
              <div className="space-y-3">
                <p className="text-xs text-fg-mute break-all">{user.email}</p>
                <div className="flex items-center gap-3">
                  <Link
                    href="/hesap"
                    onClick={close}
                    className="btn btn-quiet flex-1 text-sm"
                  >
                    Hesabım
                  </Link>
                  <button
                    onClick={() => {
                      close();
                      logout();
                    }}
                    className="btn btn-quiet flex-1 text-sm"
                  >
                    Çıkış Yap
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  onClick={close}
                  className="btn btn-quiet flex-1"
                >
                  Giriş Yap
                </Link>
                <Link
                  href="/register"
                  onClick={close}
                  className="btn btn-brand btn-shine flex-1"
                >
                  Hesap Oluştur
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
