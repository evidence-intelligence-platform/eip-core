import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://frontend-production-f2347.up.railway.app";

/**
 * The public, crawlable pages. The authenticated app (dashboards, reports,
 * account) is intentionally left out — it is disallowed in robots.ts and
 * carries no organic-search value.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/jobs", "/login", "/register", "/kvkk", "/kullanim-sartlari"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "/jobs" ? "daily" : "monthly",
    priority: path === "" ? 1 : path === "/jobs" ? 0.9 : 0.5,
  }));
}
