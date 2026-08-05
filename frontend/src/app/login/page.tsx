"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

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
      // "this area is for employers" wall right after signing in.
      router.push(profile.role === "employer" ? "/employer/dashboard" : "/candidate/hub");
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
    <div className="max-w-md mx-auto my-12 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white tracking-tight">Giriş Yap</h1>
        <p className="text-sm text-zinc-400">
          Hesabınıza girerek başvurularınızı ve ilanlarınızı yönetin.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-lg text-center">
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            E-posta Adresi
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@sirket.com"
            className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            Şifre
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm transition shadow disabled:opacity-50"
        >
          {loading ? "Giriş yapılıyor…" : "Giriş Yap →"}
        </button>
      </form>

      <div className="text-center text-xs text-zinc-500 pt-2 border-t border-zinc-800">
        Hesabınız yok mu?{" "}
        <Link href="/register" className="text-blue-400 hover:underline font-semibold">
          Hesap Oluştur
        </Link>
      </div>
    </div>
  );
}
