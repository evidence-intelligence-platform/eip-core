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
const INTERNAL_KEY = process.env.EIP_INTERNAL_API_KEY;

// Only headers the engine actually needs are forwarded; everything else
// (cookies, browser fingerprint headers) stays on this side.
const FORWARDED_REQUEST_HEADERS = ["content-type", "authorization"];

// Response side is a whitelist too: content-type so the body parses,
// retry-after so a 429 can tell the client how long to wait, and
// content-disposition so media downloads keep their filename.
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "content-disposition"];

// Long enough for a Gemini call over a PDF, short enough that a hung engine
// does not leave the user staring at a spinner forever.
const REQUEST_TIMEOUT_MS = 60_000;

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  // Mirrors the engine's own verify_api_key(): a missing value is a 500,
  // never a silent bypass onto a known/default key (08_SECURITY_ARCHITECTURE.md §3.2).
  if (!INTERNAL_KEY) {
    console.error("[eip-proxy] EIP_INTERNAL_API_KEY is not set — refusing to proxy");
    return NextResponse.json(
      { detail: "Sunucu yapılandırma hatası. Lütfen daha sonra tekrar deneyin." },
      { status: 500 },
    );
  }

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
  // column that is supposed to substantiate who granted consent. The engine's
  // client_ip() (src/rate_limit.py) trusts the RIGHT-MOST X-Forwarded-For
  // entry, not the left-most — the left-most is attacker-supplied end to end
  // (08_SECURITY_ARCHITECTURE.md §10). We take only the right-most entry of
  // whatever arrived here and forward that single value, rather than relaying
  // the inbound chain verbatim, so this proxy's read of "right-most" and the
  // engine's agree regardless of how many hops a caller tries to prepend.
  //
  // Residual gap: this proxy is the layer directly in front of the engine
  // (private network, no further hop), so per the doc above it is the one
  // that should append the address it independently observed rather than
  // trust the caller's header at all. X-Forwarded-For is not a forbidden
  // header for browser fetch(), so a caller can set it on a request to
  // /api/eip/* directly. Next's own request pipeline only defaults this
  // header from the raw socket when it is absent (`req.headers['x-forwarded-for']
  // ??= originalRequest.socket.remoteAddress` in
  // next/dist/server/base-server.js) — a client-supplied header pre-empts
  // that, and Route Handlers have no supported API to read the raw socket
  // once it has. Fully closing this requires confirming (or configuring)
  // that whatever fronts this container strips a client-supplied
  // X-Forwarded-For before setting its own; that is a deployment concern
  // outside this file.
  const inboundIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  if (inboundIp) {
    const rightmost = inboundIp.split(",").pop()?.trim();
    if (rightmost) headers.set("x-forwarded-for", rightmost);
  }

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

  // One timeout budget for the whole exchange: the redirect follow-up below
  // reuses this signal instead of starting a fresh 60 s clock, which would
  // quietly double the worst case to 120 s.
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  // The engine runs on a private network, so a redirect to its internal
  // hostname is unreachable from the browser. Follow it here instead, re-using
  // the buffered body — at most once, so a redirect loop cannot hang the route.
  async function send(url: string, allowRedirect: boolean): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      ...(body === undefined ? {} : { body }),
      signal,
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

  // A redirect we chose not to follow cannot be forwarded meaningfully: its
  // Location points into the private network, and we strip it anyway. Name
  // the failure instead of handing the browser a locationless 3xx.
  if (upstream.status >= 300 && upstream.status < 400) {
    console.error("[eip-proxy] unfollowed redirect", req.method, target, "->", upstream.status);
    return NextResponse.json(
      { detail: "Sunucuya şu anda ulaşılamıyor. Lütfen birazdan tekrar deneyin." },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

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
