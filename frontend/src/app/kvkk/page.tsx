import type { Metadata } from "next";
import { SealMark } from "@/components/illustrations";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni — EİP",
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
    <article className="max-w-3xl mx-auto py-12 space-y-8 text-fg-soft">
      <header className="space-y-4 border-b border-line pb-6">
        <SealMark className="w-10 h-10" />
        <h1 className="text-title text-fg">
          KVKK Aydınlatma Metni
        </h1>
        <p className="text-sm text-fg-mute">
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmıştır.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Hangi verileriniz işleniyor?</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed">
          <li>Hesap bilgileriniz: ad soyad, e-posta adresi</li>
          <li>
            Başvuru kapsamında yüklediğiniz belgeler: özgeçmiş, sertifika, diploma,
            ehliyet, ustalık belgesi, çalışma örnekleri ve eklediğiniz bağlantılar
          </li>
          <li>
            Belge fotoğrafı yüklerseniz, o görüntüde yer alan diğer bilgiler (örneğin
            belge numarası, doğum tarihi veya fotoğrafınız) de işlenmiş olur. Yalnızca
            başvurunuzla ilgili kısımların göründüğü belgeler yüklemenizi öneririz.
          </li>
          <li>Başvuru kayıtlarınız ve bunların değerlendirme sonuçları</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Hangi amaçla işleniyor?</h2>
        <p className="text-sm leading-relaxed">
          Belgeleriniz, yalnızca başvurduğunuz ilanın gereksinimleriyle karşılaştırılması
          ve sonucun ilanı yayınlayan işverene sunulması amacıyla işlenir. Reklam veya
          pazarlama amacıyla kullanılmaz, üçüncü kişilere satılmaz.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Kimlerle paylaşılıyor?</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed">
          <li>
            <strong className="text-fg">Başvurduğunuz işveren:</strong> yalnızca o ilana
            yaptığınız başvurunun değerlendirme raporu.
          </li>
          <li>
            <strong className="text-fg">Google (Gemini API):</strong> belgelerinizin
            metni <em>ve fotoğrafı/taranmış görüntüsü</em>, değerlendirmenin yapılabilmesi
            için Google&apos;ın yapay zeka servisine iletilir. Bu, verinizin yurt dışına
            aktarılması anlamına gelir.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Ne kadar süreyle saklanıyor?</h2>
        <p className="text-sm leading-relaxed">
          Hesabınız açık kaldığı sürece. Hesabınızı sildiğinizde belgeleriniz ve
          değerlendirme kayıtlarınız da silinir.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Haklarınız</h2>
        <p className="text-sm leading-relaxed">
          Kanunun 11. maddesi uyarınca; verilerinize erişme, düzeltilmesini veya
          silinmesini isteme, işlenmesine verdiğiniz onayı geri çekme ve işlemeye itiraz
          etme haklarına sahipsiniz. Onayınızı geri çektiğinizde belgeleriniz yeni
          değerlendirmelerde kullanılmaz.
        </p>
      </section>

      <section className="space-y-3 border-t border-line pt-6" id="iletisim">
        <h2 className="text-xl font-semibold text-fg">İletişim</h2>
        <p className="text-sm leading-relaxed">
          Talepleriniz için platform üzerinden bizimle iletişime geçebilirsiniz.
        </p>
      </section>
    </article>
  );
}
