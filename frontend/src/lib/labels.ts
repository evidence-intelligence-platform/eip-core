// Turkish labels for the job-neutral requirement ids that jobs/page.tsx files
// evidence under (req_general_*). Shared by the report and candidate-profile
// pages so a reader never sees a raw machine id like "req_general_linkedin" —
// the two pages previously kept diverging copies of this map.
export const GENERAL_REQUIREMENT_LABELS: Record<string, string> = {
  req_general_cv: "Özgeçmiş",
  req_general_accomplishment: "Genel Mesleki Deneyim",
  req_general_linkedin: "LinkedIn / Profesyonel Profil",
  req_general_portfolio: "Portföy / Proje Bağlantısı",
  req_general_certificate: "Sertifika / Ehliyet",
  req_general_chatgpt: "Yapay Zekâ Sohbet Geçmişi",
};

/** Human label for a requirement id; falls back to the free-text description,
 *  then to a readable "İlan gereksinimi (#N)" instead of the raw req_job_N. */
export function requirementLabel(id: string, description?: string | null): string {
  const general = GENERAL_REQUIREMENT_LABELS[id];
  if (general) return general;
  if (description) return description;
  const jobMatch = /^req_job_(\d+)$/.exec(id);
  if (jobMatch) return `İlan gereksinimi (#${jobMatch[1]})`;
  return id;
}
