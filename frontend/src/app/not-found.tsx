import Link from "next/link";
import { SealMark } from "@/components/illustrations";

export const metadata = {
  title: "Sayfa bulunamadı — EİP",
};

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto my-16 md:my-24 text-center space-y-6 px-4">
      <SealMark className="w-16 h-16 mx-auto opacity-70 animate-float" />
      <div className="space-y-2">
        <p className="eyebrow">404</p>
        <h1 className="text-title text-fg">Aradığınız sayfa burada değil</h1>
        <p className="text-fg-soft leading-relaxed">
          Bağlantı taşınmış, süresi dolmuş ya da hiç var olmamış olabilir.
          Belgeleriniz güvende — yalnızca bu adres bulunamadı.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <Link href="/" className="btn btn-brand btn-shine">
          Ana sayfaya dön
        </Link>
        <Link href="/jobs" className="btn btn-quiet">
          İlanlara göz at
        </Link>
      </div>
    </div>
  );
}
