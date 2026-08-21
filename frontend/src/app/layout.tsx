import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackgroundFX from "@/components/BackgroundFX";
import ScrollProgress from "@/components/ScrollProgress";
import { AuthProvider } from "@/context/AuthContext";

// latin-ext is not optional here: without it ğ, ş, İ and friends fall back
// to a different face mid-word.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

// Display serif for headlines only — warm, editorial, nothing like the
// gradient-sans of every AI landing page.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://frontend-production-f2347.up.railway.app";
const TITLE = "EİP — Kanıta Dayalı İşe Alım";
const DESCRIPTION =
  "Her meslekten aday, belgeleriyle başvurur; işveren kanıtı gerekçesiyle birlikte görür. Sağlıktan lojistiğe, mutfaktan inşaata tüm sektörler için.";

// Paint the browser chrome (mobile URL bar, PWA title bar) in the warm-ink
// ground instead of default white. themeColor lives on the viewport export
// in Next 15+, not in metadata.
export const viewport: Viewport = {
  themeColor: "#14110e",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Evidence Intelligence Platform",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ground text-fg">
        <BackgroundFX />
        <ScrollProgress />
        <AuthProvider>
          <Navbar />
          {/* px-4 matches the Navbar and Footer containers exactly, so all
              three share one gutter line at every breakpoint. */}
          <main className="flex-1 container mx-auto px-4 py-4 sm:py-6 lg:py-8">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
