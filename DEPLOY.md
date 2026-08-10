# EIP — Railway Deployment Guide

Architecture on Railway (one project, three services):

```
┌─────────────────────────── Railway Project: eip ───────────────────────────┐
│                                                                            │
│  frontend (public)          ai-engine (PRIVATE)          Postgres          │
│  Next.js  :PORT   ─────────▶ FastAPI  :PORT  ───────────▶ managed          │
│  proxy /api/eip/*  private   Zero Trust key   private     plugin           │
│                    network                    network                      │
└────────────────────────────────────────────────────────────────────────────┘
         ▲
         │ https (only public entry point)
       users
```

The AI Engine is **never exposed to the internet** — the frontend's
server-side proxy reaches it over Railway's private network. This mirrors
the "Isolated Intelligence Zone" design in `eif-core-docs`.

## 1. Create the project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `evidence-intelligence-platform/eip-core`
2. Add the **PostgreSQL** database plugin (New → Database → PostgreSQL).

## 2. Service: ai-engine

- New → GitHub Repo (same repo) → set **Root Directory** = `ai-engine`
  (`ai-engine/railway.json` supplies build/healthcheck settings)
- **Settings → Networking**: do NOT generate a public domain. Note the
  private hostname (e.g. `ai-engine.railway.internal`).
- **Variables**:

  | Variable | Value |
  |---|---|
  | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference) |
  | `INTERNAL_API_KEY` | generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
  | `JWT_SECRET_KEY` | generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
  | `GEMINI_API_KEY` | from https://aistudio.google.com/apikey |
  | `LLM_MODEL_NAME` | `gemini-2.5-flash` (optional, default) |
  | `FRONTEND_URL` | the frontend's public URL (e.g. `https://<app>.up.railway.app`) — password reset links point here |
  | `RESEND_API_KEY` | optional — from https://resend.com; without it e-mails are logged, not sent |
  | `EMAIL_FROM` | optional — verified sender, e.g. `EIP <no-reply@yourdomain.com>` |
  | `SENTRY_DSN` | optional — Python/FastAPI project DSN from https://sentry.io; empty = disabled |

  Migrations run automatically on boot (Dockerfile CMD).

## 3. Service: frontend

- New → GitHub Repo (same repo) → set **Root Directory** = `frontend`
- **Settings → Networking**: **Generate Domain** (this is the public URL).
- **Variables**:

  | Variable | Value |
  |---|---|
  | `EIP_API_URL` | `http://ai-engine.railway.internal:8080` — use the ai-engine service's private hostname and its PORT |
  | `EIP_INTERNAL_API_KEY` | same value as ai-engine's `INTERNAL_API_KEY` |
  | `SENTRY_DSN` | optional — Next.js project DSN; tracks server-side (proxy) errors |
  | `NEXT_PUBLIC_SENTRY_DSN` | optional — same DSN; inlined at build time for browser-side errors |

  Note: Railway private networking is HTTP within the project — the
  public edge still serves HTTPS to users.

## 4. Verify

1. Open the frontend's public domain → `/candidates` should render.
2. The engine must NOT be reachable publicly (it has no domain).
3. Check ai-engine deploy logs for `[MIGRATE]` / `[SUCCESS]` lines.

## Local development

Unchanged — copy `.env.example` to `.env` and use `docker compose up`,
or run the services directly (see README).
