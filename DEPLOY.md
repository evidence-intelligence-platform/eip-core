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
  | `LLM_MODEL_NAME` | `gemini-flash-latest` (optional, default) — pin a concrete model only if reproducibility matters |
  | `FRONTEND_URL` | the frontend's public URL (e.g. `https://<app>.up.railway.app`) — password reset links point here |
  | `RESEND_API_KEY` | optional — from https://resend.com; without it e-mails are logged, not sent |
  | `EMAIL_FROM` | optional — verified sender, e.g. `EIP <no-reply@yourdomain.com>` |
  | `SENTRY_DSN` | optional — Python/FastAPI project DSN from https://sentry.io; empty = disabled |
  | `UPLOAD_DIR` | **required** — `/data/uploads`, i.e. a path *inside* the volume from §2.1 |

  Migrations run automatically on boot (Dockerfile CMD).

### 2.1 Persistent storage for uploaded evidence (required)

Uploaded documents — photographed certificates, scanned diplomas, driving
licences — are written to disk and their `Evidence` row starts as
`review_status = "pending"` until an admin looks at the file. Railway
containers have an **ephemeral filesystem**: without a volume, every redeploy
(including one triggered by a routine `git push`) deletes exactly those
pending documents, while the `media_path` column survives in Postgres. The
loss then surfaces days later as evidence an admin cannot open — and the
platform's "a human reviewed this" guarantee is what silently breaks.

1. ai-engine service → **Settings → Volumes → New Volume**
2. **Mount path**: `/data`
3. **Variables**: `UPLOAD_DIR = /data/uploads` (a subdirectory of the mount —
   the engine creates it at startup)
4. Redeploy, then check the deploy log for `Kanıt deposu hazır: /data/uploads`.

The engine logs a warning at startup when `UPLOAD_DIR` is unset, and an error
when the directory it names cannot be written to. Do not ignore either line;
both mean uploads are being lost or refused. Where files were already lost,
the moderation panel answers `409` to an approval whose document it cannot
open — an admin can still reject those rows, but nothing may be approved
unseen.

Notes:
- A Railway volume attaches to **one** service and pins it to a single
  replica. Scaling the engine horizontally requires moving blobs to object
  storage (S3/R2) first.
- Changing `UPLOAD_DIR` later does **not** move existing files. Copy them
  across before switching, or already-approved evidence becomes unviewable.

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
4. Storage survives a redeploy: upload a document, confirm it appears in
   `/admin/moderation` and opens, redeploy the engine, then open it again.
   If it 404s afterwards, the volume from §2.1 is missing or `UPLOAD_DIR`
   points outside it.
5. Confirm the Zero Trust boundary actually held after the real deploy —
   don't assume it from §2's configuration. Run
   `ai-engine/scripts/health_check.py` against the freshly deployed
   environment, e.g. `railway run --service ai-engine python scripts/health_check.py`.
   It proves (not assumes) that unauthenticated, internal-key-only,
   tampered-JWT and wrong-role requests are all refused.

## 5. Backups

### 5a. Configure backups (do this — it does not run on its own)

`.github/workflows/backup.yml` exists in the repo from day one, but a nightly
backup does not start happening just because the file is there. GitHub only
e-mails a scheduled-workflow failure to whoever last edited the cron line, so
if this step is skipped the job fails silently every night and no one
notices until a restore is needed. Three things must be done deliberately,
once, in production:

1. **Create the read-only backup role.** Run
   `ai-engine/scripts/create_backup_role.sql` once against production
   Postgres, as a superuser:

   ```
   psql "$ADMIN_DATABASE_URL" -v pw="'a-long-random-password'" \
        -f ai-engine/scripts/create_backup_role.sql
   ```

   This creates an `eip_backup` role that can `SELECT` everywhere and
   nothing else — see the script's header comment for details.

2. **Set the `DATABASE_URL` repo secret to the PUBLIC/proxy host, built from
   that role** — not the ai-engine service's private `*.railway.internal`
   DSN used in §2. GitHub Actions runners are not on Railway's private
   network, so the internal hostname will not resolve/connect from CI; use
   Railway's public Postgres proxy host and port instead:

   ```
   postgresql://eip_backup:<password>@<public-proxy-host>:<public-proxy-port>/<database>
   ```

3. **Add the R2 secrets.** Under repo → **Settings → Secrets and variables →
   Actions**, add: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET` (Cloudflare R2 bucket to hold the dumps, e.g.
   `eip-db-backups`).

Once all five secrets (`DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) are set, trigger the workflow manually
once (Actions → Database backup → Run workflow) to confirm it succeeds
before relying on the 03:00 UTC schedule.

### 5b. What is and is not covered

`.github/workflows/backup.yml` runs a nightly `pg_dump` to Cloudflare R2.
That backup covers **Postgres only**.

**Uploaded evidence files are NOT backed up.** They exist in exactly one
place: the volume from §2.1. Deleting that volume, or losing it, destroys
every stored diploma, certificate and licence permanently — the database
keeps the `media_path` rows pointing at files that no longer exist, so the
damage is invisible until an admin opens the moderation queue.

Until file-level backups exist (object storage with versioning is the
intended fix), treat the uploads volume as unrecoverable data: never detach
or recreate it as part of a routine deploy.

## Local development

Unchanged — copy `.env.example` to `.env` and use `docker compose up`,
or run the services directly (see README).
