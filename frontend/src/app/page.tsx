"use client";

import Link from "next/link";
import { SELECTABLE_CATEGORIES } from "@/lib/categories";
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
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-4xl bg-blue-500/10 blur-[120px] rounded-full -z-10 pointer-events-none" />

      <div className="space-y-24 max-w-6xl mx-auto py-20 px-4 relative z-10 animate-fade-in-up">
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center text-center space-y-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-blue-950/40 border border-blue-500/30 text-blue-300 text-xs font-bold tracking-widest uppercase backdrop-blur-md shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <span>⚡</span> Her meslek için kanıta dayalı işe alım
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.1] text-balance">
            İddia değil, <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              belge konuşsun
            </span>
          </h1>

          <p className="text-lg md:text-xl leading-relaxed text-zinc-300 max-w-3xl font-medium">
            Hemşire de, şoför de, şef de, yazılımcı da başvurusuna belgesini ekler.
            İşveren adayın hangi yeterliliğini neye dayanarak karşıladığını
            <strong className="text-white"> gerekçesiyle birlikte</strong> görür.
            Süslü özgeçmiş yerine kanıt.
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
            <h3 className="text-2xl font-bold text-white relative z-10 tracking-tight">Onay sizde</h3>
            <p className="text-sm text-zinc-300 leading-relaxed relative z-10 font-medium">
              Siz onaylamadan hiçbir belgeniz işlenmez, hiçbir işverenle paylaşılmaz.
              Onayınızı istediğiniz zaman geri çekebilirsiniz.
            </p>
          </div>

          <div className="group bg-white/5 border border-white/10 p-8 rounded-3xl space-y-4 hover:bg-white/10 hover:border-emerald-500/50 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.2)] backdrop-blur-xl transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-8xl">🧠</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl shadow-lg relative z-10">
              🧠
            </div>
            <h3 className="text-2xl font-bold text-white relative z-10 tracking-tight">Belgeniz okunur</h3>
            <p className="text-sm text-zinc-300 leading-relaxed relative z-10 font-medium">
              Özgeçmişiniz, sertifikanız veya ustalık belgeniz saniyeler içinde incelenir;
              "iletişimi güçlü" gibi soyut ifadeler değil, ispatlanabilir yeterlilikler öne çıkar.
            </p>
          </div>

          <div className="group bg-white/5 border border-white/10 p-8 rounded-3xl space-y-4 hover:bg-white/10 hover:border-purple-500/50 hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.2)] backdrop-blur-xl transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="text-8xl">📊</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-900 to-purple-950 border border-purple-500/30 flex items-center justify-center text-purple-400 text-2xl shadow-lg relative z-10">
              📊
            </div>
            <h3 className="text-2xl font-bold text-white relative z-10 tracking-tight">Gerekçeli sonuç</h3>
            <p className="text-sm text-zinc-300 leading-relaxed relative z-10 font-medium">
              Her değerlendirmenin yanında nedeni yazar. İşveren neye baktığını,
              aday neden öyle sonuçlandığını görür. Kapalı kutu yok.
            </p>
          </div>
        </div>

        {/* Nasıl Çalışır — three real steps, so numbering carries meaning */}
        <section className="space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Nasıl çalışır?</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              Üç adım. Aday tarafında birkaç dakika, işveren tarafında tek ekran.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                n: "1",
                title: "İlanı seçin",
                body: "Sektörünüzü seçip size uygun ilanı bulun. Başvuru için hesap açmanız yeterli.",
              },
              {
                n: "2",
                title: "Belgelerinizi ekleyin",
                body: "Özgeçmiş, sertifika, ehliyet, ustalık belgesi veya çalışma örneği. Ne varsa ekleyin.",
              },
              {
                n: "3",
                title: "Sonucu birlikte görün",
                body: "Hangi yeterliliği neye dayanarak karşıladığınız gerekçesiyle yazılır. İşveren aynı raporu görür.",
              },
            ].map((step) => (
              <li
                key={step.n}
                className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-3 backdrop-blur-xl"
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 font-bold">
                  {step.n}
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight">{step.title}</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Sektör vitrini — the promise of "every profession", made concrete */}
        <section className="space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Her sektör için
            </h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              Ustalık belgesi de, diploma da, sertifika da kanıttır. Platform tek bir
              meslek grubuna göre değil, çalışmanın kendisine göre kurgulandı.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {SELECTABLE_CATEGORIES.map((c) => (
              <Link
                key={c.key}
                href="/jobs"
                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-zinc-300 hover:text-white hover:border-blue-500/50 hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <span aria-hidden="true">{c.icon}</span> {c.label}
              </Link>
            ))}
          </div>
        </section>

        {/* SSS */}
        <section className="space-y-8 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight text-center">
            Sık sorulanlar
          </h2>

          <div className="space-y-4">
            {[
              {
                q: "Belgelerim kimlerle paylaşılıyor?",
                a: "Yalnızca başvurduğunuz ilanın işvereniyle ve yalnızca siz onay verdiğinizde. Onaylamadığınız hiçbir belge işlenmez.",
              },
              {
                q: "Sadece yazılımcılar için mi?",
                a: "Hayır. Sağlıktan lojistiğe, mutfaktan inşaata, eğitimden güvenliğe her meslek grubuna açık. Değerlendirme, başvurduğunuz ilanın gereksinimlerine göre yapılır.",
              },
              {
                q: "Belgem yoksa başvuramaz mıyım?",
                a: "Başvurabilirsiniz. Belge, değerlendirmeyi güçlendirir; zorunlu değildir. Deneyiminizi kendi cümlelerinizle de anlatabilirsiniz.",
              },
              {
                q: "İşveren skoru nasıl görüyor?",
                a: "Tek bir puan olarak değil, madde madde. Her yeterliliğin yanında hangi belgeye dayandığı ve neden öyle sonuçlandığı yazar.",
              },
            ].map((item) => (
              <details
                key={item.q}
                className="group bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden"
              >
                <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-4 text-white font-semibold hover:bg-white/5 transition">
                  {item.q}
                  <span className="text-zinc-500 group-open:rotate-45 transition-transform text-xl leading-none" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm text-zinc-300 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Kapanış */}
        <section className="text-center space-y-6 bg-white/5 border border-white/10 rounded-3xl p-10 md:p-14 backdrop-blur-xl">
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight text-balance">
            Emeğinizin karşılığı, belgenizde yazıyor
          </h2>
          <p className="text-zinc-300 max-w-xl mx-auto">
            Hesap açmak ücretsiz. İlanları incelemek için kayıt bile gerekmiyor.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              href="/jobs"
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-2xl font-bold text-white transition-all hover:-translate-y-0.5"
            >
              İlanları İncele
            </Link>
            <Link
              href="/register"
              className="px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl font-bold text-white backdrop-blur-md transition-all hover:-translate-y-0.5"
            >
              Hesap Oluştur
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
