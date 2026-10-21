# Deploying Prepo

The repository ships a working container image, but no hosted deployment. This
is the runbook for putting one up: what the app needs, which hosts fit, how to
migrate and verify it, and what the deployment still cannot do.

## What the app actually needs

| Requirement | Why |
|---|---|
| **Node 22+** | Next.js 16 and the server scripts |
| **Postgres 17** (`DATABASE_URL`) | The production path. Prisma is not used; Drizzle's `node-postgres` driver and the RLS policies run the same SQL as PGlite. |
| **A persistent volume** mounted at `/data` | Audio uses the local-filesystem storage driver (ADR 0005). There is no S3/R2 driver, so without a volume every recording disappears on redeploy. |
| **`APP_URL`** | Absolute links in metadata, the Linear webhook URL and the integration page. Set it to the public origin, with no trailing slash. |
| **`INTEGRATION_ENCRYPTION_KEY`** | 32 bytes, base64 or 64 hex characters (`openssl rand -base64 32`). Without it Linear cannot be connected; the page says so. |
| Optional keys | `OPENROUTER_API_KEY` (extraction, Ask Prepo), `DEEPGRAM_API_KEY` (speech-to-text), `RESEND_API_KEY` + `RESEND_FROM` (email). Each absence is reported where the feature is, not hidden. |

The image runs as the unprivileged `node` user. Its entrypoint (`docker-entrypoint.sh`)
fixes ownership of the mounted volume and then drops privileges.

### Why not Vercel

Vercel's filesystem is ephemeral and it has no volume. PGlite cannot persist
there, and recordings would vanish. Using Vercel would mean adding a real object
store driver first; that is not in this repository, so a deployment there would
be a different product than the one documented here. Fly.io, Railway or any
container host with a volume is the honest fit.

## First deploy: Fly.io

Fly gives a stable `https://<app>.fly.dev` origin, an always-on machine and a
volume. A custom domain is optional and can be added later.

```powershell
# 1. CLI and account (one-time)
iwr https://fly.io/install.ps1 -useb | iex
fly auth signup          # or: fly auth login

# 2. Create the app and its data volume (pick a region near you)
fly apps create prepo-demo
fly volumes create prepo_data --region fra --size 1 -a prepo-demo

# 3. Database — Neon free tier works; use the pooled, TLS connection string
#    postgresql://user:pass@host/db?sslmode=require
fly secrets set -a prepo-demo `
  DATABASE_URL="postgresql://..." `
  APP_URL="https://prepo-demo.fly.dev" `
  INTEGRATION_ENCRYPTION_KEY="$(openssl rand -base64 32)"

# Optional, only if those features should work:
# fly secrets set -a prepo-demo OPENROUTER_API_KEY=... DEEPGRAM_API_KEY=... RESEND_API_KEY=... RESEND_FROM=...

# 4. Migrate and seed from the checkout, not from the image (see below)
$env:DATABASE_URL="postgresql://..."
pnpm --filter @prepo/web db:migrate
pnpm --filter @prepo/web db:seed

# 5. Deploy
fly deploy -a prepo-demo
fly open -a prepo-demo
```

`fly.toml` for that app:

```toml
app = "prepo-demo"
primary_region = "fra"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"
  AUDIO_STORAGE_DIR = "/data/audio"
  AUDIO_STAGING_DIR = "/data/incoming"

[[mounts]]
  source = "prepo_data"
  destination = "/data"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"     # keep the demo (and scans) reachable
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

[[http_service.checks]]
  grace_period = "30s"
  interval = "30s"
  method = "GET"
  path = "/api/health"
  timeout = "5s"
```

Keep it at **one machine**. The storage driver is a local directory, so a second
machine would have a second, empty `/data`; it is not a shared filesystem.

### Migrations

The runtime image is Next's standalone output: it has the server and its traced
dependencies, but not `tsx` or the migration sources. Run migrations from a
checkout or CI where `DATABASE_URL` is set:

```bash
pnpm --filter @prepo/web db:migrate
```

For repeatable deploys, run that step in a GitHub Actions job before `fly deploy`
with the connection string in a repository secret. Do not run it on every boot;
it is idempotent, but a failed migration should stop the deploy, not be retried
by a restart loop.

`db:seed` **truncates every table** and loads the Northwind/Globex demo. Use it
once for a demo instance, never on a deployment that has real data.

### A custom domain

`<app>.fly.dev` is a real HTTPS origin and is enough for securityheaders, ZAP and
a demo link. To use your own name:

```powershell
fly certs add prepo.example.com -a prepo-demo
# add the A/AAAA or CNAME record Fly prints, wait for the certificate
fly secrets set -a prepo-demo APP_URL="https://prepo.example.com"
fly deploy -a prepo-demo
```

The domain has to be bought/registered separately; this repository does not
include one.

## Railway (alternative)

1. New project → **Deploy from GitHub repo**; Railway detects the `Dockerfile`.
2. Add **PostgreSQL**; reference its `DATABASE_URL` in the web service.
3. Add a **volume** mounted at `/data`.
4. Variables: `APP_URL`, `INTEGRATION_ENCRYPTION_KEY`, optional provider keys.
5. Generate a public domain under **Settings → Networking**.
6. Run migrations with `railway run pnpm --filter @prepo/web db:migrate` from the
   checkout (it injects the project variables), then deploy.

Railway's trial credit is finite; check the current plan before leaving it on.

## Render (free tier, with a caveat)

A free Render web service sleeps after inactivity and has **no persistent disk**.
It can host the app for a header/ZAP scan, but recordings will not survive a
restart, so it is not a demo of the recording feature. A paid instance with a
disk mounted at `/data` is equivalent to the Fly setup. Free Postgres instances
expire; use Neon instead.

## Verify the deployment

```powershell
# 1. Process + database reachable (503 means the DB is not answering)
curl.exe -i https://prepo-demo.fly.dev/api/health

# 2. Tenant isolation against the real Postgres — do NOT omit PGLITE_DIR:
#    without it, "fresh" creates a throwaway PGlite and never touches your URL.
$env:DATABASE_URL="postgresql://..."
$env:PGLITE_DIR="$env:TEMP\prepo-deploy-verify"
pnpm --filter @prepo/web db:verify          # expect 12/12

# 3. The installable app over the real origin
$env:PREPO_CHECK_URL="https://prepo-demo.fly.dev"
pnpm --filter @prepo/web pwa:check

# 4. Headers, then a browser pass
#    https://securityheaders.com/?q=https://prepo-demo.fly.dev
```

`db:verify` seeds and truncates, so point it at a scratch database or accept that
it resets the demo. On a deployment with real data, run the isolation checks
against a restored copy instead; the suite's own restore drill shows the shape.

The local image was smoke-tested on 21 October 2026 against `postgres:17-alpine`:
`/api/health` returned 200, `/`, `/demo`, `/sign-in` and `/security` returned 200,
and `db:verify` passed 12/12 against that Postgres. That is evidence for the
image, not for any hosted origin.

## What this deployment still does not do

- **No object storage.** Recordings live on the volume. There is no R2/S3 driver,
  no CDN and no cross-region durability. A volume snapshot is the backup.
- **No off-machine database backup or PITR.** Neon's own branch/PITR feature is
  the practical answer; `db:restore-drill` covers the copy-and-verify mechanism,
  not a schedule.
- **No email domain.** `RESEND_API_KEY` alone still refuses every recipient
  except the account's own address until a sending domain is verified.
- **No automatic updates or desktop releases.** The shell is not packaged and
  checks for updates without installing them.
- **One instance.** The local audio driver and the in-process PGlite fallback
  both assume a single machine. Postgres scales, the volume does not.
- **No managed secrets rotation.** `INTEGRATION_ENCRYPTION_KEY` has no re-key
  path yet; changing it makes existing Linear tokens unreadable by design.
