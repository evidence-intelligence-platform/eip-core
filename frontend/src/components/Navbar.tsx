"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 text-zinc-100 p-4">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-white hover:text-zinc-300 transition-colors flex items-center gap-2">
          <span>⚡</span> Evidence Intelligence Platform
        </Link>
        <div className="flex items-center space-x-6 text-sm">
          <Link href="/employer/dashboard" className="hover:text-blue-400 transition-colors font-medium">
            Employer Dashboard
          </Link>
          <Link href="/candidate/hub" className="hover:text-blue-400 transition-colors font-medium">
            Evidence Hub
          </Link>
          <Link href="/candidates" className="hover:text-blue-400 transition-colors font-medium">
            Candidates
          </Link>
          <Link href="/requirements" className="hover:text-blue-400 transition-colors font-medium">
            Requirements
          </Link>

          {user ? (
            <div className="flex items-center space-x-3 pl-4 border-l border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-300">{user.email}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-950 text-blue-400 border border-blue-800">
                  {user.role}
                </span>
              </div>
              <button
                onClick={logout}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded transition text-zinc-300"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-3 pl-4 border-l border-zinc-800">
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition shadow"
              >
                Create Account
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
