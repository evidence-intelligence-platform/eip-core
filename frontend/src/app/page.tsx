"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user } = useAuth();
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  const isCandidate = user?.role === "candidate";

  return (
    <div className="space-y-16 max-w-6xl mx-auto py-12 px-4">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center text-center space-y-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-950/60 border border-blue-800/60 text-blue-400 text-xs font-semibold tracking-wide">
          <span>⚡</span> AI-POWERED EVIDENCE VERIFICATION PLATFORM
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Kanıt Odaklı İşe Alım ve <br />
          <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-400 bg-clip-text text-transparent">
            Yapay Zeka Destekli Kariyer
          </span>
        </h1>

        <p className="text-base sm:text-lg leading-relaxed text-zinc-400 max-w-2xl">
          EIP, adayları tahminlerle veya özgeçmiş süslemeleriyle değil; doğrulanabilir teknik kanıtlarla değerlendirir. Şeffaf, rıza onaylı ve açıklanabilir skorlama altyapısı.
        </p>

        {/* Dynamic Role-Based CTAs */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
          {isCandidate && (
            <>
              <Link
                href="/jobs"
                className="rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 transition shadow-blue-600/30 flex items-center gap-2"
              >
                <span>💼</span> İş İlanlarını İncele & Başvur &rarr;
              </Link>
              <Link
                href="/candidate/hub"
                className="rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-500 transition shadow-emerald-600/30 flex items-center gap-2"
              >
                <span>🎯</span> Aday Paneline Git &rarr;
              </Link>
            </>
          )}

          {isEmployer && (
            <>
              <Link
                href="/employer/dashboard"
                className="rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 transition shadow-blue-600/30 flex items-center gap-2"
              >
                <span>🏢</span> İşveren Paneline Git &rarr;
              </Link>
              <Link
                href="/jobs"
                className="rounded-xl bg-zinc-800 border border-zinc-700 px-6 py-3.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 transition flex items-center gap-2"
              >
                <span>💼</span> Yayınlanan İlanlar
              </Link>
            </>
          )}

          {!user && (
            <>
              <Link
                href="/jobs"
                className="rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 transition shadow-blue-600/30 flex items-center gap-2"
              >
                <span>💼</span> Açık İlanları İncele &rarr;
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-zinc-800 border border-zinc-700 px-6 py-3.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 transition flex items-center gap-2"
              >
                <span>🔑</span> Hesap Oluştur / Giriş Yap
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-zinc-800/80">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-3 hover:border-zinc-700 transition shadow-lg">
          <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-800 flex items-center justify-center text-blue-400 text-lg">
            🔒
          </div>
          <h3 className="text-lg font-bold text-white">Zero Trust Consent Gate</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Adayın açık rızası olmadan hiçbir veri işlenmez. Pydantic şema seviyesinde `consent_verified` kontrolü ile %100 KVKK/GDPR uyumu.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-3 hover:border-zinc-700 transition shadow-lg">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-center text-emerald-400 text-lg">
            🧠
          </div>
          <h3 className="text-lg font-bold text-white">Gemini AI Kanıt Çıkarımı</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Google Gemini 2.5 Flash LLM servisi özgeçmişleri saniyeler içinde analiz eder, soyut iddialar yerine somut yetkinlik kanıtlarını ayıklar.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-3 hover:border-zinc-700 transition shadow-lg">
          <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-800 flex items-center justify-center text-purple-400 text-lg">
            📊
          </div>
          <h3 className="text-lg font-bold text-white">Açıklanabilir Güven Skoru</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Veriye dayalı şeffaf skorlama raporu. İşverenler adayların kanıtlanmış yetkinlik oranını gerekçeleriyle birlikte detaylı inceler.
          </p>
        </div>
      </div>
    </div>
  );
}
