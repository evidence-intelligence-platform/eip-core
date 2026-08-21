/**
 * Client-side (browser) error tracking.
 *
 * NEXT_PUBLIC_SENTRY_DSN is inlined into the bundle at build time — a DSN is
 * a write-only ingest address, safe to expose, unlike the internal API key.
 * Without it this file initializes nothing and every hook below is a no-op.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  // A typo'd rate must fall back to the default, not reach Sentry as NaN.
  const rate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1");

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: Number.isFinite(rate) ? rate : 0.1,
    // KVKK: never attach personal data to browser events.
    sendDefaultPii: false,
  });
}

// Marks router navigations in performance traces (no-op while uninitialized).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
