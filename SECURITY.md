# Security policy

Prepo is a portfolio project, not a product with a support contract. It holds meeting recordings
by design, so it is built as though it holds yours — and this file records what is actually in
place, what is not, and how to report a problem.

**Status: milestone 5.** Authentication (password + TOTP two-factor), tenant isolation, the
writable core loop, the audio path (recording, upload, transcript import, speaker mapping,
retention) and the follow-up engine (escalation ladder, job, quiet hours, digest, notification
centre) are implemented and tested. Two providers are wired but **unconfigured on this
deployment** — speech-to-text (no `DEEPGRAM_API_KEY`) and email (no `RESEND_API_KEY`) — so
recordings are stored and never sent anywhere, and an email is attempted, then recorded as
**failed with the reason** rather than quietly marked sent. Push is never queued, because there is
no service worker. Extraction, integrations and the desktop shell are not built yet; where the
table below mentions them, it says so.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on
[ffrizzyy/prepo](https://github.com/ffrizzyy/prepo/security/advisories/new) if the report should
not be public, or open a normal issue if it can be. Please include the request or the exact
sequence of steps, what you expected, and what happened. There is no bug-bounty programme, so
there is no payment to offer — only a fix and credit in the commit if you want it.

## What is implemented

| Control | How |
|---|---|
| Password storage | argon2id via `hash-wasm`, OWASP parameters (19 MiB, t=2, p=1), per-hash salt. PHC strings are never logged |
| Unknown accounts | A decoy hash is verified with the same cost when the address has no account, and the failure message is identical, so timing and wording do not enumerate users |
| Sessions | Opaque 256-bit token in an `HttpOnly` cookie; only its SHA-256 is stored. 30-day absolute and 7-day idle lifetimes, re-checked against the database on every request. Rotation on every sign-in |
| Session revocation | Per device, and "every other device". Revocation is scoped by user id, so a session id from another tenant revokes nothing |
| Second factor | TOTP (RFC 6238, SHA-1, six digits, 160-bit secret) verified against the RFC's published test vectors; ±1 step drift window. Eight single-use recovery codes, stored as SHA-256 |
| Half-finished sign-ins | A correct password against a factor-protected account issues no session — only a five-minute challenge row behind an `HttpOnly` cookie, hashed at rest and single-use |
| Throttling | Counted from the append-only `auth_events` log (5 failures/minute per address, 20 per network, 5 per account for second-factor attempts), so there is no separate counter store to reset |
| Tenant isolation | `workspace_id` on every tenant table with row-level security **enabled and forced**, querying as a dedicated non-owner role inside a transaction that sets the scope with `set local`. Verified against both PGlite and Postgres |
| Workspace membership | Checked server-side before rendering; a non-member receives **404**, not 403, so the app does not confirm that another workspace exists |
| CSRF | `SameSite=Lax` cookies plus the origin checks Server Actions already perform. There are no tokens in `localStorage` |
| Injection | Drizzle parameterised queries throughout; Zod validates every action input; full-text search is built with `websearch_to_tsquery`, never string concatenation |
| Secrets at rest | Session tokens, recovery codes, login challenges and invitation/share tokens are stored hashed |
| Data minimisation | IP addresses are truncated to a /24 prefix, user agents stored as a hash plus a device label, identity events kept in a separate append-only log from workspace-scoped audit events |
| Agent output | Nothing becomes a ticket without passing the workspace autonomy setting (default: human approval). Agent writes are attributed to `prepo-agent` in the audit log, and model output is treated as untrusted input |
| Uploads | Audio is accepted only if its own bytes look like audio — the container is sniffed (RIFF/WAVE, MPEG frame sync, Matroska, ISO-BMFF brands) and the extension the client claimed is ignored. Caps: 25 MB per file, 4 MB per chunked piece, 4 hours per recording, 300 transcription minutes per workspace per month. A file that fails is rejected with the reason, before anything is written |
| Recorded audio at rest | Bytes live under `apps/web/.storage` (or `AUDIO_STORAGE_DIR`) and are **never publicly addressable**: no presigned URLs, no static path. Playback goes through `/api/audio/[assetId]`, which resolves the caller's workspaces and lets row-level security decide visibility, then streams with `private, no-store` and `206` byte ranges. A non-member gets **404**, an anonymous caller **401** |
| Recording consent | A recording cannot be stored without an explicit consent confirmation, which is recorded against the person who gave it. The API refuses the upload — rather than trusting the form — if the flag is absent |
| Chunked uploads | Pieces are staged on disk and assembled only on the final piece; the row is never written unless assembly succeeds. Staging older than an hour is reclaimed, and an unfinished upload with no retention date is reclaimed after 90 days |
| Retention | The delete date is set when the audio is stored and recomputed when it is transcribed, so "delete as soon as it is transcribed" means exactly that. The sweep deletes bytes and marks the row; the transcript and everything derived from it stay |
| Provider egress | The transcription provider is handed **bytes, not a URL**, so there is no user-controlled outbound request and no SSRF surface. The only host contacted is the provider's fixed endpoint, and only when a key is configured |
| Follow-up delivery | A message is only ever sent by the job, never inline in a request. Email goes to Resend's fixed endpoint from server-side code with a key read from the environment; only a 2xx marks a message `sent`, and anything else is stored as `failed` **with the reason**. With no key configured, every email rung fails loudly and the in-app half is still delivered — nothing is marked sent that was not. A person with a workspace read scope can cancel, move, snooze or stop any pending message in their own workspace, and each of those is an audit event |
| Follow-up content | The message is generated from the ticket row, so it carries the key, title, due date and lateness — the same facts for every tone. No user-supplied text is interpolated into a subject line, and the link is built from the workspace slug and ticket key rather than from stored input |
| Notification centre | Notifications are read per person (`user_id`), and marking one read or all read is scoped by the caller's own user id, so one member cannot read or clear another's inbox. The unread count is a `count` query, not a cached number |
| Quiet hours | The window is evaluated in the recipient's own IANA timezone via `Intl`; an unknown zone falls back to UTC instead of throwing. A held message is **deferred and kept**, never dropped, and the row records that it was held and why |

## What is **not** implemented

Grouped by the OWASP Top 10 (2021) entries the specification targets, these are the gaps that
remain. None of them are secret; the goal of this list is that nobody has to guess.

| Area | Gap |
|---|---|
| **A02** Cryptographic failures | No application-layer encryption at rest (integration tokens, when integrations land, are specified as AES-256-GCM with the key outside the database). No encrypted backups. TLS/HSTS are the host's responsibility |
| **A05** Security misconfiguration | The strict CSP with nonces from the specification is not configured; no environment schema validation; no `Permissions-Policy`, COOP or CORP. None of the security headers in the spec are set yet — they belong with the hosting setup |
| **A06** Vulnerable components | No Dependabot, CodeQL or SBOM job in CI yet; `pnpm audit` is not wired into the pipeline |
| **A07** Auth failures | No passkeys, OAuth or magic links; no email verification, password reset, or breached-password check (no mail provider); no CAPTCHA/bot challenge; no replay protection within a single TOTP step; no session invalidation on password change |
| **A08** Data integrity | No webhook signature verification (there are no webhooks yet) and no signed desktop updates (no desktop build) |
| **A09** Logging & monitoring | No Sentry or alerting; `auth_events` and `audit_logs` are append-only but there is no anomaly detection, no "impossible travel" alert, and logs are not shipped anywhere. The follow-up job prints a per-row decision line, but there is no metric or alert on a run that fails wholesale |
| **A10** SSRF | The transcription call is a fixed host with a body of bytes, and the email sender is a fixed host with a server-built body, so there is nothing to steer. When extraction (milestone 7) adds a second provider, the same rule applies: no user-supplied URLs, and no fetching a meeting's "source link" |
| Follow-up delivery | There is no email provider key on this machine, so **no email has ever actually been delivered** by this build — the failure path is what is tested. There is no bounce or complaint handling, no unsubscribe link, no per-recipient send rate limit beyond the ladder itself, and no retry with backoff: a failed message stays failed. The job is a script meant for a scheduler; there is no queue, no worker, no exactly-once guarantee and no scheduled-job auth, so whoever can run it can send |
| Push notifications | Not implemented at all: no service worker, no subscription table, no Web Push keys. The ladder lists push on the nudge rung, and the code refuses to write a push row while no device is subscribed, so nothing is pretended |
| Object storage | The R2 presigned-PUT flow in the spec is not implemented — there is no Cloudflare account on this machine, so audio uses a local filesystem driver behind the same `StorageDriver` interface. The interface has no presign method at all, which is why the "no publicly addressable URLs" claim holds here; moving to R2 would need the access route re-reviewed |
| Antivirus / content scanning | Uploaded audio is validated by format and size, not scanned. Transcripts are parsed as text only — `.docx` and `.pdf` are refused rather than parsed, so there is no document parser to attack |
| ASVS L2 | Not formally reviewed. The specification's checklist is tracked in `PREPO.md` §9.4 and is mostly unchecked, because most of it depends on features that do not exist yet |

## Verifying the claims

The mechanisms above are covered by the test suite rather than by assertion:

```bash
pnpm --filter @prepo/web db:verify   # RLS and cross-tenant isolation, on both engines
pnpm --filter @prepo/web db:smoke    # the write path, including a cross-tenant write failing
pnpm --filter @prepo/web db:auth     # hashing, throttling, sessions, TOTP against RFC vectors
pnpm --filter @prepo/web db:audio    # parsing, sniffing, chunk assembly, retention, tenant boundary
pnpm --filter @prepo/web db:retention  # the retention job, runnable from a scheduler
pnpm --filter @prepo/web db:followup-smoke  # the ladder, quiet hours, digest and the job
```

`db:verify` and `db:smoke` run against the embedded engine and a real Postgres (set
`DATABASE_URL`). `db:auth` pins the TOTP implementation against all six RFC 6238 test vectors.
`db:audio` is the audio equivalent for the part that does not need a provider: the VTT/SRT/plain
parsers, magic-byte sniffing and the size/duration caps, the Deepgram response mapping against a
recorded-shape payload, the storage driver (including a key trying to escape the storage root),
chunked assembly and its refusal of an out-of-order piece, the retention clock and the sweep, the
ingest writes, speaker mapping, and the cross-tenant attempts. Ninety checks pass.

`db:followup-smoke` covers the security-relevant half of the chaser directly: that an unconfigured
email is recorded `failed` **with the reason** and never as `sent`; that the in-app half of the
same rung is still delivered; that quiet hours defer rather than drop, in the recipient's own zone,
with an unknown zone falling back instead of throwing; that a message a person moved is not
re-cancelled by its own move, while a rung left behind by a due-date change is; that a finished
ticket cancels what was pending; that a digest is never placed twice; that marking an inbox read
touches only the caller's own rows; and that a cancellation in one tenant cannot reach another.
Ninety-two checks pass.

On top of the committed suites, the flows were exercised end-to-end over HTTP against the
production build: 46 sign-in checks and 23 two-factor checks while milestone 3 was built, 73
audio checks while milestone 4 was — including refusal of a renamed file and of an upload without
consent, the 25 MB cap, a three-piece chunked upload, `206`/`416` byte ranges, and another
tenant's owner getting `404` on both the stream route and the speaker mapping — and 42 follow-up
checks while milestone 5 was, including the unread count on the bell matching the inbox, the
email-is-not-configured notice naming the variable to set, push admitted to be unqueued, a
failure's reason rendered on its own row, and another tenant's owner getting `404` on both the
timeline and the inbox.
