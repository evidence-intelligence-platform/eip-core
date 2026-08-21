/**
 * Single source of truth for profession categories.
 *
 * This list used to be copy-pasted into three pages with no backend
 * counterpart, so the sector filters matched nothing. It now mirrors the
 * `category` column on job postings.
 *
 * Coverage note: the previous six categories left out the largest parts of
 * the Turkish workforce — teachers, cashiers, security staff, textile and
 * factory workers had nowhere to belong.
 */

// Icons: use <CategoryIcon k={category.key} /> (components/CategoryIcon.tsx)
// for the monochrome brass line-art glyphs — this list intentionally carries
// no emoji/icon field, so there's nothing here to reintroduce colour with.
export const CATEGORIES = [
  { key: "ALL", label: "Tüm Sektörler" },
  { key: "HEALTHCARE", label: "Sağlık" },
  { key: "EDUCATION", label: "Eğitim" },
  { key: "TECHNOLOGY", label: "Teknoloji & Yazılım" },
  { key: "TRANSPORTATION", label: "Ulaşım & Lojistik" },
  { key: "CONSTRUCTION", label: "İnşaat & Mimarlık" },
  { key: "MANUFACTURING", label: "Üretim & Sanayi" },
  { key: "GASTRONOMY", label: "Gastronomi & Mutfak" },
  { key: "RETAIL", label: "Perakende & Satış" },
  { key: "TOURISM", label: "Turizm & Konaklama" },
  { key: "FINANCE", label: "Finans & Muhasebe" },
  { key: "LEGAL", label: "Hukuk & Danışmanlık" },
  { key: "SECURITY", label: "Güvenlik" },
  { key: "AGRICULTURE", label: "Tarım & Hayvancılık" },
  { key: "BEAUTY", label: "Güzellik & Kişisel Bakım" },
  { key: "SERVICES", label: "Ev Hizmetleri & Bakım" },
  { key: "MEDIA", label: "Medya & Tasarım" },
  { key: "PUBLIC", label: "Kamu & Sosyal Hizmet" },
  { key: "OTHER", label: "Diğer" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** Categories an employer can assign — everything except the "all" filter. */
export const SELECTABLE_CATEGORIES = CATEGORIES.filter((c) => c.key !== "ALL");

export function categoryLabel(key: string | null | undefined): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? "Diğer";
}

