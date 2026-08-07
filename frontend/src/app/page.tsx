"use client";

import Link from "next/link";
import { SELECTABLE_CATEGORIES } from "@/lib/categories";
import { useAuth } from "@/context/AuthContext";
import {
  DocumentSeal,
  MagnifierDoc,
  ShieldConsent,
  LedgerCheck,
  IconConsent,
  IconKvkk,
  IconHumanReview,
  IconZeroTrust,
  SealMark,
} from "@/components/illustrations";

const FEATURES = [
  {
    Illustration: ShieldConsent,
    title: "Onay sizde",
    body: "Siz onaylamadan hiçbir belgeniz işlenmez, hiçbir işverenle paylaşılmaz. Onayınızı istediğiniz zaman geri çekebilirsiniz.",
  },
  {
    Illustration: MagnifierDoc,
    title: "Belgeniz okunur",
    body: "Özgeçmişiniz, sertifikanız veya ustalık belgeniz satır satır incelenir; “iletişimi güçlü” gibi soyut ifadeler değil, ispatlanabilir yeterlilikler öne çıkar.",
  },
  {
    Illustration: LedgerCheck,
    title: "Gerekçeli sonuç",
    body: "Her değerlendirmenin yanında nedeni yazar. İşveren neye baktığını, aday neden öyle sonuçlandığını görür. Kapalı kutu yok.",
  },
];

const TRUST_ITEMS = [
  {
    Icon: IconConsent,
    title: "Onaysız hiçbir şey olmaz",
    body: "Belgeniz ancak siz kutucuğu işaretlediğinizde işleme alınır. Onay vermediğiniz hiçbir dosya okunmaz, kimseye gösterilmez; verdiğiniz onayı istediğiniz an geri çekebilirsiniz.",
  },
  {
    Icon: IconHumanReview,
    title: "Belgeler önce insan gözünden geçer",
    body: "Fotoğrafını çektiğiniz veya taradığınız belgeler, işverene sunulmadan önce ekibimiz tarafından tek tek incelenir. Yapay zekânın kararı tek başına yeterli değildir.",
  },
  {
    Icon: IconKvkk,
    title: "KVKK'ya uygun, açık dille",
    body: "Hangi verinizin, ne amaçla, kiminle paylaşıldığını sade Türkçeyle yazdık — küçük punto yok. Belgeleriniz reklam için kullanılmaz, kimseye satılmaz.",
  },
  {
    Icon: IconZeroTrust,
    title: "Kilitli hat üzerinde taşınır",
    body: "Sistemin her parçası, veriye dokunmadan önce kimliğini kanıtlamak zorunda (buna “zero-trust” deniyor). Belgeleriniz bu kilitli hattın dışına çıkmaz.",
  },
];

const STEPS = [
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
];

const FAQ = [
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
];

export default function Home() {
  const { user } = useAuth();
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  const isCandidate = user?.role === "candidate";

  return (
    <div className="relative">
      {/* Single quiet brand tint behind the hero — no glow soup */}
      <div
        className="absolute inset-x-0 top-0 h-[36rem] -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 70% at 70% 0%, color-mix(in oklab, var(--brand) 9%, transparent), transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 space-y-24 md:space-y-32 animate-fade-in-up">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] items-center gap-12">
          <div className="space-y-7">
            <p className="eyebrow">Her meslek için kanıta dayalı işe alım</p>

            <h1 className="text-display text-fg">
              İddia değil,{" "}
              <span className="text-brand italic">belge</span> konuşsun.
            </h1>

            <p className="text-lg leading-relaxed text-fg-soft max-w-xl">
              Hemşire de, şoför de, şef de, yazılımcı da başvurusuna belgesini
              ekler. İşveren, adayın hangi yeterliliği neye dayanarak
              karşıladığını{" "}
              <strong className="text-fg font-semibold">
                gerekçesiyle birlikte
              </strong>{" "}
              görür. Süslü özgeçmiş yerine kanıt.
            </p>

            {/* Role-based CTAs — same routing logic, quieter clothes */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {isCandidate && (
                <>
                  <Link href="/jobs" className="btn btn-brand">
                    İş ilanlarını incele
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                  <Link href="/candidate/hub" className="btn btn-quiet">
                    Aday paneline git
                  </Link>
                </>
              )}

              {isEmployer && (
                <>
                  <Link href="/employer/dashboard" className="btn btn-brand">
                    İşveren paneline git
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                  <Link href="/jobs" className="btn btn-quiet">
                    Yayınlanan ilanlar
                  </Link>
                </>
              )}

              {!user && (
                <>
                  <Link href="/jobs" className="btn btn-brand">
                    Açık ilanları incele
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                  <Link href="/register" className="btn btn-quiet">
                    Hesap oluştur
                  </Link>
                </>
              )}
            </div>

            {/* Trust strip: the promise, in one quiet line */}
            <p className="text-xs text-fg-mute flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
              <span>Onaysız işlem yok</span>
              <span aria-hidden="true">·</span>
              <span>Belgeler insan gözünden geçer</span>
              <span aria-hidden="true">·</span>
              <Link
                href="/kvkk"
                className="underline underline-offset-2 hover:text-fg-soft transition-colors"
              >
                KVKK aydınlatma metni
              </Link>
            </p>
          </div>

          {/* The one bold moment: the sealed certificate */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <div
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 55%, color-mix(in oklab, var(--brand) 14%, transparent), transparent 75%)",
              }}
            />
            <DocumentSeal className="w-full max-w-md mx-auto animate-float" />
          </div>
        </section>

        {/* ── Feature cards ─────────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map(({ Illustration, title, body }) => (
            <article key={title} className="card card-hover p-8 space-y-4">
              <Illustration className="h-32 w-auto" />
              <h3 className="text-xl font-semibold text-fg tracking-tight">
                {title}
              </h3>
              <p className="text-sm text-fg-soft leading-relaxed">{body}</p>
            </article>
          ))}
        </section>

        {/* ── Nasıl çalışır ─────────────────────────────────────────── */}
        <section className="space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-title text-fg">Nasıl çalışır?</h2>
            <p className="text-fg-soft max-w-2xl mx-auto">
              Üç adım. Aday tarafında birkaç dakika, işveren tarafında tek
              ekran.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <li key={step.n} className="card p-8 space-y-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-brand/40 text-brand font-semibold tabular-nums">
                  {step.n}
                </span>
                <h3 className="text-lg font-semibold text-fg tracking-tight">
                  {step.title}
                </h3>
                <p className="text-sm text-fg-soft leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Trust layer: verileriniz nasıl korunuyor? ─────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16">
          <div className="space-y-5 lg:sticky lg:top-28 self-start">
            <p className="eyebrow">Güven, ürünün kendisidir</p>
            <h2 className="text-title text-fg">
              Verileriniz nasıl korunuyor?
            </h2>
            <p className="text-fg-soft leading-relaxed">
              Diplomanız, sertifikanız, özgeçmişiniz — bunlar birer dosya
              değil, yıllarınız. O yüzden kuralları en başından sade ve sert
              koyduk.
            </p>
            <Link href="/kvkk" className="btn btn-quiet text-sm">
              KVKK aydınlatma metnini oku
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>

          <ul className="space-y-4">
            {TRUST_ITEMS.map(({ Icon, title, body }) => (
              <li key={title} className="card card-hover p-6 flex gap-5">
                <Icon className="w-11 h-11 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-fg tracking-tight">
                    {title}
                  </h3>
                  <p className="text-sm text-fg-soft leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Sektörler ─────────────────────────────────────────────── */}
        <section className="space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-title text-fg">Her sektör için</h2>
            <p className="text-fg-soft max-w-2xl mx-auto">
              Ustalık belgesi de, diploma da, sertifika da kanıttır. Platform
              tek bir meslek grubuna göre değil, çalışmanın kendisine göre
              kurgulandı.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2.5">
            {SELECTABLE_CATEGORIES.map((c) => (
              <Link
                key={c.key}
                href="/jobs"
                className="px-4 py-2 rounded-md bg-surface border border-line text-sm text-fg-soft hover:text-fg hover:border-brand/50 transition-colors flex items-center gap-2"
              >
                <span aria-hidden="true">{c.icon}</span> {c.label}
              </Link>
            ))}
          </div>
        </section>

        {/* ── SSS ───────────────────────────────────────────────────── */}
        <section className="space-y-8 max-w-3xl mx-auto">
          <h2 className="text-title text-fg text-center">Sık sorulanlar</h2>

          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="group card overflow-hidden">
                <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-4 text-fg font-medium hover:bg-raised transition-colors">
                  {item.q}
                  <span
                    className="text-fg-mute group-open:rotate-45 transition-transform text-xl leading-none shrink-0"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm text-fg-soft leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Kapanış ───────────────────────────────────────────────── */}
        <section className="relative card overflow-hidden text-center space-y-6 p-10 md:p-14">
          <SealMark
            className="absolute -right-10 -top-10 w-48 h-48 opacity-[0.06] pointer-events-none"
          />
          <h2 className="text-title text-fg">
            Emeğinizin karşılığı, belgenizde yazıyor
          </h2>
          <p className="text-fg-soft max-w-xl mx-auto">
            Hesap açmak ücretsiz. İlanları incelemek için kayıt bile
            gerekmiyor.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link href="/jobs" className="btn btn-brand">
              İlanları incele
            </Link>
            <Link href="/register" className="btn btn-quiet">
              Hesap oluştur
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
