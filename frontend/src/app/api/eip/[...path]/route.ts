/**
 * Server-side proxy to the AI Engine (Isolated Intelligence Zone).
 *
 * The internal Zero Trust key must never reach the browser: any env var
 * prefixed NEXT_PUBLIC_ is inlined into the client bundle. This route
 * handler runs only on the Next.js server, attaches the key there, and
 * forwards the request — so the client talks to /api/eip/* and never
 * sees the key.
 *
 * Env (server-only, no NEXT_PUBLIC_ prefix):
 *   EIP_API_URL          — AI Engine base URL (default http://127.0.0.1:8080)
 *   EIP_INTERNAL_API_KEY — Zero Trust internal key
 */
import { NextRequest, NextResponse } from "next/server";

const ENGINE_URL = process.env.EIP_API_URL || "http://127.0.0.1:8080";
const INTERNAL_KEY = process.env.EIP_INTERNAL_API_KEY || "eif-test-internal-api-key";

// Only headers the engine actually needs are forwarded; everything else
// (cookies, browser fingerprint headers) stays on this side.
const FORWARDED_REQUEST_HEADERS = ["content-type", "authorization"];

// Long enough for a Gemini call over a PDF, short enough that a hung engine
// does not leave the user staring at a spinner forever.
const REQUEST_TIMEOUT_MS = 60_000;

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const search = req.nextUrl.search;
  // Preserve the caller's trailing slash. FastAPI declares the collection
  // routes as "/candidates/" etc. and answers a slash-less POST with a 307,
  // which we cannot follow (the body has already been consumed) — the fetch
  // then throws and every write turns into a 502. Keeping the slash means
  // no redirect happens in the first place.
  const trailingSlash = req.nextUrl.pathname.endsWith("/") ? "/" : "";
  const target = `${ENGINE_URL}/api/v1/${path.join("/")}${trailingSlash}${search}`;

  const headers = new Headers({ "X-Internal-API-Key": INTERNAL_KEY });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Every request reaches the engine from this server, so without this the
  // consent log recorded this proxy's own address for every candidate — the
  // column that is supposed to substantiate who granted consent. Pass the
  // caller's address on; the engine reads the left-most entry. It is only as
  // trustworthy as the ingress in front of Next, which is what sets it.
  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  // "manual" so an unexpected upstream redirect surfaces as a response we can
  // handle here, instead of a follow attempt that throws on an already-read body.
  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Pass the raw body through untouched so JSON and multipart uploads
    // (PDF resumes) both survive the hop.
    body = await req.arrayBuffer();
    init.body = body;
  }

  // The engine runs on a private network, so a redirect to its internal
  // hostname is unreachable from the browser. Follow it here instead, re-using
  // the buffered body — at most once, so a redirect loop cannot hang the route.
  async function send(url: string, allowRedirect: boolean): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (allowRedirect && res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        const next = new URL(location, url);
        if (next.origin === new URL(ENGINE_URL).origin) {
          return send(next.toString(), false);
        }
      }
    }
    return res;
  }

  let upstream: Response;
  try {
    upstream = await send(target, true);
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    console.error("[eip-proxy]", req.method, target, err);
    return NextResponse.json(
      {
        detail: timedOut
          ? "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin."
          : "Sunucuya şu anda ulaşılamıyor. Lütfen birazdan tekrar deneyin.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
