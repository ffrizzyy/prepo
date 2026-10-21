# ADR 0001: Tenant isolation lives in PostgreSQL, not in query filters

- Status: Accepted. In force since the first migration; recorded 21 October 2026.
- Supersedes: none.

## Context

Prepo is multi-tenant: workspaces own meetings, transcripts, tickets, follow-ups,
integrations and audit rows, and every one of those tables carries a
`workspace_id`. The obvious implementation is to add `where workspace_id = ?` to
every query. That works until one query forgets it, and the failure is silent:
the page simply renders another tenant's rows. A security review of the
application layer cannot prove that no query was missed.

## Decision

The database enforces the tenant boundary.

- Migration `apps/web/drizzle/policies/001_rls.sql` enables **and forces**
  row-level security on the eighteen workspace-scoped tables plus `workspaces`
  itself. `FORCE` matters because both PGlite's default role and a hosted
  Postgres owner bypass ordinary RLS; forcing makes the owner subject to the
  policy too, and the application avoids relying on that by also switching role.
- Every policy is the same predicate: the row's `workspace_id` equals
  `nullif(current_setting('app.workspace_id', true), '')::uuid`. Unset reads as
  NULL, the comparison is false, and the default is deny. The `nullif` folds the
  GUC's post-reset empty string into NULL as well.
- A dedicated `prepo_app` role (NOLOGIN, granted to the migration's current
  user) owns no tables. Application reads and writes run as that role, inside a
  transaction, with `set local role prepo_app` and
  `set_config('app.workspace_id', ..., true)`. `set local` is what keeps scope
  from leaking through a pooled connection into the next request.
- Two `SECURITY DEFINER` helpers cross the bootstrap gap: a session knows a slug
  before it knows the workspace id, and the `workspaces` row is itself protected.
  `resolve_workspace_id(text)` returns one id; `list_workspaces_for_user(uuid)`
  returns the caller's memberships. Neither returns tenant content.
- Callers use `withWorkspace(workspaceId, fn)` for tenant work and `asApp(fn)`
  for a query that is legitimately workspace-independent. There is no
  "workspace-scoped drizzle instance" to forget to build.

## Consequences

- Forgetting a filter returns zero rows, not another tenant's rows. The bug
  class becomes a blank page, which the check suites and the IDOR matrix can
  catch, rather than a silent leak.
- Scope is transaction-shaped. Code that opens a new transaction drops the
  setting, which is correct but means helpers must accept the caller's `tx`
  rather than calling `withWorkspace` themselves mid-flight.
- RLS does not cover the tables that are not workspace-scoped: `users`,
  `sessions`, `accounts`, `auth_events`, `login_challenges` and
  `push_subscriptions`. Those are read by the owner connection on purpose
  (sign-in has to find a user before a tenant exists). They are guarded by
  session lookups and by returning nothing but the caller's own rows.
- Migrations, seeds and the operator's check suites connect as the owner to set
  data up, so they bypass the policy by design. The suites that prove isolation
  (rather than merely use it) re-enter through `withWorkspace`.
- The policy list is explicit. A new tenant table that is not added to
  `001_rls.sql` is unprotected, and the restore drill's table count is the
  tripwire that makes someone look.

## Alternatives considered

- **Application-level filters only.** Rejected: one missed predicate is a
  breach, and nothing in CI can prove the set is complete.
- **Schema or database per tenant.** Rejected for this size: migration fan-out
  and connection management for a boundary that one policy already enforces.
- **A view per table plus a restricted role.** Rejected: views have to be
  maintained per table and hide the policy from the schema reader; RLS states
  the rule once.

## Evidence

`apps/web/drizzle/policies/001_rls.sql`,
`apps/web/src/server/db/client.ts` (`withWorkspace`, `asApp`),
`apps/web/src/server/context.ts` (slug to membership, 404 for non-members),
`db:auth`, `db:smoke`, `db:idor-smoke`, `db:restore-drill`'s cross-tenant check.
