import type { Metadata } from "next";
import Link from "next/link";
import { SealMark } from "@/components/illustrations";

export const metadata: Metadata = {
  title: "Kullanım Şartları — EİP",
  description:
    "EİP'yi kullanırken geçerli olan kurallar: hizmetin kapsamı, yükümlülükleriniz, moderasyon ve sorumluluğun sınırları.",
};

/**
 * Terms written the way the KVKK text is written: plain sentences, no legal
 * fog. If a rule can't be explained in one breath, it doesn't belong here.
 */
export default function KullanimSartlariPage() {
  return (
    <article className="max-w-3xl mx-auto py-12 space-y-8 text-fg-soft">
      <header className="space-y-4 border-b border-line pb-6">
        <SealMark className="w-10 h-10" />
        <h1 className="text-title text-fg">Kullanım Şartları</h1>
        <p className="text-sm text-fg-mute">
          Sade yazdık; okumak birkaç dakikanızı alır. EİP&apos;yi kullanarak bu
          şartları kabul etmiş olursunuz.
        </p>
        <p className="text-sm text-fg-mute">Son güncelleme: 21.08.2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">EİP ne yapar?</h2>
        <p className="text-sm leading-relaxed">
          EİP, işe alımı kanıta dayandıran bir platformdur. İş arayanlar;
          diploma, sertifika, ustalık belgesi, özgeçmiş gibi belgelerini
          yükleyerek ilanlara başvurur. Sistem bu belgeleri ilanın
          gereksinimleriyle karşılaştırır ve işverene gerekçeli bir
          değerlendirme raporu sunar.
        </p>
        <p className="text-sm leading-relaxed">
          EİP bir iş bulma kurumu değildir; kimseye iş garantisi vermez ve işe
          alım kararını vermez. Karar her zaman ilanı yayınlayan işverene
          aittir.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">
          Hesabınız ve yükümlülükleriniz
        </h2>
        <p className="text-sm leading-relaxed">
          Platform, herkesin belgesine güvenilebildiği sürece çalışır. Bu
          yüzden sizden şunları bekleriz:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed">
          <li>Hesap açarken doğru ve güncel bilgi vermeniz</li>
          <li>
            Yalnızca size ait olan veya paylaşmaya yetkili olduğunuz belgeleri
            yüklemeniz
          </li>
          <li>
            Sahte, üzerinde oynanmış veya yanıltıcı belge yüklememeniz — bu,
            hesabınızın kapatılmasının en kestirme yoludur
          </li>
          <li>
            Şifrenizi kimseyle paylaşmamanız; hesabınız üzerinden yapılan
            işlemlerden siz sorumlusunuz
          </li>
          <li>
            İşveren iseniz yalnızca gerçek ve güncel iş ilanları yayınlamanız
          </li>
          <li>Platformu hukuka aykırı bir amaçla kullanmamanız</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">İçerik ve moderasyon</h2>
        <p className="text-sm leading-relaxed">
          Yüklediğiniz belgeler, değerlendirmelerin güvenilir kalması için
          ekibimiz tarafından incelenebilir. Özellikle fotoğraf veya taranmış
          görüntü olarak yüklenen belgeler, işverene gösterilmeden önce insan
          kontrolünden geçer.
        </p>
        <p className="text-sm leading-relaxed">
          Sahte veya yanıltıcı olduğunu tespit ettiğimiz belgeleri kaldırırız;
          gerekirse ilgili hesabı askıya alır veya kapatırız. Kurallara aykırı
          ilanları da aynı şekilde yayından kaldırabiliriz. Böyle bir karara
          itirazınız varsa bizimle iletişime geçebilirsiniz.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">
          Yapay zekâ değerlendirmeleri hakkında
        </h2>
        <p className="text-sm leading-relaxed">
          Değerlendirme raporları yapay zekâ desteğiyle hazırlanır. Bu raporlar
          bir karar değil, karar desteğidir ve hata payı içerebilir.
          &quot;Yetersiz kanıt&quot; sonucu belgenizin sahte olduğu anlamına
          gelmez; yalnızca ilgili gereksinimin o belgeyle doğrulanamadığı
          anlamına gelir.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Sorumluluğun sınırları</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed">
          <li>
            EİP, işveren ile aday arasında kurulan iş ilişkisinin tarafı
            değildir; işe alım sürecinin sonucundan sorumlu tutulamaz.
          </li>
          <li>
            Değerlendirme raporlarının hatasız olduğunu veya bir başvurunun
            olumlu sonuçlanacağını taahhüt etmeyiz.
          </li>
          <li>
            Kullanıcıların yüklediği içerikten öncelikle o kullanıcı
            sorumludur; kurallara aykırı içerik bize bildirildiğinde inceler ve
            gereğini yaparız.
          </li>
          <li>
            Platform bakım veya teknik nedenlerle zaman zaman erişilemeyebilir;
            kesintisiz erişim garanti edilmez.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Kişisel verileriniz</h2>
        <p className="text-sm leading-relaxed">
          Verilerinizin hangi amaçla işlendiği, kimlerle paylaşıldığı ve
          haklarınız bu metnin değil,{" "}
          <Link
            href="/kvkk"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            KVKK Aydınlatma Metni
          </Link>
          &apos;nin konusudur. Kısaca: belgeleriniz yalnızca başvurularınızın
          değerlendirilmesi için işlenir, reklam için kullanılmaz, üçüncü
          kişilere satılmaz.
        </p>
        <p className="text-sm leading-relaxed">
          Hesabınızı dilediğiniz an{" "}
          <Link
            href="/hesap"
            className="text-brand hover:text-brand-strong hover:underline font-semibold transition-colors"
          >
            Hesap sayfanızdan
          </Link>{" "}
          kalıcı olarak silebilirsiniz; hesabınızla birlikte belgeleriniz ve
          değerlendirme kayıtlarınız da silinir.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Şartlarda değişiklik</h2>
        <p className="text-sm leading-relaxed">
          Bu şartları güncellememiz gerekirse yeni metni bu sayfada yayınlar,
          önemli değişiklikleri ayrıca platform üzerinden duyururuz.
          Güncellemeden sonra platformu kullanmaya devam etmeniz, yeni şartları
          kabul ettiğiniz anlamına gelir.
        </p>
      </section>

      <section className="space-y-3 border-t border-line pt-6" id="iletisim">
        <h2 className="text-xl font-semibold text-fg">İletişim</h2>
        <p className="text-sm leading-relaxed">
          Bu şartlarla ilgili sorularınız için platform üzerinden bizimle
          iletişime geçebilirsiniz.
        </p>
      </section>
    </article>
  );
}
