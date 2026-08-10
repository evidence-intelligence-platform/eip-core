import type { SVGProps } from "react";

/**
 * Monochrome line icons for the profession categories, replacing the colourful
 * OS emoji that clashed with the platform's brass line-art identity. Every
 * glyph is a single inline SVG on a 24×24 grid, stroked in currentColor, so it
 * inherits the text colour of whatever chip or pill hosts it and stays crisp
 * at any size. Keys mirror lib/categories.ts.
 */

const P = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const GLYPHS: Record<string, React.ReactNode> = {
  // Tüm Sektörler — a small grid of tiles
  ALL: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" {...P} />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" {...P} />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" {...P} />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" {...P} />
    </>
  ),
  // Sağlık — medical cross
  HEALTHCARE: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" {...P} />
      <path d="M12 8.5v7M8.5 12h7" {...P} />
    </>
  ),
  // Eğitim — graduation cap
  EDUCATION: (
    <>
      <path d="M12 5 21 9l-9 4-9-4 9-4Z" {...P} />
      <path d="M6.5 11v4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4" {...P} />
    </>
  ),
  // Teknoloji & Yazılım — code brackets
  TECHNOLOGY: (
    <>
      <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4" {...P} />
      <path d="M13.5 6.5 10.5 17.5" {...P} />
    </>
  ),
  // Ulaşım & Lojistik — truck
  TRANSPORTATION: (
    <>
      <path d="M3.5 7.5h9v7h-9zM12.5 10.5h4l3 3v1h-7z" {...P} />
      <circle cx="7" cy="16.5" r="1.6" {...P} />
      <circle cx="16.5" cy="16.5" r="1.6" {...P} />
    </>
  ),
  // İnşaat & Mimarlık — hard hat
  CONSTRUCTION: (
    <>
      <path d="M4 16.5a8 8 0 0 1 16 0" {...P} />
      <path d="M3 16.5h18M10 8.5a2 2 0 0 1 4 0v2.5M12 6.5V5" {...P} />
    </>
  ),
  // Üretim & Sanayi — factory
  MANUFACTURING: (
    <>
      <path d="M4 19.5v-9l5 3v-3l5 3v-3l5 3v6z" {...P} />
      <path d="M8 19.5v-3M12 19.5v-3M16 19.5v-3" {...P} />
    </>
  ),
  // Gastronomi & Mutfak — chef's toque
  GASTRONOMY: (
    <>
      <path d="M7 13.5a3.5 3.5 0 1 1 1.2-6.8 3.5 3.5 0 0 1 7.6 0A3.5 3.5 0 1 1 17 13.5z" {...P} />
      <path d="M7 13.5v4.5h10v-4.5" {...P} />
    </>
  ),
  // Perakende & Satış — shopping bag
  RETAIL: (
    <>
      <path d="M6 8h12l-1 11H7z" {...P} />
      <path d="M9 8a3 3 0 0 1 6 0" {...P} />
    </>
  ),
  // Turizm & Konaklama — bed
  TOURISM: (
    <>
      <path d="M3.5 8v9M3.5 12.5h17V17M20.5 15v2" {...P} />
      <path d="M3.5 12.5v-1a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v1" {...P} />
    </>
  ),
  // Finans & Muhasebe — bar chart
  FINANCE: (
    <>
      <path d="M4 20h16" {...P} />
      <path d="M7 20v-6M12 20V8M17 20v-9" {...P} />
    </>
  ),
  // Hukuk & Danışmanlık — scales
  LEGAL: (
    <>
      <path d="M12 5v14M7 19h10M5 8h14M8 5.5 5 8l-2 4a3 3 0 0 0 6 0zM16 5.5 19 8l2 4a3 3 0 0 1-6 0z" {...P} />
    </>
  ),
  // Güvenlik — shield
  SECURITY: (
    <>
      <path d="M12 4 5.5 6.5V12c0 4 2.8 6.6 6.5 8 3.7-1.4 6.5-4 6.5-8V6.5z" {...P} />
    </>
  ),
  // Tarım & Hayvancılık — wheat
  AGRICULTURE: (
    <>
      <path d="M12 20V9" {...P} />
      <path d="M12 9c0-2 1.4-3.4 3.4-3.4C15.4 7.6 14 9 12 9ZM12 9c0-2-1.4-3.4-3.4-3.4C8.6 7.6 10 9 12 9ZM12 13c0-2 1.4-3.4 3.4-3.4C15.4 11.6 14 13 12 13ZM12 13c0-2-1.4-3.4-3.4-3.4C8.6 11.6 10 13 12 13Z" {...P} />
    </>
  ),
  // Güzellik & Kişisel Bakım — scissors
  BEAUTY: (
    <>
      <circle cx="7" cy="7" r="2.2" {...P} />
      <circle cx="7" cy="17" r="2.2" {...P} />
      <path d="M9 8.5 19 17M9 15.5 19 7" {...P} />
    </>
  ),
  // Ev Hizmetleri & Bakım — house
  SERVICES: (
    <>
      <path d="M4 11.5 12 5l8 6.5" {...P} />
      <path d="M6 10.5V19h12v-8.5" {...P} />
      <path d="M10.5 19v-4.5h3V19" {...P} />
    </>
  ),
  // Medya & Tasarım — play
  MEDIA: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2.5" {...P} />
      <path d="M10.5 9.5 15 12l-4.5 2.5z" {...P} />
    </>
  ),
  // Kamu & Sosyal Hizmet — classical building
  PUBLIC: (
    <>
      <path d="M4 9.5 12 5l8 4.5M4.5 9.5h15" {...P} />
      <path d="M6.5 9.5V17M10 9.5V17M14 9.5V17M17.5 9.5V17M4 19.5h16" {...P} />
    </>
  ),
  // Diğer — tag
  OTHER: (
    <>
      <path d="M4.5 12.5 11 6h6.5v6.5L11 19z" {...P} />
      <circle cx="14.5" cy="9.5" r="1.1" {...P} />
    </>
  ),
};

export function CategoryIcon({
  k,
  className = "w-4 h-4",
  ...rest
}: { k: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...rest}>
      {GLYPHS[k] ?? GLYPHS.OTHER}
    </svg>
  );
}

/** Standalone line icons that replace the remaining stray emoji. */

export function SearchIcon({ className = "w-4 h-4", ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...rest}>
      <circle cx="11" cy="11" r="6" {...P} />
      <path d="m20 20-3.5-3.5" {...P} />
    </svg>
  );
}

export function PersonIcon({ className = "w-6 h-6", ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...rest}>
      <circle cx="12" cy="8" r="3.5" {...P} />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" {...P} />
    </svg>
  );
}

export function BuildingIcon({ className = "w-6 h-6", ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...rest}>
      <path d="M6 20V5.5A1.5 1.5 0 0 1 7.5 4h6A1.5 1.5 0 0 1 15 5.5V20" {...P} />
      <path d="M15 9h2.5A1.5 1.5 0 0 1 19 10.5V20M4 20h16" {...P} />
      <path d="M9 8h3M9 11.5h3M9 15h3" {...P} />
    </svg>
  );
}
