import { ImageResponse } from "next/og";

// Generated at build time so shared links render a real card instead of a
// blank grey box. No external assets — the CDN-hosted fonts and images a
// static file would need are exactly what makes og images rot.
//
// Colors are the "Mühür" tokens from globals.css, inlined because this image
// renders outside the CSS pipeline: warm ink ground (#14110e / #0d0b09),
// brass (#e3a84e), warm paper whites. No emoji — the seal is drawn inline,
// same rosette as SealMark in components/illustrations.
export const alt = "EİP — Kanıta Dayalı İşe Alım";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #14110e 0%, #0d0b09 60%, #1b1815 100%)",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Seal rosette — the SealMark logo, inlined */}
          <svg width="56" height="56" viewBox="0 0 44 44" fill="none">
            <path
              d="M22 3l3.2 3 4.3-1 1.8 4 4.4.8-.3 4.4 3.6 2.6-2.3 3.8 2.3 3.8-3.6 2.6.3 4.4-4.4.8-1.8 4-4.3-1-3.2 3-3.2-3-4.3 1-1.8-4-4.4-.8.3-4.4L4.7 24 7 20.2 4.7 16.4l3.6-2.6-.3-4.4 4.4-.8 1.8-4 4.3 1 3.2-3z"
              fill="#e3a84e"
              fillOpacity="0.14"
              stroke="#e3a84e"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M15.5 22.5l4.5 4.5 8.5-9.5"
              stroke="#e3a84e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ color: "#9a9182", fontSize: 26, letterSpacing: 4 }}>
            EVIDENCE INTELLIGENCE PLATFORM
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              color: "#f4f0e8",
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            İddia değil,&nbsp;<span style={{ color: "#e3a84e" }}>belge</span>&nbsp;konuşsun.
          </div>
          <div style={{ color: "#c9c2b4", fontSize: 32, lineHeight: 1.35, maxWidth: 900 }}>
            Aday belgeleriyle başvurur, işveren kanıtı gerekçesiyle görür.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {["Sağlık", "Lojistik", "Gastronomi", "İnşaat", "Teknoloji", "Hizmet"].map((s) => (
            <div
              key={s}
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                border: "1px solid #3d372f",
                color: "#c9c2b4",
                fontSize: 25,
              }}
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
