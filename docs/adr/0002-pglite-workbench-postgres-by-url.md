# ADR 0002: PGlite for the workbench, Postgres when `DATABASE_URL` is set

- Status: Accepted. Recorded 21 October 2026.
- Supersedes: none.

## Context

The specification deploys the app on Vercel with a hosted Postgres (Neon). This
repository has no hosted database, and requiring Docker or a Postgres service
just to run the checks would make the suites harder to run than the features
they check. The danger in a local shortcut is dialect drift: the thing that
passes locally is not the thing that ships.

## Decision

One schema and one set of migrations, two drivers behind one interface.

- With no `DATABASE_URL`, `getDb()` opens `@electric-sql/pglite` at
  `PGLITE_DIR` (default `.pglite`), which is Postgres compiled to WASM. With a
  URL, it opens a `pg` pool through `drizzle-orm/node-postgres`. Both are
  wrapped in the same `Db` type and the same schema object.
- Migrations and the RLS/search policy SQL are applied by `db:migrate` in both
  modes. There is no Prisma-style schema push: the committed SQL is the source
  of truth, and `db:generate` is only how new SQL is produced.
- The whole check battery runs against a throwaway PGlite directory per suite.
  CI does the same, so a suite cannot pass by reading an operator's data.
- `pg_trgm` is created best-effort in `002_search.sql`; PGlite may not ship the
  extension, and the trigger and GIN index on `tsv` do not depend on it.

## Consequences

- A fresh clone runs the app and every suite with no services. That is why the
  eleven fresh-database suites can be a pre-commit-scale gate.
- PGlite is a single process over a directory. Two app instances cannot share
  one, and the dev server caches its instance on `globalThis` so hot reload does
  not open a second. This is a workbench property, not a production one.
- The production path (`DATABASE_URL`) is implemented and exercised by the same
  SQL, but this repository never runs it in CI: every CI suite is PGlite. The
  claim "runs on Postgres" rests on the driver and the dialect, not on a hosted
  run in this repository.
- Backups differ by mode: a PGlite deployment is a directory copy (`db:restore-drill`
  checks that copy), while a real Postgres deployment would need `pg_dump` or
  WAL archiving. The drill does not pretend to cover the latter.
- Local features that depend on extensions can silently degrade. The trigram
  index is the one case; the search query does not require it (see ADR 0004).

## Alternatives considered

- **Docker Compose with Postgres.** The specification lists it; it makes every
  check depend on Docker being installed and running.
- **SQLite or an in-memory fake.** Rejected: the policies, `tsvector`,
  `security definer` and `set local role` are the architecture, and none of them
  exist in SQLite.
- **PGlite only, no Postgres path.** Rejected: the deployment target in the
  specification is a hosted Postgres, and a single-process WASM database is not
  a production service.

## Evidence

`apps/web/src/server/db/client.ts`, `apps/web/src/server/db/migrate.ts`,
`apps/web/drizzle/` (migrations and `policies/`), `.github/workflows/ci.yml`.
