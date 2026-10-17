# Security policy

Prepo is a portfolio project, not a product with a support contract. It holds meeting recordings
by design, so it is built as though it holds yours — and this file records what is actually in
place, what is not, and how to report a problem.

**Status: milestone 4.** Authentication (password + TOTP two-factor), tenant isolation, the
writable core loop, and the audio path — recording, upload, transcript import, speaker mapping,
retention — are implemented and tested. The speech-to-text *provider* is wired but unconfigured
on this deployment (no `DEEPGRAM_API_KEY`), so recordings are stored and never sent anywhere;
the provider response mapping is pinned by a fixture instead. Extraction, integrations and the
desktop shell are not built yet; where the table below mentions them, it says so.

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
| **A09** Logging & monitoring | No Sentry or alerting; `auth_events` and `audit_logs` are append-only but there is no anomaly detection, no "impossible travel" alert, and logs are not shipped anywhere |
| **A10** SSRF | The transcription call is a fixed host with a body of bytes, so there is nothing to steer. When extraction (milestone 7) adds a second provider, the same rule applies: no user-supplied URLs, and no fetching a meeting's "source link" |
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
```

`db:verify` and `db:smoke` run against the embedded engine and a real Postgres (set
`DATABASE_URL`). `db:auth` pins the TOTP implementation against all six RFC 6238 test vectors.
`db:audio` is the audio equivalent for the part that does not need a provider: the VTT/SRT/plain
parsers, magic-byte sniffing and the size/duration caps, the Deepgram response mapping against a
recorded-shape payload, the storage driver (including a key trying to escape the storage root),
chunked assembly and its refusal of an out-of-order piece, the retention clock and the sweep, the
ingest writes, speaker mapping, and the cross-tenant attempts. Ninety checks pass.

On top of the committed suites, the flows were exercised end-to-end over HTTP against the
production build: 46 sign-in checks and 23 two-factor checks while milestone 3 was built, and 73
audio checks while milestone 4 was — including refusal of a renamed file and of an upload without
consent, the 25 MB cap, a three-piece chunked upload, `206`/`416` byte ranges, and another
tenant's owner getting `404` on both the stream route and the speaker mapping.
