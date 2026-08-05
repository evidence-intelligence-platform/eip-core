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

export const CATEGORIES = [
  { key: "ALL", label: "Tüm Sektörler", icon: "🌐" },
  { key: "HEALTHCARE", label: "Sağlık", icon: "🩺" },
  { key: "EDUCATION", label: "Eğitim", icon: "🎓" },
  { key: "TECHNOLOGY", label: "Teknoloji & Yazılım", icon: "💻" },
  { key: "TRANSPORTATION", label: "Ulaşım & Lojistik", icon: "🚚" },
  { key: "CONSTRUCTION", label: "İnşaat & Mimarlık", icon: "🏗️" },
  { key: "MANUFACTURING", label: "Üretim & Sanayi", icon: "🏭" },
  { key: "GASTRONOMY", label: "Gastronomi & Mutfak", icon: "🍳" },
  { key: "RETAIL", label: "Perakende & Satış", icon: "🛒" },
  { key: "TOURISM", label: "Turizm & Konaklama", icon: "🏨" },
  { key: "FINANCE", label: "Finans & Muhasebe", icon: "📊" },
  { key: "LEGAL", label: "Hukuk & Danışmanlık", icon: "⚖️" },
  { key: "SECURITY", label: "Güvenlik", icon: "🛡️" },
  { key: "AGRICULTURE", label: "Tarım & Hayvancılık", icon: "🌾" },
  { key: "BEAUTY", label: "Güzellik & Kişisel Bakım", icon: "💇" },
  { key: "SERVICES", label: "Ev Hizmetleri & Bakım", icon: "🧹" },
  { key: "MEDIA", label: "Medya & Tasarım", icon: "🎬" },
  { key: "PUBLIC", label: "Kamu & Sosyal Hizmet", icon: "🏛️" },
  { key: "OTHER", label: "Diğer", icon: "📋" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** Categories an employer can assign — everything except the "all" filter. */
export const SELECTABLE_CATEGORIES = CATEGORIES.filter((c) => c.key !== "ALL");

export function categoryLabel(key: string | null | undefined): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? "Diğer";
}

export function categoryIcon(key: string | null | undefined): string {
  return CATEGORIES.find((c) => c.key === key)?.icon ?? "📋";
}
