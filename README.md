# Prepo

> **The meeting ends. The work starts.**

Prepo is an AI agent that acts as a proxy project manager. It turns meetings (recordings,
transcripts, or raw minutes) into assigned tickets and keeps following up until the work
is done.

This repository is being built against the specification in [`PREPO.md`](./PREPO.md).

## Status

**Milestone 1 — Foundation, design system, and the marketing site.** Complete and building
clean.

| Area | State |
|---|---|
| pnpm monorepo (`apps/web`, `packages/shared`, `packages/config`) | Done |
| Design tokens (coral + near-black, light/dark) | Done |
| Landing page, all 11 sections | Done |
| Interactive hero preview (approve → ticket) | Done |
| Sample-data layer shared with the app | Done |
| SEO (`robots.txt`, `sitemap.xml`, metadata) | Done |
| Authenticated app, database, auth, AI, integrations | Not started |
| Desktop (Tauri) shell | Not started — requires Rust, absent on the build machine |

## Requirements

- Node.js ≥ 22 (developed on 24)
- pnpm 10+ (`npm i -g pnpm`)

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

## Repository layout

```
prepo/
├─ apps/
│  └─ web/                     # Next.js 16 (App Router) — landing page + future app
│     ├─ src/app/              # routes, layout, globals.css (design tokens)
│     ├─ src/components/ui/    # primitives (Button, Section, Container)
│     ├─ src/components/marketing/  # landing sections
│     └─ src/lib/              # utilities (cn)
├─ packages/
│  ├─ shared/                  # Zod schemas, constants, sample meeting data
│  └─ config/                  # shared tsconfig bases
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
flagged for a missing owner or deadline), existing tickets, and a small roster. The hero
preview and several landing sections render straight from this data, so the marketing page
and the future app share one source of truth.

## Roadmap

Milestones follow section 12 of `PREPO.md`:

1. ✅ Foundation, design system, landing page
2. App shell + data model (Drizzle, Postgres, RLS)
3. Core loop: ingest → extraction → review → tickets → board
4. Audio and transcription
5. Follow-up engine
6. Linear two-way sync
7. Ask Prepo, scores, insights, evals
8. Desktop app (Tauri)
9. Polish and security checklist
