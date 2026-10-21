# ADR 0010: CI is the enforcement point, not the demo

- Status: Accepted. Recorded 21 October 2026.
- Supersedes: none.

## Context

The claims this repository makes (tenant isolation, upload caps, webhook
signature checks, ticket/Linear consistency, a restorable backup) are only worth
what runs on every push. A suite that an operator remembers to run is a suite
that is green until it is not, and a demo that works on the author's machine
proves very little.

## Decision

GitHub Actions runs the invariants on every push and pull request, in three
jobs on a pinned runner.

- **`web`**: typecheck, the ten fresh-database suites (verify, smoke, auth,
  audio, follow-ups, extraction, Ask, injection, Linear, meeting delete), the
  production build, `db:idor-smoke` over the built server, `pwa:check` against a
  server it starts, and the desktop config verify. The audio and restore-drill
  steps build their own dataset: `db:migrate`, `db:seed`, `db:audio-fixture`,
  then `db:restore-drill` (12 checks, recording bytes included). No suite reads
  an operator's `.pglite`.
- **`desktop shell`**: `cargo test` with the webkit system libraries a Linux
  link needs, `--locked`, so the committed `rust-ini` pin cannot drift.
- **`scans`**: `pnpm audit --prod` against the lockfile and a gitleaks scan of
  full history.

CodeQL (security-extended, JavaScript/TypeScript) runs in its own workflow on
push, pull request and a weekly schedule. Every job pins `ubuntu-24.04`; the
`ubuntu-latest` label began moving to Ubuntu 26 on 19 October 2026, which would
change the desktop job's prerequisites without a commit to blame. Moving to 26
is a deliberate change with its own run.

The suites are `fresh` or `live` by construction: a fresh suite creates its own
database directory, a live one is the operator's. There is no suite that
silently points at the working database.

## Consequences

- A red check blocks the merge; the first push of the whole battery found a
  Linux-only compile break on the desktop job that a Windows machine cannot see,
  which is the job doing its work.
- CI is not a security proof. It runs no browser, so axe and Lighthouse are not
  measured; it has no hosted origin, so ZAP and securityheaders are absent; it
  runs no evals, so extraction quality is not scored; it publishes no coverage
  number.
- The fresh-database design makes suites slower than a shared fixture would be,
  and it is why the battery is credible.
- A hosted deployment would still need the same suites pointed at it plus the
  scans that only a real origin can run. This ADR is not a claim that production
  is tested.

## Alternatives considered

- **Run the suites manually before a release.** Rejected: the failures this
  catches (a Linux-only dependency, a policy regression) are exactly the ones a
  local run on one OS misses.
- **A single job.** Rejected: the desktop job needs system libraries the web job
  does not, and a scan failure should not require re-running the suites.
- **`ubuntu-latest`.** Rejected: the label is moving under the repository; a
  pinned image makes an OS upgrade a reviewed change.

## Evidence

`.github/workflows/ci.yml`, `.github/workflows/codeql.yml`,
`.github/dependabot.yml`, `apps/web/src/server/db/restore-drill.ts`,
`apps/desktop/src-tauri/Cargo.toml` (the `rust-ini` pin),
`README.md`'s CI paragraph, `SECURITY.md`'s CI/scan paragraphs.
