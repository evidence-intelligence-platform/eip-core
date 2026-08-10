import { ImageResponse } from "next/og";

// iOS home-screen icon (180×180). Next.js serves this at /apple-icon and
// links it in <head> automatically. The brass seal on the warm-dark ground,
// matching the in-app SealMark.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#14110e",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 44 44" fill="none">
          <path
            d="M22 3l3.2 3 4.3-1 1.8 4 4.4.8-.3 4.4 3.6 2.6-2.3 3.8 2.3 3.8-3.6 2.6.3 4.4-4.4.8-1.8 4-4.3-1-3.2 3-3.2-3-4.3 1-1.8-4-4.4-.8.3-4.4L4.7 24 7 20.2 4.7 16.4l3.6-2.6-.3-4.4 4.4-.8 1.8-4 4.3 1 3.2-3z"
            fill="#e3a84e"
            fillOpacity="0.16"
            stroke="#e3a84e"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="22" cy="22" r="12.5" stroke="#e3a84e" strokeWidth="1" opacity="0.55" />
          <path
            d="M15.5 22.6l4.6 4.6L29 16.8"
            stroke="#efc078"
            strokeWidth="2.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    size
  );
}
