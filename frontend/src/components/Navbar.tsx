"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  const isCandidate = user?.role === "candidate";

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 text-zinc-100 p-4 sticky top-0 z-40 backdrop-blur-md bg-zinc-900/90">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-white hover:text-zinc-300 transition-colors flex items-center gap-2">
          <span className="text-blue-500 text-2xl">⚡</span>
          <span>Evidence Intelligence Platform</span>
        </Link>

        <div className="flex items-center space-x-6 text-sm">
          {/* Always Visible Job Listings */}
          <Link href="/jobs" className="hover:text-blue-400 transition-colors font-medium flex items-center gap-1">
            <span>💼</span> İş İlanları
          </Link>

          {/* Employer Specific Links */}
          {isEmployer && (
            <>
              <Link href="/employer/dashboard" className="hover:text-blue-400 transition-colors font-medium flex items-center gap-1 text-blue-400">
                <span>🏢</span> İşveren Paneli
              </Link>
              <Link href="/candidates" className="hover:text-blue-400 transition-colors font-medium flex items-center gap-1">
                <span>👥</span> Aday Havuzu
              </Link>
              <Link href="/requirements" className="hover:text-blue-400 transition-colors font-medium flex items-center gap-1">
                <span>📋</span> Gereksinimler
              </Link>
            </>
          )}

          {/* Candidate Specific Links */}
          {isCandidate && (
            <>
              <Link href="/candidate/hub" className="hover:text-emerald-400 transition-colors font-medium flex items-center gap-1 text-emerald-400">
                <span>🎯</span> Aday Paneli & CV Yükle
              </Link>
            </>
          )}

          {/* User Auth Section */}
          {user ? (
            <div className="flex items-center space-x-3 pl-4 border-l border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-300">{user.email}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    isEmployer
                      ? "bg-blue-950/60 text-blue-400 border-blue-800"
                      : "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                  }`}
                >
                  {user.role}
                </span>
              </div>
              <button
                onClick={logout}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded transition text-zinc-300"
              >
                Çıkış Yap
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-3 pl-4 border-l border-zinc-800">
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white transition"
              >
                Giriş Yap
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition shadow"
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
