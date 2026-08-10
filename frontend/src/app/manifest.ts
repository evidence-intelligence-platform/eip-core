import type { MetadataRoute } from "next";

/**
 * Web app manifest — lets the site be added to a phone's home screen as a
 * standalone app, with the right name, brass theme colour and icon. Next.js
 * serves this at /manifest.webmanifest and links it automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EİP — Evidence Intelligence Platform",
    short_name: "EİP",
    description:
      "Her meslekten aday belgeleriyle başvurur; işveren kanıtı gerekçesiyle görür.",
    start_url: "/",
    display: "standalone",
    background_color: "#14110e",
    theme_color: "#14110e",
    lang: "tr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
