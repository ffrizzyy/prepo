# Deploying Prepo

The repository ships a working container image and a hosted instance:
[`https://prepo-web-production.up.railway.app`](https://prepo-web-production.up.railway.app),
deployed 21 October 2026 on Railway's free trial with Neon Postgres and a 500 MB
volume. This is the runbook for that deployment: what the app needs, how this
instance is wired, how to migrate and verify it, the Fly.io path for a paid
always-on host, and what no deployment here can do.

Two limits are part of the instance, not an afterthought: the Railway trial's
credit expires around **20 November 2026** (after which the service stops unless
it moves to a paid plan), and no AI provider keys are set on the public
instance, so extraction, transcription and Resend email report themselves
unconfigured there instead of failing silently or spending a key anonymously.

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

## Current deployment: Railway free trial

Railway's free trial is the one host tried here that created a service without a
card: `$5` of credit for 30 days, a public `*.up.railway.app` domain, a 500 MB
volume, and a per-service cap of 2 vCPU / 1 GB. Render and Fly both refused
service creation with a payment-required error (HTTP 402) despite advertising
free tiers, so they are not the current path.

| Piece | Value on this instance |
|---|---|
| Project | `prepo-demo` (`ef5e6845-95b6-4175-bfca-30c5277756d3`) |
| Service | `prepo-web` (`3415935a-ea06-4c0b-9694-d2d4a5179873`) |
| Volume | `prepo-web-volume`, 500 MB, mounted at `/data` |
| Public origin | `https://prepo-web-production.up.railway.app` |
| Database | Neon `prepo-demo` (`lively-lake-34658833`, `aws-eu-central-1`), pooled URL in `DATABASE_URL` |
| Build | Repository root `Dockerfile`, Next standalone output |
| Health check | `GET /api/health` (200 `{"ok":true}` only when the database answers) |

### Deploy commands (PowerShell)

```powershell
# 1. CLI and account once
npm install -g @railway/cli
railway login

# 2. Project and service (skip if they already exist)
railway init --name prepo-demo --json
railway add --service prepo-web

# 3. Volume, public domain
railway volume -s <service-id> add --mount-path /data --json
railway domain -s <service-id> --json

# 4. Variables. Values come from files/stdin so they never land in shell history
#    or in the terminal scrollback.
Get-Content "$env:TEMP\prepo-neon-url.txt" -Raw |
  railway variable set DATABASE_URL --stdin -s <service-id> --skip-deploys
Get-Content "$env:TEMP\prepo-integration-key.txt" -Raw |
  railway variable set INTEGRATION_ENCRYPTION_KEY --stdin -s <service-id> --skip-deploys
"https://<service>.up.railway.app" |
  railway variable set APP_URL --stdin -s <service-id> --skip-deploys

# 5. Schema and demo data, from a checkout against the same DATABASE_URL
$env:DATABASE_URL = (Get-Content "$env:TEMP\prepo-neon-url.txt" -Raw).Trim()
pnpm --filter @prepo/web db:migrate
pnpm --filter @prepo/web db:seed

# 6. Deploy the working tree (no commit is required to deploy)
railway up -s <service-id> -y -c
```

`railway.toml` records the build and health check; the volume is attached to the
service in the dashboard. `railway up` uploads the current tree, so deploy only
after the tree is the one you mean to ship, and commit/push separately so CI
sees the same code.

The first deploy exposed a real bug: `sitemap.xml` and `robots.txt` were static,
and a Docker build does not inherit the service's `APP_URL`, so they advertised
`http://localhost:3000`. Both routes now export `dynamic = "force-dynamic"` and
read the origin per request. `pwa:check` was tightened to fail any sitemap or
robots entry that is not the origin being checked; that assertion failed against
the broken deploy and passed after the fix, which is the evidence that it tests
the right thing.

### Trial limits

- **Expiry:** the $5 credit and 30-day trial end around **20 November 2026**.
  After that the service stops unless it is moved to Hobby ($5/month) or another
  paid host; there is no card on the account, so that is a decision, not an
  automatic renewal.
- **Volume:** 500 MB, single instance. The storage driver is a local directory;
  a second replica would have a second, empty volume. Do not scale this service.
- **Domain:** a platform subdomain, not a custom domain. Passkeys and an
  installed PWA are bound to it; a later move needs re-registration/reinstall.

## Future paid path: Fly.io

Fly gives a stable `https://<app>.fly.dev` origin, an always-on machine and a
volume. A custom domain is optional and can be added later. It needs payment
information at service creation today, so it is the path after the trial, not
the one this instance uses.

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

The repository includes `fly.toml` with this shape (change `app` if the name is taken):

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

## Render (free tier, with a caveat)

A free Render web service sleeps after inactivity and has **no persistent disk**.
It can host the app for a header/ZAP scan, but recordings will not survive a
restart, so it is not a demo of the recording feature. A paid instance with a
disk mounted at `/data` is equivalent to the Fly setup. Free Postgres instances
expire; use Neon instead.

Render also returned HTTP 402 (payment information required) when a service was
created on 21 October 2026, so the free tier was not reachable for this account.

## Verify the deployment

```powershell
$base = "https://prepo-web-production.up.railway.app"

# 1. Process + database reachable (503 means the DB is not answering), and the
#    routes that have no session requirement.
curl.exe -i "$base/api/health"
foreach ($p in "/", "/demo", "/sign-in", "/security", "/manifest.webmanifest", "/.well-known/security.txt") {
  curl.exe -s -o NUL -w "$p %{http_code}`n" "$base$p"
}

# 2. The origin is the deployment's, not a build-time localhost. Both must name
#    $base; this is the check that failed on the first deploy.
curl.exe -s "$base/sitemap.xml"
curl.exe -s "$base/robots.txt"

# 3. Tenant isolation against the real Postgres — do NOT omit PGLITE_DIR:
#    without it, "fresh" creates a throwaway PGlite and never touches your URL.
$env:DATABASE_URL = (Get-Content "$env:TEMP\prepo-neon-url.txt" -Raw).Trim()
$env:PGLITE_DIR = "$env:TEMP\prepo-deploy-verify"
pnpm --filter @prepo/web db:verify          # expect 12/12

# 4. The installable app over the real origin
$env:PREPO_CHECK_URL = $base
pnpm --filter @prepo/web pwa:check

# 5. Headers, then a browser pass
#    https://securityheaders.com/?q=https://prepo-web-production.up.railway.app

# 6. ZAP baseline, report outside the repository
$zap = "$env:TEMP\prepo-zap"; New-Item -ItemType Directory -Force $zap | Out-Null
docker run --rm -v "${zap}:/zap/wrk/:rw" ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py -t $base -m 2 -r zap-report.html -J zap-report.json
```

`db:verify` seeds and truncates, so point it at a scratch database or accept that
it resets the demo. On a deployment with real data, run the isolation checks
against a restored copy instead; the suite's own restore drill shows the shape.

### Evidence from 21 October 2026

- `/api/health` returned `200 {"ok":true}`; `/`, `/demo`, `/sign-in`, `/security`,
  `/manifest.webmanifest` and `/.well-known/security.txt` returned 200.
- `pwa:check` passed every installable-app assertion against the live origin,
  including the new same-origin sitemap/robots assertions. The same assertions
  failed against the first deploy, which served `http://localhost:3000`, before
  the `force-dynamic` fix.
- `db:verify` passed **12/12** against Neon (not PGlite) from the checkout.
- `securityheaders.com` graded the origin **A** at 06:26 UTC: HSTS, CSP,
  `X-Frame-Options`, `nosniff`, referrer policy, Permissions-Policy, COOP, CORP
  and COEP were all present, and `X-Powered-By` was absent. It is **not A+**
  because `script-src` still allows `'unsafe-inline'`; a nonce/`strict-dynamic`
  policy needs every page to render for a request, which this app's static
  marketing/legal pages do not.
- OWASP ZAP baseline: **0 failures, 9 warnings, 58 passes**. The warnings are
  reviewed in `SECURITY.md` (CSP inline allowance, a Server Actions CSRF false
  positive, Next's `$ACTION_*`/`next` fields, `/api` and `/r` normalization
  redirects, and cache/framework informationals). A zero-warning scan was not
  achieved and is not claimed.
- The local image was also smoke-tested against `postgres:17-alpine`:
  `/api/health` returned 200, the same routes returned 200, and `db:verify`
  passed 12/12. That is evidence for the image, separate from the hosted origin.

## What this deployment still does not do

- **No durable host.** The Railway trial expires around 20 November 2026 and the
  service stops without a paid plan. The code and runbook are not tied to
  Railway; the same image runs on Fly with a card.
- **No custom domain.** The origin is `prepo-web-production.up.railway.app`.
  Passkeys and an installed PWA are bound to it, so a later move is a
  re-registration, not a DNS-only change.
- **No AI or email keys on the public demo.** Extraction, transcription and
  Resend report themselves unconfigured there. The seeded workspace, auth,
  board, tickets, search, PWA and security pages work without them.
- **No object storage.** Recordings live on the 500 MB volume. There is no
  R2/S3 driver, no CDN and no cross-region durability. A volume snapshot is the
  backup.
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
