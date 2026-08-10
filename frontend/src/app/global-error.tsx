"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort error boundary: catches render errors in the root layout that
 * no nested boundary handled. Must render its own <html>/<body> because the
 * root layout is what just crashed. captureException is a safe no-op while
 * Sentry is uninitialized (no DSN), so this page works the same in dev.
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
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#0d1216",
          color: "#e8ecef",
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
          <p style={{ fontSize: 14, color: "#9aa7b0", marginBottom: 20 }}>
            Hata kaydedildi. Sayfayı yenilemeyi deneyebilirsiniz.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#1f6feb",
              color: "#ffffff",
              border: 0,
              borderRadius: 6,
              padding: "10px 18px",
              fontSize: 14,
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
