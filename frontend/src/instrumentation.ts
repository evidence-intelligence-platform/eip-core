/**
 * Server-side error tracking (LAUNCH_READINESS launch blocker #5).
 *
 * Dormant without SENTRY_DSN: init is skipped entirely, and captureRequestError
 * is a no-op on an uninitialized SDK — so local dev and CI run exactly as
 * before. Set SENTRY_DSN in the frontend service's Railway Variables to
 * activate. (Server-only var — the client side reads NEXT_PUBLIC_SENTRY_DSN,
 * see instrumentation-client.ts.)
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    // KVKK: no request headers / IPs attached to events unless opted in later.
    sendDefaultPii: false,
  });
}

// Forwards server-side request errors (Server Components, route handlers —
// including the /api/eip proxy) to Sentry.
export const onRequestError = Sentry.captureRequestError;
