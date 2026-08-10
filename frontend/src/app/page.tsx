"use client";

import Link from "next/link";
import { SELECTABLE_CATEGORIES } from "@/lib/categories";
import { useAuth } from "@/context/AuthContext";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";
import Tilt from "@/components/Tilt";
import { CategoryIcon, PersonIcon, BuildingIcon } from "@/components/CategoryIcon";
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

/** Landing stats — every number here is a product fact, not marketing. */
const STATS = [
  { value: 18, suffix: "", label: "meslek sektörü", note: "sağlıktan yazılıma" },
  { value: 3, suffix: "", label: "adımda başvuru", note: "ilan · belge · sonuç" },
  { value: 100, suffix: "%", label: "gerekçeli sonuç", note: "kapalı kutu yok" },
  { value: 0, suffix: "", label: "onaysız işlem", note: "onay her zaman sizde" },
];

/** Decorative verification chips floating around the hero illustration.
    Positioned clear of the document's centre and seal so they never sit on
    top of the artwork's busy areas. */
const HERO_CHIPS = [
  {
    cls: "-top-2 left-2 lg:-left-6",
    delay: "0s",
    tone: "text-ok border-ok/30 bg-ok/10",
    text: "✓ Sertifika doğrulandı",
  },
  {
    cls: "top-1/3 -right-3 lg:-right-10",
    delay: "1.6s",
    tone: "text-brand border-brand/30 bg-brand/10",
    text: "Gerekçe: belge no · kurum · tarih",
  },
  {
    cls: "-bottom-3 left-4 lg:left-0",
    delay: "0.9s",
    tone: "text-fg-soft border-line-strong bg-raised/95",
    text: "İnsan incelemesinden geçti",
  },
];

export default function Home() {
  const { user } = useAuth();
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  const isCandidate = user?.role === "candidate";

  return (
    <div className="relative">
      {/* Ambient ground: two slow brass glows + one cool counterweight.
          All decorative, all behind content. */}
      <div
        className="absolute inset-x-0 top-0 h-[44rem] -z-10 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute -top-32 right-[-10%] w-[42rem] h-[42rem] rounded-full animate-drift"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 13%, transparent), transparent 70%)",
          }}
        />
        <div
          className="absolute top-40 left-[-14%] w-[36rem] h-[36rem] rounded-full animate-drift-slow"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 7%, transparent), transparent 70%)",
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-14 md:py-20 space-y-24 md:space-y-32">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.12fr_0.88fr] items-center gap-12 animate-fade-in-up">
          <div className="space-y-7">
            <p className="eyebrow flex items-center gap-2">
              <span className="dot-live" aria-hidden="true" />
              Her meslek için kanıta dayalı işe alım
            </p>

            <h1 className="text-display text-fg">
              İddia değil,{" "}
              <span className="relative inline-block text-brand italic">
                belge
                {/* Hand-drawn brass underline */}
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  viewBox="0 0 120 10"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 7 Q 40 2 70 5 T 117 4"
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity="0.55"
                  />
                </svg>
              </span>{" "}
              konuşsun.
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

            {/* Role-based CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {isCandidate && (
                <>
                  <Link href="/jobs" className="btn btn-brand btn-shine">
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
                  <Link
                    href="/employer/dashboard"
                    className="btn btn-brand btn-shine"
                  >
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
                  <Link href="/jobs" className="btn btn-brand btn-shine">
                    Açık ilanları incele
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                  <Link href="/register" className="btn btn-quiet">
                    Hesap oluştur
                  </Link>
                </>
              )}
            </div>

            {/* Trust chips: the promise, at a glance */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {["Onaysız işlem yok", "Belgeler insan gözünden geçer"].map(
                (t) => (
                  <span
                    key={t}
                    className="badge text-fg-mute border-line bg-surface/70"
                  >
                    {t}
                  </span>
                )
              )}
              <Link
                href="/kvkk"
                className="badge text-fg-mute border-line bg-surface/70 hover:text-brand hover:border-brand/40 transition-colors"
              >
                KVKK aydınlatma metni &rarr;
              </Link>
            </div>
          </div>

          {/* The one bold moment: the sealed certificate — it leans toward
              the cursor, chips floating in its orbit. */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <div
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 55%, color-mix(in oklab, var(--brand) 16%, transparent), transparent 75%)",
              }}
            />
            <Tilt className="relative">
              <DocumentSeal className="w-full max-w-md mx-auto animate-float" />
              {/* The AI reading pass: a brass beam sweeps the certificate. */}
              <div className="absolute inset-x-14 top-4 bottom-8 overflow-hidden pointer-events-none">
                <div className="absolute left-0 top-0 w-full h-1/2 bg-gradient-to-b from-transparent via-brand/10 to-transparent animate-scanning" />
              </div>
              {HERO_CHIPS.map((chip) => (
                <span
                  key={chip.text}
                  className={`absolute ${chip.cls} badge ${chip.tone} shadow-lg backdrop-blur-sm animate-float`}
                  style={{ animationDelay: chip.delay }}
                >
                  {chip.text}
                </span>
              ))}
            </Tilt>
          </div>
        </section>

        {/* ── Stats band ────────────────────────────────────────────── */}
        <Reveal>
          <section className="card border-gradient grid grid-cols-2 md:grid-cols-4 overflow-hidden">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`p-6 md:p-8 text-center space-y-1 hover:bg-raised/60 transition-colors border-line/60 ${
                  i % 2 === 1 ? "border-l" : ""
                } ${i >= 2 ? "border-t md:border-t-0" : ""} ${
                  i > 0 ? "md:border-l" : ""
                }`}
              >
                <div className="text-3xl md:text-4xl font-semibold text-brand font-display">
                  {s.suffix === "%" ? (
                    <>
                      %<CountUp end={s.value} />
                    </>
                  ) : (
                    <CountUp end={s.value} />
                  )}
                </div>
                <div className="text-sm font-medium text-fg">{s.label}</div>
                <div className="text-xs text-fg-mute">{s.note}</div>
              </div>
            ))}
          </section>
        </Reveal>

        {/* ── Feature cards ─────────────────────────────────────────── */}
        <Reveal stagger>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(({ Illustration, title, body }) => (
              <article
                key={title}
                className="card card-lift p-8 space-y-4 group"
              >
                <Illustration className="h-32 w-auto transition-transform duration-500 group-hover:scale-[1.04] group-hover:-rotate-1" />
                <h3 className="text-xl font-semibold text-fg tracking-tight">
                  {title}
                </h3>
                <p className="text-sm text-fg-soft leading-relaxed">{body}</p>
              </article>
            ))}
          </section>
        </Reveal>

        {/* ── Persona split: Aday / İşveren ─────────────────────────── */}
        <section className="space-y-10">
          <Reveal className="text-center space-y-3">
            <p className="eyebrow">İki taraf, tek rapor</p>
            <h2 className="text-title text-fg">Hangi taraftasınız?</h2>
            <p className="text-fg-soft max-w-2xl mx-auto">
              Aday emeğini kanıtlar, işveren kanıtı gerekçesiyle okur. İkisi de
              aynı raporu görür — pazarlık payı yok.
            </p>
          </Reveal>

          <Reveal stagger>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Aday panel */}
              <article className="card card-glow card-lift p-8 md:p-10 space-y-6 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="badge bg-ok/10 text-ok border-ok/30 uppercase tracking-wider">
                    Aday
                  </span>
                  <PersonIcon className="w-8 h-8 text-ok" />
                </div>
                <h3 className="text-2xl font-semibold text-fg tracking-tight font-display">
                  Emeğinizi görünür kılın
                </h3>
                <ul className="space-y-3 text-sm text-fg-soft leading-relaxed flex-1">
                  {[
                    "Belgeniz süslü cümlelerden daha yüksek sesle konuşur — sertifika, ehliyet, ustalık belgesi, çalışma örneği.",
                    "Başvurunuzun neden öyle sonuçlandığını madde madde okursunuz; kimse size kapalı kapı ardından karar vermez.",
                    "Belgeleriniz yalnızca onay verdiğinizde işlenir, dilediğiniz an hesabınızla birlikte tamamen silinir.",
                  ].map((t) => (
                    <li key={t} className="flex gap-3">
                      <span className="text-ok mt-0.5 shrink-0" aria-hidden="true">
                        ✓
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
                <div className="pt-2">
                  <Link href={isCandidate ? "/jobs" : "/register"} className="btn btn-brand btn-shine w-full sm:w-auto">
                    {isCandidate ? "İlanlara göz at" : "Aday olarak başla"}
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </article>

              {/* İşveren panel */}
              <article className="card card-glow card-lift p-8 md:p-10 space-y-6 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="badge bg-brand/10 text-brand border-brand/30 uppercase tracking-wider">
                    İşveren
                  </span>
                  <BuildingIcon className="w-8 h-8 text-brand" />
                </div>
                <h3 className="text-2xl font-semibold text-fg tracking-tight font-display">
                  Kanıta bakarak seçin
                </h3>
                <ul className="space-y-3 text-sm text-fg-soft leading-relaxed flex-1">
                  {[
                    "Yüz özgeçmiş okumak yerine tek ekran: her aday, ilanınızın gereksinimlerine karşı belge belge değerlendirilir.",
                    "Skor değil gerekçe görürsünüz — hangi yeterlilik hangi belgeyle, neden karşılandı ya da karşılanmadı.",
                    "Şüpheli veya okunaksız belgeler işinize düşmeden önce insan incelemesinde elenir.",
                  ].map((t) => (
                    <li key={t} className="flex gap-3">
                      <span className="text-brand mt-0.5 shrink-0" aria-hidden="true">
                        ✓
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
                <div className="pt-2">
                  <Link
                    href={isEmployer ? "/employer/dashboard" : "/register"}
                    className="btn btn-quiet w-full sm:w-auto"
                  >
                    {isEmployer ? "Panelinize dönün" : "İlk ilanınızı yayınlayın"}
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </article>
            </div>
          </Reveal>
        </section>

        {/* ── Örnek rapor: ürünün kalbi ─────────────────────────────── */}
        <section className="space-y-10">
          <Reveal className="text-center space-y-3">
            <p className="eyebrow">Ürünün kalbi</p>
            <h2 className="text-title text-fg">İşte raporun kendisi</h2>
            <p className="text-fg-soft max-w-2xl mx-auto">
              Pazarlama görseli değil — platformun her başvuru için ürettiği
              rapor formatının birebir örneği. Durum, gerekçe ve dayanak;
              satır satır.
            </p>
          </Reveal>

          <Reveal>
            <div className="card border-gradient overflow-hidden max-w-3xl mx-auto">
              {/* Report chrome */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line bg-well/60">
                <div className="flex items-center gap-2.5">
                  <SealMark className="w-5 h-5" aria-hidden="true" />
                  <span className="text-xs font-mono text-fg-mute tracking-wider">
                    ÖRNEK RAPOR · Kıdemli Aşçı ilanı
                  </span>
                </div>
                <span className="badge bg-brand/10 text-brand border-brand/30 tabular-nums">
                  2 / 3 gereksinim doğrulandı
                </span>
              </div>

              {/* Rows — the real report's grammar: status, reasoning, source */}
              <div className="divide-y divide-line">
                {[
                  {
                    req: "Ustalık belgesi",
                    status: "Doğrulandı",
                    tone: "bg-ok/10 text-ok border-ok/30",
                    rail: "border-l-ok/60",
                    reason:
                      "MEB onaylı Aşçılık Ustalık Belgesi sunuldu; belge numarası ve kurum adı okunabilir durumda.",
                    source: "ustalik-belgesi.pdf · sayfa 1",
                  },
                  {
                    req: "5+ yıl mutfak deneyimi",
                    status: "Doğrulandı",
                    tone: "bg-ok/10 text-ok border-ok/30",
                    rail: "border-l-ok/60",
                    reason:
                      "Özgeçmişteki çalışma geçmişi kesintisiz 6 yılı gösteriyor; son işyeri referans bağlantısıyla tutarlı.",
                    source: "ozgecmis.pdf · deneyim bölümü",
                  },
                  {
                    req: "HACCP hijyen sertifikası",
                    status: "Yetersiz Belge",
                    tone: "bg-warn/10 text-warn border-warn/30",
                    rail: "border-l-warn/60",
                    reason:
                      "Bu başlık için belge sunulmadı. Görüşmede sorulması önerilir — belge sonradan da yüklenebilir.",
                    source: null,
                  },
                ].map((row) => (
                  <div
                    key={row.req}
                    className={`px-6 py-5 space-y-2.5 border-l-2 ${row.rail} hover:bg-raised/50 transition-colors`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-fg">
                        {row.req}
                      </span>
                      <span className={`badge uppercase tracking-wider ${row.tone}`}>
                        {row.status}
                      </span>
                    </div>
                    <p className="text-xs text-fg-soft leading-relaxed">
                      <strong className="text-brand font-semibold uppercase tracking-wider text-[10px] mr-1.5">
                        Gerekçe
                      </strong>
                      {row.reason}
                    </p>
                    {row.source && (
                      <p className="text-[11px] font-mono text-fg-mute">
                        DAYANAK: {row.source}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-line bg-well/60 text-center">
                <p className="text-xs text-fg-mute">
                  Her satırda üç şey var: <span className="text-fg-soft">durum</span>,{" "}
                  <span className="text-fg-soft">gerekçe</span> ve{" "}
                  <span className="text-fg-soft">dayanak</span>. İşveren de aday
                  da aynı raporu görür — pazarlık payı yok.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Nasıl çalışır ─────────────────────────────────────────── */}
        <section className="space-y-10">
          <Reveal className="text-center space-y-3">
            <h2 className="text-title text-fg">Nasıl çalışır?</h2>
            <p className="text-fg-soft max-w-2xl mx-auto">
              Üç adım. Aday tarafında birkaç dakika, işveren tarafında tek
              ekran.
            </p>
          </Reveal>

          <Reveal stagger>
            <ol className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Connecting thread (desktop) */}
              <div
                className="hidden md:block absolute top-[3.1rem] left-[16%] right-[16%] border-t border-dashed border-brand/25 -z-10"
                aria-hidden="true"
              />
              {STEPS.map((step) => (
                <li key={step.n} className="card card-lift p-8 space-y-3 group">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-brand/40 text-brand font-semibold tabular-nums transition-all duration-300 group-hover:bg-brand group-hover:text-brand-ink group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-brand/20">
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
          </Reveal>
        </section>

        {/* ── Sektör şeridi ─────────────────────────────────────────── */}
        <section className="space-y-8">
          <Reveal className="text-center space-y-3">
            <h2 className="text-title text-fg">Her sektör için</h2>
            <p className="text-fg-soft max-w-2xl mx-auto">
              Ustalık belgesi de, diploma da, sertifika da kanıttır. Platform
              tek bir meslek grubuna göre değil, çalışmanın kendisine göre
              kurgulandı.
            </p>
          </Reveal>

          <Reveal className="space-y-3">
            {/* Two counter-scrolling rows; hover pauses, edges fade out. */}
            <div className="ticker-mask">
              <div className="ticker-row animate-marquee">
                {[...SELECTABLE_CATEGORIES, ...SELECTABLE_CATEGORIES].map(
                  (c, i) => (
                    <Link
                      key={`${c.key}-${i}`}
                      href="/jobs"
                      aria-hidden={i >= SELECTABLE_CATEGORIES.length}
                      tabIndex={i >= SELECTABLE_CATEGORIES.length ? -1 : 0}
                      className="px-4 py-2.5 rounded-md bg-surface border border-line text-sm text-fg-soft hover:text-fg hover:border-brand/50 hover:bg-raised transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                      <CategoryIcon k={c.key} className="w-4 h-4 shrink-0" /> {c.label}
                    </Link>
                  )
                )}
              </div>
            </div>
            <div className="ticker-mask">
              <div className="ticker-row animate-marquee-reverse">
                {[
                  ...[...SELECTABLE_CATEGORIES].reverse(),
                  ...[...SELECTABLE_CATEGORIES].reverse(),
                ].map((c, i) => (
                  <Link
                    key={`${c.key}-r-${i}`}
                    href="/jobs"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="px-4 py-2.5 rounded-md bg-surface border border-line text-sm text-fg-soft hover:text-fg hover:border-brand/50 hover:bg-raised transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <CategoryIcon k={c.key} className="w-4 h-4 shrink-0" /> {c.label}
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Trust layer: verileriniz nasıl korunuyor? ─────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16">
          <Reveal className="space-y-5 lg:sticky lg:top-28 self-start">
            <p className="eyebrow">Güven, ürünün kendisidir</p>
            <h2 className="text-title text-fg">Verileriniz nasıl korunuyor?</h2>
            <p className="text-fg-soft leading-relaxed">
              Diplomanız, sertifikanız, özgeçmişiniz — bunlar birer dosya
              değil, yıllarınız. O yüzden kuralları en başından sade ve sert
              koyduk.
            </p>
            <Link href="/kvkk" className="btn btn-quiet text-sm">
              KVKK aydınlatma metnini oku
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </Reveal>

          <Reveal stagger>
            <ul className="space-y-4">
              {TRUST_ITEMS.map(({ Icon, title, body }) => (
                <li key={title} className="card card-lift p-6 flex gap-5 group">
                  <Icon className="w-11 h-11 shrink-0 mt-0.5 transition-transform duration-300 group-hover:scale-110" />
                  <div className="space-y-1.5">
                    <h3 className="font-semibold text-fg tracking-tight">
                      {title}
                    </h3>
                    <p className="text-sm text-fg-soft leading-relaxed">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* ── SSS ───────────────────────────────────────────────────── */}
        <section className="space-y-8 max-w-3xl mx-auto">
          <Reveal>
            <h2 className="text-title text-fg text-center">Sık sorulanlar</h2>
          </Reveal>

          <Reveal stagger>
            <div className="space-y-3">
              {FAQ.map((item) => (
                <details key={item.q} className="group card overflow-hidden">
                  <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-4 text-fg font-medium hover:bg-raised transition-colors">
                    {item.q}
                    <span
                      className="text-brand group-open:rotate-45 transition-transform duration-300 text-xl leading-none shrink-0"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <div className="faq-body">
                    <div>
                      <p className="px-5 pb-5 text-sm text-fg-soft leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── Kapanış ───────────────────────────────────────────────── */}
        <Reveal>
          <section className="relative card border-gradient card-glow overflow-hidden text-center space-y-6 p-10 md:p-16">
            <SealMark className="absolute -right-10 -top-10 w-52 h-52 opacity-[0.07] pointer-events-none animate-float" />
            <SealMark className="absolute -left-14 -bottom-14 w-44 h-44 opacity-[0.05] pointer-events-none" />
            <h2 className="text-title text-fg">
              Emeğinizin karşılığı, belgenizde yazıyor
            </h2>
            <p className="text-fg-soft max-w-xl mx-auto">
              Hesap açmak ücretsiz. İlanları incelemek için kayıt bile
              gerekmiyor.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Link href="/jobs" className="btn btn-brand btn-shine">
                İlanları incele
                <span aria-hidden="true">&rarr;</span>
              </Link>
              <Link href="/register" className="btn btn-quiet">
                Hesap oluştur
              </Link>
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
