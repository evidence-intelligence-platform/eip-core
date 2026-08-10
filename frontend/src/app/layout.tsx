import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackgroundFX from "@/components/BackgroundFX";
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
      className={`${inter.variable} ${fraunces.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-ground text-fg">
        <BackgroundFX />
        <AuthProvider>
          <Navbar />
          <main className="flex-1 container mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
