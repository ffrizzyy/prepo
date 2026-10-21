# ADR 0003: Durable work is a row plus a scheduler-invoked pass, not Inngest

- Status: Accepted. Recorded 21 October 2026.
- Supersedes: none.

## Context

The specification names Inngest for the audio to transcription to extraction to
ticket pipeline, the follow-up ladder, and retries. Inngest is another hosted
service with its own signing keys, event schema and local dev server. This
repository has none of that, and the work it would schedule is small: a
follow-up queue, a Linear pull/push pass, an extraction run, and an audio
retention sweep.

## Decision

Each unit of deferred work is a row (or a ticket field) with a due time, and a
CLI entry point works the rows. The web request only writes state and returns;
no request waits for Linear or a model.

- `db:followups` (`runFollowups`) selects `followups` rows whose
  `scheduled_for` has passed and decides one of four things per row: deliver,
  fail with a reason, defer for quiet hours, or cancel because the ticket is
  done, deleted or the ladder moved. The outcome is written to
  `status`/`detail`.
- `db:linear` (`runLinearSync`) does one pass per connected workspace: pull what
  changed since `integrations.last_synced_at`, then push tickets whose
  `linear_sync_state` is `pending`. A failed push records the reason, increments
  `linear_sync_attempts`, and sets `linear_retry_after` from the backoff ladder
  (1m, 5m, 15m, 60m, then every 6h).
- `db:extract` and the meeting page's button call the same extraction function.
  `db:retention` deletes audio past the workspace's retention choice and
  reclaims abandoned uploads and recordings never transcribed after 90 days.
- The pull cursor advances even when an individual change could not be applied,
  so one unmirrored issue cannot wedge every later pull. The issue is counted
  (`unmapped`, `kept`, `unlinked`) instead.
- Every pass prints a per-row decision line, so a scheduler log says what
  happened rather than only that the process exited zero.

## Consequences

- There is no durable step runtime. If the process dies mid-pass, rows stay in
  their current state and the next pass retries them. Delivery is therefore
  **at-least-once**, not exactly-once: a crash after an email is accepted but
  before the row is settled will resend it, and a crash between creating a
  Linear issue and storing its id can create a duplicate issue.
- **Overlapping runs are not prevented by the database.** The passes select due
  rows without `for update skip locked` and hold no advisory lock, so two
  concurrent `db:followups` (or `db:linear`) processes can both pick the same
  row. The scheduler must run one pass at a time; the entry points are not
  safe to overlap. This is a deliberate trade in exchange for having no queue
  service, not an oversight, and it is the first thing a hosted deployment
  should fix (a row lock or an advisory lock, not a new service).
- Scheduling is the operator's job. Nothing in the app starts these passes, and
  no cron definition is committed; `README.md` lists the commands and their
  flags.
- Each pass is directly runnable in CI and in the smoke suites, which is how the
  retry, backoff and quiet-hour behaviour is tested without a workflow engine.

## Alternatives considered

- **Inngest Cloud.** Rejected for now: a hosted dependency with keys and a
  separate local runtime, for four small passes.
- **A `pg-boss`-style table with workers started by the web process.** Rejected:
  a Next.js server is not a reliable long-lived worker host, and it would hide
  the scheduler from the operator instead of naming it.
- **Fire-and-forget promises from the request.** Rejected: the request would
  report success before the work happened, and a deploy would drop it.

## Evidence

`apps/web/src/server/db/followups.ts`, `apps/web/src/server/followups/engine.ts`,
`apps/web/src/server/db/linear.ts`, `apps/web/src/server/linear/sync.ts`
(`BACKOFF_MS`, `pullWorkspace`), `apps/web/src/server/ai/extract.ts`,
`apps/web/src/server/audio/retention.ts`, `README.md`'s scheduler entry points.
