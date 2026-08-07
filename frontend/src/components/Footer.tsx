import Link from "next/link";
import { SealMark } from "@/components/illustrations";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-well mt-auto">
      <div className="container mx-auto px-4 py-12 space-y-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-fg font-semibold">
              <SealMark className="w-6 h-6" />
              <span>EİP</span>
            </div>
            <p className="text-xs text-fg-soft leading-relaxed max-w-xs">
              Emeğin belgesi vardır. EİP, her meslekten insanın belgesiyle
              başvurduğu, işverenin kanıtı gerekçesiyle gördüğü işe alım
              platformudur.
            </p>
          </div>

          <nav className="space-y-3 text-sm" aria-label="Platform bağlantıları">
            <h2 className="eyebrow">Platform</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/jobs"
                  className="text-fg-soft hover:text-fg transition-colors"
                >
                  İş İlanları
                </Link>
              </li>
              <li>
                <Link
                  href="/register"
                  className="text-fg-soft hover:text-fg transition-colors"
                >
                  Hesap Oluştur
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-fg-soft hover:text-fg transition-colors"
                >
                  Giriş Yap
                </Link>
              </li>
            </ul>
          </nav>

          <nav
            className="space-y-3 text-sm"
            aria-label="Yasal ve iletişim bağlantıları"
          >
            <h2 className="eyebrow">Yasal &amp; İletişim</h2>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/kvkk"
                  className="text-fg-soft hover:text-fg transition-colors"
                >
                  KVKK Aydınlatma Metni
                </Link>
              </li>
              <li>
                <Link
                  href="/kullanim-sartlari"
                  className="text-fg-soft hover:text-fg transition-colors"
                >
                  Kullanım Şartları
                </Link>
              </li>
              <li>
                <Link
                  href="/kvkk#iletisim"
                  className="text-fg-soft hover:text-fg transition-colors"
                >
                  İletişim
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-line pt-6">
          <p className="text-xs text-fg-mute">
            © 2026 EİP — Evidence Intelligence Platform
          </p>
          <p className="text-xs text-fg-mute">
            Belgeleriniz yalnızca onayınızla işlenir.
          </p>
        </div>
      </div>
    </footer>
  );
}
