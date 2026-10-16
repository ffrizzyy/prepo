# Prepo

> **The meeting ends. The work starts.**

Prepo is an AI agent that acts as a proxy project manager. It turns meetings (recordings,
transcripts, or raw minutes) into assigned tickets and keeps following up until the work
is done.

This repository is being built against the specification in [`PREPO.md`](./PREPO.md).

## Status

**Milestone 3 — durable data layer and a wired UI.** The schema, migrations, tenant
isolation and seed are complete and verified against two engines, and the app now reads and
writes Postgres: server components load the workspace, server actions mutate it, and the UI
updates optimistically. Auth is the remaining part of this milestone.

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
| Postgres schema — 23 tables, Drizzle migrations | Done |
| Row-Level Security, cross-tenant isolation verified | Done |
| Seed (two workspaces) and the repository read layer | Done |
| UI wired to Postgres — server-component reads, server-action writes | Done |
| Auth (sessions, passkeys, TOTP) | Next |
| Real AI + integrations | Not started |
| Desktop (Tauri) shell | Not started — requires Rust, absent on the build machine |

The app runs at **`/northwind`** on the seeded "Northwind Studio" workspace; any other slug
404s. Everything you see is read from Postgres. Approving an action item writes a real
ticket, schedules its first reminder, and moves the item to `ticketed`; moving a ticket on
the board records an audit event. Mutations are server actions, so the UI updates
optimistically and the fresh row arrives on the revalidated render. Writes run as the
non-owner `prepo_app` role inside a workspace-scoped transaction, so the tenant boundary is
enforced by the database rather than by application code.

## Requirements

- Node.js ≥ 22 (developed on 24)
- pnpm 10+ (`npm i -g pnpm`)
- Docker *(optional)* — only for a real Postgres; the default embedded database needs nothing

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:3000
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
pnpm --filter @prepo/web db:studio     # browse the data
```

`db:verify` migrates, seeds, then asserts the tenant boundary at the database level: each
workspace sees only its own rows, an unscoped session sees nothing, a cross-tenant read by
explicit id returns nothing, and a cross-tenant **write** is rejected by RLS. All ten checks
pass on both PGlite and Postgres.

`db:smoke` reseeds, then drives the same server actions the UI calls — approving action
items, moving a ticket, rejecting one, commenting, changing a setting — and reads the
results back through the tenant-scoped queries. It covers key sequencing, idempotent
approval, reminder scheduling, audit events, and a northwind session failing to move a
globex ticket.

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

## Repository layout

```
prepo/
├─ apps/
│  └─ web/                     # Next.js 16 (App Router) — landing page + app
│     ├─ src/app/              # marketing page, globals.css (design tokens)
│     ├─ src/app/[workspace]/  # app shell: dashboard, meetings, board, tickets…
│     ├─ src/components/ui/    # primitives (Button, Section, Container)
│     ├─ src/components/marketing/  # landing sections
│     ├─ src/components/app/   # shell, badges, tables, board, detail views
│     ├─ src/lib/              # cn() and the shared date/initial formatters
│     ├─ src/server/           # context (workspace + viewer), queries, server actions
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
3. 🟡 Database, tenant isolation and the durable core loop — schema, RLS, seed and the
   wired UI done; auth (sessions, passkeys, TOTP) next
4. Audio and transcription
5. Follow-up engine
6. Linear two-way sync
7. Ask Prepo, scores, insights, evals
8. Desktop app (Tauri)
9. Polish and security checklist
