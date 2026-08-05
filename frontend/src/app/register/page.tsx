"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employer" | "candidate">("employer");
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
    <div className="max-w-md mx-auto my-12 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white tracking-tight">Hesap Oluştur</h1>
        <p className="text-sm text-zinc-400">
          İş arıyorsanız kanıtlarınızı yükleyin, işveren iseniz ilan yayınlayın.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-lg text-center">
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Hesap Türü
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRole("employer")}
              className={`py-2.5 rounded-lg text-xs font-bold border transition ${
                role === "employer"
                  ? "bg-blue-600 border-blue-500 text-white shadow"
                  : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🏢 İşveren / İlan Veren
            </button>
            <button
              type="button"
              onClick={() => setRole("candidate")}
              className={`py-2.5 rounded-lg text-xs font-bold border transition ${
                role === "candidate"
                  ? "bg-blue-600 border-blue-500 text-white shadow"
                  : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              👤 İş Arıyorum
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            Ad Soyad
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ayşe Yılmaz"
            className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            E-posta Adresi
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ayse@sirket.com"
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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-describedby="sifre-kurali"
            className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition"
          />
          <p id="sifre-kurali" className="mt-1.5 text-xs text-zinc-400">
            En az 6 karakter olmalı.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm transition shadow disabled:opacity-50"
        >
          {loading ? "Hesap oluşturuluyor…" : "Hesap Oluştur →"}
        </button>
      </form>

      <div className="text-center text-xs text-zinc-500 pt-2 border-t border-zinc-800">
        Zaten hesabınız var mı?{" "}
        <Link href="/login" className="text-blue-400 hover:underline font-semibold">
          Giriş Yap
        </Link>
      </div>
    </div>
  );
}
