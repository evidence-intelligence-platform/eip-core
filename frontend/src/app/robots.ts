import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://frontend-production-f2347.up.railway.app";

/**
 * Crawlers may index the public marketing/listing pages, but never the
 * authenticated app surface or the server-side engine proxy.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/hesap",
        "/candidate/",
        "/employer/",
        "/admin/",
        "/reports/",
        "/candidates/",
        "/requirements",
        "/sifre-sifirla",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
