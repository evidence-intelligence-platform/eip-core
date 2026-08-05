import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni — EIP",
  description:
    "Kişisel verilerinizin hangi amaçla işlendiği, kimlerle paylaşıldığı ve haklarınız.",
};

/**
 * Consent without disclosure is not informed consent. The apply and upload
 * screens link here, and the text names what is actually processed — including
 * the transfer to Google's Gemini API, which happens on every analysis.
 */
export default function KvkkPage() {
  return (
    <article className="max-w-3xl mx-auto py-12 space-y-8 text-zinc-300">
      <header className="space-y-3 border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          KVKK Aydınlatma Metni
        </h1>
        <p className="text-sm text-zinc-400">
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmıştır.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Hangi verileriniz işleniyor?</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed">
          <li>Hesap bilgileriniz: ad soyad, e-posta adresi</li>
          <li>
            Başvuru kapsamında yüklediğiniz belgeler: özgeçmiş, sertifika, diploma,
            ehliyet, ustalık belgesi, çalışma örnekleri ve eklediğiniz bağlantılar
          </li>
          <li>Başvuru kayıtlarınız ve bunların değerlendirme sonuçları</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Hangi amaçla işleniyor?</h2>
        <p className="text-sm leading-relaxed">
          Belgeleriniz, yalnızca başvurduğunuz ilanın gereksinimleriyle karşılaştırılması
          ve sonucun ilanı yayınlayan işverene sunulması amacıyla işlenir. Reklam veya
          pazarlama amacıyla kullanılmaz, üçüncü kişilere satılmaz.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Kimlerle paylaşılıyor?</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed">
          <li>
            <strong className="text-white">Başvurduğunuz işveren:</strong> yalnızca o ilana
            yaptığınız başvurunun değerlendirme raporu.
          </li>
          <li>
            <strong className="text-white">Google (Gemini API):</strong> belgelerinizin
            metni, değerlendirmenin yapılabilmesi için Google&apos;ın yapay zeka servisine
            iletilir. Bu, verinizin yurt dışına aktarılması anlamına gelir.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Ne kadar süreyle saklanıyor?</h2>
        <p className="text-sm leading-relaxed">
          Hesabınız açık kaldığı sürece. Hesabınızı sildiğinizde belgeleriniz ve
          değerlendirme kayıtlarınız da silinir.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Haklarınız</h2>
        <p className="text-sm leading-relaxed">
          Kanunun 11. maddesi uyarınca; verilerinize erişme, düzeltilmesini veya
          silinmesini isteme, işlenmesine verdiğiniz onayı geri çekme ve işlemeye itiraz
          etme haklarına sahipsiniz. Onayınızı geri çektiğinizde belgeleriniz yeni
          değerlendirmelerde kullanılmaz.
        </p>
      </section>

      <section className="space-y-3 border-t border-zinc-800 pt-6">
        <h2 className="text-xl font-semibold text-white">İletişim</h2>
        <p className="text-sm leading-relaxed">
          Talepleriniz için platform üzerinden bizimle iletişime geçebilirsiniz.
        </p>
      </section>
    </article>
  );
}
