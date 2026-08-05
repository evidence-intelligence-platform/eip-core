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

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const search = req.nextUrl.search;
  const target = `${ENGINE_URL}/api/v1/${path.join("/")}${search}`;

  const headers = new Headers({ "X-Internal-API-Key": INTERNAL_KEY });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Pass the raw body through untouched so JSON and multipart uploads
    // (PDF resumes) both survive the hop.
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json(
      { detail: "AI Engine unreachable" },
      { status: 502 },
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
