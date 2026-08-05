import { ImageResponse } from "next/og";

// Generated at build time so shared links render a real card instead of a
// blank grey box. No external assets — the CDN-hosted fonts and images a
// static file would need are exactly what makes og images rot.
export const alt = "EIP — Kanıta Dayalı İşe Alım";
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
          background: "linear-gradient(135deg, #0B1220 0%, #050810 55%, #0A1A2E 100%)",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#2563EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            ⚡
          </div>
          <div style={{ color: "#93A4BF", fontSize: 26, letterSpacing: 2 }}>
            EVIDENCE INTELLIGENCE PLATFORM
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              color: "#FFFFFF",
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            Kanıta dayalı işe alım
          </div>
          <div style={{ color: "#A9BAD4", fontSize: 32, lineHeight: 1.35, maxWidth: 900 }}>
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
                border: "1px solid #24354F",
                color: "#8FA3C0",
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
