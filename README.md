# Prepo

> **The meeting ends. The work starts.**

Prepo is an AI agent that acts as a proxy project manager. It turns meetings (recordings,
transcripts, or raw minutes) into assigned tickets and keeps following up until the work
is done.

This repository is being built against the specification in [`PREPO.md`](./PREPO.md).

## Status

**Milestone 3 — durable data layer, wired UI, and sign-in.** The schema, migrations, tenant
isolation and seed are complete and verified against two engines; the app reads and writes
Postgres; and authentication is real — password sign-in, per-device sessions with revoke,
throttling, and TOTP two-factor with single-use recovery codes. Passkeys, OAuth, magic
links, a breached-password check and Turnstile are the parts of the spec's auth line still
outstanding.

| Area | State |
|---|---|
| pnpm monorepo (`apps/web`, `packages/shared`, `packages/config`) | Done |
| Design tokens (coral + near-black, light/dark) | Done |
| Landing page, all 11 sections | Done |
| Interactive hero preview (approve → ticket) | Done |
| Sample-data layer shared with the app | Done |
| SEO (`robots.txt`, `sitemap.xml`, metadata) | Done |
| App shell: sidebar, mobile bottom nav, command palette | Done |
| Dashboard, Meetings (+detail, transcript), Board, Tickets (+detail) | Done |
| Follow-ups, Insights, Settings, New meeting | Done |
| Postgres schema — 24 tables, Drizzle migrations | Done |
| Row-Level Security, cross-tenant isolation verified | Done |
| Seed (two workspaces) and the repository read layer | Done |
| UI wired to Postgres — server-component reads, server-action writes | Done |
| Sign-in / sign-up / create workspace, argon2id passwords | Done |
| Per-device sessions, revoke one / revoke the others, idle + absolute expiry | Done |
| Sign-in throttling and the identity-plane audit log | Done |
| TOTP 2FA with single-use recovery codes | Done |
| Passkeys, magic link, OAuth, breach check, Turnstile | Not started |
| Real AI + integrations | Not started |
| Desktop (Tauri) shell | Not started — requires Rust, absent on the build machine |

The app runs at **`/northwind`** on the seeded "Northwind Studio" workspace. Sign in
(see below) and everything you see is read from Postgres. Approving an action item writes a
real ticket, schedules its first reminder, and moves the item to `ticketed`; moving a ticket
on the board records an audit event. Mutations are server actions, so the UI updates
optimistically and the fresh row arrives on the revalidated render. Writes run as the
non-owner `prepo_app` role inside a workspace-scoped transaction, so the tenant boundary is
enforced by the database rather than by application code.

## Signing in

`db:seed` gives every seeded person an account on the demo password:

| | |
|---|---|
| Email | `lena@northwind.dev` (owner of Northwind Studio) |
| Password | `prepo-demo-2026` |

`/demo` fills those in for you and posts the ordinary sign-in form. The other seeded people
work too — `nadia@globex.dev` is the owner of the *other* workspace and is the quickest way to
watch the tenant boundary hold: signing in as her and opening `/northwind` returns **404**,
not somebody else's data.

**`/new` creates a workspace.** After signing up you name one, and you become its owner.
It starts empty — the sample meeting belongs to Northwind Studio — so you get the empty
states rather than fabricated data.

A note on scope: this is password auth, built on the `users` / `accounts` / `sessions` tables
`PREPO.md` §4.5 already describes, rather than on Better Auth (see the note in the spec's
stack table). Sessions are database-backed and verified per request, never decoded from the
cookie alone; the cookie holds an opaque 256-bit token whose SHA-256 is what the database
stores. Rate limiting, the timing-equalised failure path, session rotation on login and the
append-only `auth_events` log are all in place. Two-factor (TOTP) is also live — see below.
What is **not** here: passkeys, magic links, OAuth, a breached-password check, and Turnstile.

## Requirements

- Node.js ≥ 22 (developed on 24)
- pnpm 10+ (`npm i -g pnpm`)
- Docker *(optional)* — only for a real Postgres; the default embedded database needs nothing

## Getting started

```bash
pnpm install
pnpm --filter @prepo/web db:verify   # migrate, seed, check isolation (also creates the accounts)
pnpm dev                             # http://localhost:3000 → sign in, or open /demo
```

Other scripts:

```bash
pnpm build        # production build
pnpm start        # serve the production build
pnpm typecheck    # typecheck every workspace package
```

## Database

Postgres is the source of truth (`PREPO.md` §4.5). The schema, policies and queries are
driver-agnostic, so the app runs on either engine with no code change:

| Mode | How to enable | Use |
|---|---|---|
| **PGlite** (default) | nothing to configure | local dev, tests, CI |
| **Postgres** | set `DATABASE_URL` | docker-compose below, or Neon in production |

```bash
docker compose up -d postgres                    # optional real Postgres on :5432
export DATABASE_URL=postgres://prepo:prepo@localhost:5432/prepo

pnpm --filter @prepo/web db:generate   # emit SQL from the Drizzle schema
pnpm --filter @prepo/web db:migrate    # apply migrations, then RLS policies and grants
pnpm --filter @prepo/web db:seed       # load two seeded workspaces
pnpm --filter @prepo/web db:verify     # prove tenant isolation
pnpm --filter @prepo/web db:smoke      # exercise the write path end to end
pnpm --filter @prepo/web db:auth       # exercise the authentication core
pnpm --filter @prepo/web db:totp-fixture  # add a test account with 2FA on (see Authentication)
pnpm --filter @prepo/web db:studio     # browse the data
```

`db:verify` migrates, seeds, then asserts the tenant boundary at the database level: each
workspace sees only its own rows, an unscoped session sees nothing, a cross-tenant read by
explicit id returns nothing, and a cross-tenant **write** is rejected by RLS. All ten checks
pass on both PGlite and Postgres.

`db:smoke` reseeds, then drives the same write functions the server actions call — approving
action items, moving a ticket, rejecting one, commenting, changing a setting — and reads the
results back through the tenant-scoped queries. It covers key sequencing, idempotent
approval, reminder scheduling, audit events, and a northwind session failing to move a
globex ticket. (The mutations live in `src/server/writes.ts` rather than inside the actions,
precisely so this stays runnable: an action needs a request scope for `cookies()` and
`revalidatePath()`, a script does not have one.)

`db:auth` reseeds, then exercises the authentication core the way the sign-in action does:
argon2id hashing and verification, the timing decoy for unknown addresses, per-email and
per-network throttling windows, session creation and lookup by hash (never by token),
revocation scoped to the owning user, revoke-others, absolute and idle expiry, account
creation with a duplicate-email rejection, and creating a workspace whose owner is its only
member. The TOTP section pins the algorithm against all six RFC 6238 test vectors and drives
the enrolment round-trip: pending secret → confirm → recovery codes hashed and single-use →
challenge lookup, expiry and cleanup → per-user throttle of second-factor failures.
Fifty-five checks, all passing.

Search is Postgres-native rather than embedding-based (`PREPO.md` §1.3): a trigger maintains
a `tsvector` on every transcript segment, with a GIN index for ranking and a `pg_trgm` index
for typos.

In the app, PGlite is loaded at runtime rather than bundled (`serverExternalPackages` in
`next.config.ts`, since it ships WASM and worker assets) and cached on `globalThis`, so a hot
reload cannot open a second instance against the same data directory.

### Tenant isolation

Every tenant table carries `workspace_id` with RLS enabled **and forced**. Policies compare
against `nullif(current_setting('app.workspace_id', true), '')::uuid`, so an unset scope
denies by default. RLS never applies to a superuser and does not apply to a table's owner
unless forced, so the application never queries as the owner: `withWorkspace()` opens a
transaction, switches to the dedicated non-owner `prepo_app` role, and sets the scope with
`set local` — a pooled connection therefore cannot leak tenancy into the next request. Two
`SECURITY DEFINER` helpers bridge the single bootstrap gap: resolving a slug to a workspace
id before a workspace is known.

On top of that, `requireWorkspace()` loads the workspace's members and looks for the
signed-in user among them. A non-member gets a **404**, not a 403, so the app never confirms
that somebody else's workspace exists.

## Authentication

Sessions are rows, not tokens in the browser. Sign-in mints 256 bits of randomness, sends it
in the cookie, and stores only its SHA-256 — a database dump therefore does not hand over
live sessions. Every request re-reads the session from Postgres and checks that it is
unrevoked, inside its 30-day absolute lifetime and inside a 7-day idle window, so revoking a
device takes effect on its very next request. `last_seen_at` slides the idle window, written
at most once every five minutes rather than on every request.

Passwords are argon2id at OWASP's parameters (19 MiB, t=2, p=1). Signing in with an address
that has no account still performs a full verification against a decoy hash, and returns the
same message as a wrong password, so neither the response time nor the wording reveals
whether an account exists. Failed attempts are counted from the append-only `auth_events`
log — five per minute for an address, twenty for a network — and throttling needs no
separate state to keep in sync. Every sign-in rotates the session, and sign-out, revoke-one
and revoke-the-others all write an audit event.

The cookie is `HttpOnly; SameSite=Lax; Path=/`, and in production it is `__Host-` prefixed and
`Secure`. Development keeps the plain name and drops `Secure`, because the dev server is
reachable over plain http on the LAN and browsers refuse to send a `Secure` cookie there.

### Two-factor sign-in

Accounts can switch on **TOTP** from the settings page ("Two-factor sign-in"): the app issues
a 160-bit secret, shows it and an `otpauth://` URI for the authenticator of your choice, and
the factor switches on only once a code from that app has been verified. The confirmation
also issues eight single-use recovery codes — shown once, stored as SHA-256 hashes, consumed
by being used.

After that, sign-in has two steps. A correct password against a factor-protected account
mints no session; it stores a short-lived **login challenge** (a hashed 256-bit token behind
its own `__Host-`-prefixed cookie, expiring in five minutes) and the second step asks for the
authenticator's six-digit code or a recovery code. The challenge is deliberately not a
session: stolen or leaked, it is worthless without the authenticator. Codes are verified
with a ±30-second window and per-user throttling; recovery codes work exactly once and are
then removed from the account. Disabling the factor or regenerating the codes both require a
fresh valid code, and every one of these steps writes to `auth_events`.

The TOTP implementation is hand-rolled on `node:crypto` and pinned against the RFC 6238 test
vectors in `db:auth`. Not implemented (matching the spec's remaining auth line): hardware
passkeys as a second factor, replay protection within a time step, and rate limiting keyed
to the challenge token itself.

> `db:totp-fixture` is a **test fixture, not part of the demo flow**: it adds one extra
> account with the factor already on, so end-to-end tests can exercise the second step of
> sign-in. The demo accounts (`lena`, `nadia`, …) stay factors-free.

## Repository layout

```
prepo/
├─ apps/
│  └─ web/                     # Next.js 16 (App Router) — landing page + app
│     ├─ src/app/              # marketing page, globals.css (design tokens)
│     ├─ src/app/[workspace]/  # app shell: dashboard, meetings, board, tickets…
│     ├─ src/app/sign-in/      # sign-in, sign-up, /demo and /new (create workspace)
│     ├─ src/components/ui/    # primitives (Button, Section, Container)
│     ├─ src/components/marketing/  # landing sections
│     ├─ src/components/app/   # shell, badges, tables, board, detail views
│     ├─ src/components/auth/  # auth layout, forms, sessions panel
│     ├─ src/lib/              # cn() and the shared date/initial formatters
│     ├─ src/server/           # context (workspace + viewer), queries, actions, writes
│     ├─ src/server/auth/      # passwords, TOTP, challenges, sessions, throttle, identity audit, DAL
│     ├─ src/server/db/        # Drizzle schema, client, migrations, seed, verify, repo
│     └─ drizzle/              # generated migrations + hand-written RLS/policy SQL
├─ packages/
│  ├─ shared/                  # Zod schemas, constants, sample meeting data
│  └─ config/                  # shared tsconfig bases
├─ docker-compose.yml          # optional Postgres 17 for the DATABASE_URL path
└─ PREPO.md                    # the specification
```

## Design system

Tokens live in `apps/web/src/app/globals.css` as CSS variables, exposed to Tailwind v4
through `@theme inline`. Light is the default; `.dark` overrides, set by an inline script
that reads `prefers-color-scheme` and a stored preference (no flash).

- **Accent:** Prepo Coral `#FF6B6B` (dark `#FF7A7A`), with `--accent-fg` near-black text.
- **Neutrals:** one Zinc family, driven by `--bg`, `--surface`, `--border`, `--text`.
- **Ink:** `#0B0B0C` for the wordmark bar and footer lockup.
- **Type:** Geist Sans / Geist Mono via `next/font`, self-hosted through the `geist` package.
- **Icons:** Phosphor only (SSR entry in server components, main entry in client components).

## Sample data

`packages/shared/src/sample.ts` holds a realistic seeded meeting ("Q4 Launch — Weekly
Sync") with a speaker-labelled transcript, seven extracted action items (including ones
flagged for a missing owner or deadline), existing tickets, and a small roster. `db:seed`
loads this into Postgres — the app reads the database, not the file — while the hero preview
and several landing sections render straight from it, so the marketing page and the seeded
workspace stay in step.

## Roadmap

Milestones follow section 12 of `PREPO.md`:

1. ✅ Foundation, design system, landing page
2. ✅ App shell on seeded data (sidebar, dashboard, meetings, board, tickets)
3. ✅ Database, tenant isolation and the durable core loop — schema, RLS, seed, the wired UI,
   and sign-in with per-device sessions, revocation, TOTP 2FA and recovery codes
4. Audio and transcription
5. Follow-up engine
6. Linear two-way sync
7. Ask Prepo, scores, insights, evals
8. Desktop app (Tauri)
9. Polish and security checklist
