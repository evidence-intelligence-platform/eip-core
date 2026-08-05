import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950/80 mt-auto">
      <div className="container mx-auto px-4 py-10 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white font-bold">
              <span className="text-blue-500" aria-hidden="true">
                ⚡
              </span>
              <span>Evidence Intelligence Platform</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-xs">
              Her meslek grubu için kanıta dayalı işe alım. Aday belgesiyle başvurur,
              işveren gerekçesiyle görür.
            </p>
          </div>

          <nav className="space-y-2 text-sm" aria-label="Platform bağlantıları">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Platform
            </h2>
            <ul className="space-y-1.5">
              <li>
                <Link href="/jobs" className="text-zinc-400 hover:text-white transition">
                  İş İlanları
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-zinc-400 hover:text-white transition">
                  Hesap Oluştur
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-zinc-400 hover:text-white transition">
                  Giriş Yap
                </Link>
              </li>
            </ul>
          </nav>

          <nav className="space-y-2 text-sm" aria-label="Yasal bağlantılar">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Yasal
            </h2>
            <ul className="space-y-1.5">
              <li>
                <Link href="/kvkk" className="text-zinc-400 hover:text-white transition">
                  KVKK Aydınlatma Metni
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <p className="text-xs text-zinc-500 border-t border-zinc-800 pt-6">
          © {new Date().getFullYear()} Evidence Intelligence Platform
        </p>
      </div>
    </footer>
  );
}
