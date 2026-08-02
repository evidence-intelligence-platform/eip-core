"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user } = useAuth();
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  const isCandidate = user?.role === "candidate";

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/30 via-black to-black -z-20" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 -z-10 mix-blend-screen" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-4xl bg-blue-500/10 blur-[120px] rounded-full -z-10 animate-pulse-slow pointer-events-none" />

      <div className="space-y-24 max-w-6xl mx-auto py-20 px-4 relative z-10 animate-fade-in-up">
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center text-center space-y-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-blue-950/40 border border-blue-500/30 text-blue-300 text-xs font-bold tracking-widest uppercase backdrop-blur-md shadow-[0_0_15px_rgba(59,130,246,0.15)] animate-glow">
            <span className="animate-pulse">⚡</span> Yeni Nesil AI Kanıt Doğrulama Platformu
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
            Kanıt Odaklı İşe Alım ve <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent animate-pulse-slow">
              Yapay Zeka Destekli Kariyer
            </span>
          </h1>

          <p className="text-lg md:text-xl leading-relaxed text-zinc-300 max-w-3xl font-medium">
            EIP, adayları tahminlerle veya özgeçmiş süslemeleriyle değil; doğrulanabilir teknik kanıtlarla değerlendirir. Şeffaf, rıza onaylı ve <strong className="text-white">%100 açıklanabilir</strong> skorlama altyapısı.
          </p>

          {/* Dynamic Role-Based CTAs */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-6 w-full">
            {isCandidate && (
              <>
                <Link
                  href="/jobs"
                  className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl font-bold text-white shadow-[0_0_30px_-5px_rgba(59,130,246,0.5)] hover:shadow-[0_0_40px_-5px_rgba(59,130,246,0.8)] transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <span className="relative flex items-center gap-3">💼 İş İlanlarını İncele & Başvur <span className="group-hover:translate-x-1 transition-transform">&rarr;</span></span>
                </Link>
                <Link
                  href="/candidate/hub"
                  className="group px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl font-bold text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-1 flex items-center gap-3"
                >
                  <span>🎯</span> Aday Paneline Git <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                </Link>
              </>
            )}

            {isEmployer && (
              <>
                <Link
                  href="/employer/dashboard"
                  className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl font-bold text-white shadow-[0_0_30px_-5px_rgba(59,130,246,0.5)] hover:shadow-[0_0_40px_-5px_rgba(59,130,246,0.8)] transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <span className="relative flex items-center gap-3">🏢 İşveren Paneline Git <span className="group-hover:translate-x-1 transition-transform">&rarr;</span></span>
                </Link>
                <Link
                  href="/jobs"
                  className="group px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl font-bold text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-1 flex items-center gap-3"
                >
                  <span>💼</span> Yayınlanan İlanlar
                </Link>
              </>
            )}

            {!user && (
              <>
                <Link
                  href="/jobs"
                  className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl font-bold text-white shadow-[0_0_30px_-5px_rgba(59,130,246,0.5)] hover:shadow-[0_0_40px_-5px_rgba(59,130,246,0.8)] transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <span className="relative flex items-center gap-3">💼 Açık İlanları İncele <span className="group-hover:translate-x-1 transition-transform">&rarr;</span></span>
                </Link>
                <Link
                  href="/register"
                  className="group px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl font-bold text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-1 flex items-center gap-3"
                >
                  <span>🔑</span> Hesap Oluştur / Giriş Yap
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
          
          <div className="group bg-white/5 border border-white/10 p-8 rounded-3xl space-y-4 hover:bg-white/10 hover:border-blue-500/50 hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.2)] backdrop-blur-xl transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-8xl">🔒</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-950 border border-blue-500/30 flex items-center justify-center text-blue-400 text-2xl shadow-lg relative z-10">
              🔒
            </div>
            <h3 className="text-2xl font-bold text-white relative z-10 tracking-tight">Zero Trust Consent</h3>
            <p className="text-sm text-zinc-300 leading-relaxed relative z-10 font-medium">
              Adayın açık rızası olmadan hiçbir veri işlenmez. Pydantic şema seviyesinde <code className="bg-black/50 px-1.5 py-0.5 rounded text-blue-300">consent_verified</code> kontrolü ile %100 KVKK/GDPR uyumu.
            </p>
          </div>

          <div className="group bg-white/5 border border-white/10 p-8 rounded-3xl space-y-4 hover:bg-white/10 hover:border-emerald-500/50 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.2)] backdrop-blur-xl transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-8xl">🧠</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl shadow-lg relative z-10">
              🧠
            </div>
            <h3 className="text-2xl font-bold text-white relative z-10 tracking-tight">Gemini AI Analizi</h3>
            <p className="text-sm text-zinc-300 leading-relaxed relative z-10 font-medium">
              Google Gemini 2.5 Flash LLM servisi özgeçmişleri saniyeler içinde analiz eder, soyut iddialar yerine somut yetkinlik kanıtlarını ayıklar.
            </p>
          </div>

          <div className="group bg-white/5 border border-white/10 p-8 rounded-3xl space-y-4 hover:bg-white/10 hover:border-purple-500/50 hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.2)] backdrop-blur-xl transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-8xl">📊</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-900 to-purple-950 border border-purple-500/30 flex items-center justify-center text-purple-400 text-2xl shadow-lg relative z-10">
              📊
            </div>
            <h3 className="text-2xl font-bold text-white relative z-10 tracking-tight">Güven Skoru</h3>
            <p className="text-sm text-zinc-300 leading-relaxed relative z-10 font-medium">
              Veriye dayalı şeffaf skorlama raporu. İşverenler adayların kanıtlanmış yetkinlik oranını gerekçeleriyle birlikte detaylı inceler.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
