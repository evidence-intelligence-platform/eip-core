"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort error boundary: catches render errors in the root layout that
 * no nested boundary handled. Must render its own <html>/<body> because the
 * root layout is what just crashed. captureException is a safe no-op while
 * Sentry is uninitialized (no DSN), so this page works the same in dev.
 *
 * Colors are the "Mühür" tokens from globals.css, inlined because this page
 * renders without the root layout — and therefore without globals.css
 * (same reasoning as opengraph-image.tsx): warm ink ground #14110e, paper
 * whites #f4f0e8 / #9a9182, brass button #e3a84e on ink #2b1f0d.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          fontFamily: "system-ui, Arial, Helvetica, sans-serif",
          background: "#14110e",
          color: "#f4f0e8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>
            Beklenmeyen bir hata oluştu
          </h1>
          <p style={{ fontSize: 14, color: "#9a9182", marginBottom: 20 }}>
            Hata kaydedildi. Sayfayı yenilemeyi deneyebilirsiniz.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#e3a84e",
              color: "#2b1f0d",
              border: 0,
              borderRadius: 12, // --r-md
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
