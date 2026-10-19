# Security policy

Prepo is a portfolio project, not a product with a support contract. It holds meeting recordings
by design, so it is built as though it holds yours — and this file records what is actually in
place, what is not, and how to report a problem.

**Status: milestone 8.** Authentication (password + TOTP two-factor), tenant isolation, the
writable core loop, the audio path (recording, upload, transcript import, speaker mapping,
retention), the follow-up engine (escalation ladder, job, quiet hours, digest, notification
centre), the Linear integration (encrypted token, queue, pull, signed webhook), extraction
(transcript → minutes and grounded action items through OpenRouter) and the desktop shell are
implemented and tested. Two providers are wired and **unconfigured on this deployment** —
speech-to-text (no `DEEPGRAM_API_KEY`) and email, where a `RESEND_API_KEY` is set but the account
has **no verified sending domain**, so Resend accepts only the account's own address and every other
recipient comes back `403`. That split has been exercised against the live API: three messages were
accepted and eight refused. Either way an email is attempted, then recorded as **failed with the
reason** rather than quietly marked sent, while the in-app half of the same rung is still delivered.
Push is never queued, and the web app is installable but holds nothing for later — the service
worker caches **no rendered page at all** — so nothing of yours is stored offline and no browser
cache can hand one person's board to the next person on that machine. Extraction has **no PII
redaction and no eval gate**. The desktop shell (milestone 8, `apps/desktop`) is a Tauri 2 window
with a tray, a global shortcut, `prepo://` links and native notifications that **exposes no command
and no capability to the page in the window**, hands any non-app origin to the system browser, and
refuses any target that is not http(s); it is **not packaged** — no installer, no code signing, no
update endpoint or signing key, so nothing updates itself, and no window has been run by hand. The
Linear integration has been run once against a real team (see *How this was checked*); everything
else in the table is tested against fixtures or a local database. Where the table below mentions
them, it says so.

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
| Agent output | Nothing becomes a ticket without passing the workspace autonomy setting (default: Suggest = human approval). Assist and Autopilot only auto-approve items at ≥ 0.85 confidence with no ambiguity or duplicate flag (Assist also requires an owner and a date); every auto-created ticket event records `actorKind: "prepo"` with a null actor, so a machine decision is never presented as a person's |
| Model input boundary | The transcript is sent as JSON, segment by segment, under a system prompt that names it as data and never as instructions. There are no model-facing tools, no URL from a meeting is fetched, and the only host contacted is OpenRouter's fixed endpoint. A transcript over 120,000 characters is **refused**, not truncated |
| Model output boundary | The reply must be JSON that passes `rawExtractionSchema` (Zod); a wrong shape fails the run and imports **nothing**. Values are cleaned (whitespace collapsed, lengths capped) and rendered as text, never as HTML; every citation is resolved against the segment ids that were sent |
| Evidence grounding | An action item with no valid citation is dropped and counted rather than repaired, and the quote on the review screen is read from the transcript row itself, not from the model's prose. Owners resolve only to workspace members (full name, alias, email local part); a name that matches two members is `ambiguous_owner`, not a guess |
| Model spend limits | 200 extraction runs per workspace per calendar month and 120,000 characters per transcript, both refusals with a reason; a 90-second timeout; tokens, cost and latency recorded in `ai_runs`. There is no circuit breaker and no concurrency limit |
| Ask Prepo privacy and scope | The question itself is **never written to the database**: the run row records purpose, model, tokens, cost and latency with a null `traceId`, and nothing else. Retrieval runs inside the workspace's row-level-security scope, so another tenant's transcript lines are indistinguishable from rows that do not exist. The same three-field schema gate applies to the answer; a citation naming a passage that was never sent is dropped and counted, an uncited answer is labelled rather than dressed up, and a workspace is refused after 300 asks a month |
| Uploads | Audio is accepted only if its own bytes look like audio — the container is sniffed (RIFF/WAVE, MPEG frame sync, Matroska, ISO-BMFF brands) and the extension the client claimed is ignored. Caps: 25 MB per file, 4 MB per chunked piece, 4 hours per recording, 300 transcription minutes per workspace per month. A file that fails is rejected with the reason, before anything is written |
| Recorded audio at rest | Bytes live under `apps/web/.storage` (or `AUDIO_STORAGE_DIR`) and are **never publicly addressable**: no presigned URLs, no static path. Playback goes through `/api/audio/[assetId]`, which resolves the caller's workspaces and lets row-level security decide visibility, then streams with `private, no-store` and `206` byte ranges. A non-member gets **404**, an anonymous caller **401** |
| Recording consent | A recording cannot be stored without an explicit consent confirmation, which is recorded against the person who gave it. The API refuses the upload — rather than trusting the form — if the flag is absent |
| Chunked uploads | Pieces are staged on disk and assembled only on the final piece; the row is never written unless assembly succeeds. Staging older than an hour is reclaimed, and an unfinished upload with no retention date is reclaimed after 90 days |
| Retention | The delete date is set when the audio is stored and recomputed when it is transcribed, so "delete as soon as it is transcribed" means exactly that. The sweep deletes bytes and marks the row; the transcript and everything derived from it stay |
| Destructive deletes | Deleting a meeting is offered only to `owner` or `admin`, and it is a single transaction: transcript segments, action items, recap links and the audio row go with the meeting, while tickets created from its items are **kept** with their link cleared. The confirmation panel shows the real counts read from the same scope (not a template sentence) before anything happens, and the audio bytes are removed only after the delete commits, so a failure leaves an orphan file rather than a row pointing at nothing. Every delete writes a `meeting.deleted` audit entry that survives the meeting it describes, because `audit_logs` has no foreign key to `meetings`. `db:meeting-delete` checks 24 of these, including that a meeting in another workspace is simply not found, since row-level security makes "not yours" and "does not exist" the same answer |
| Provider egress | The transcription provider is handed **bytes, not a URL**, so there is no user-controlled outbound request and no SSRF surface. The only host contacted is the provider's fixed endpoint, and only when a key is configured |
| Follow-up delivery | A message is only ever sent by the job, never inline in a request. Email goes to Resend's fixed endpoint from server-side code with a key read from the environment; only a 2xx marks a message `sent`, and anything else is stored as `failed` **with the reason**. With no key configured, every email rung fails loudly and the in-app half is still delivered — nothing is marked sent that was not. A person with a workspace read scope can cancel, move, snooze or stop any pending message in their own workspace, and each of those is an audit event |
| Follow-up content | The message is generated from the ticket row, so it carries the key, title, due date and lateness — the same facts for every tone. No user-supplied text is interpolated into a subject line, and the link is built from the workspace slug and ticket key rather than from stored input |
| Notification centre | Notifications are read per person (`user_id`), and marking one read or all read is scoped by the caller's own user id, so one member cannot read or clear another's inbox. The unread count is a `count` query, not a cached number |
| Quiet hours | The window is evaluated in the recipient's own IANA timezone via `Intl`; an unknown zone falls back to UTC instead of throwing. A held message is **deferred and kept**, never dropped, and the row records that it was held and why |
| Integration credentials | A Linear token and the webhook signing secret are encrypted with **AES-256-GCM** under `INTEGRATION_ENCRYPTION_KEY`, which lives in the environment rather than the database, and stored as `v1.<iv>.<ciphertext>.<tag>` with a fresh IV per value. Without that key, connecting is **refused** — there is no plaintext fallback — and a value that will not decrypt is reported as unusable instead of being used. The token is tried against Linear's `viewer` before it is stored, so a wrong key fails at the boundary. Changing the connection (connect, team, mapping, source of truth, secret, disconnect) requires `owner` or `admin`; other members see the page but cannot save |
| Integration queue | A local write never calls Linear. The ticket is marked `pending` in the same transaction as the change, and only `pending` tickets, or failed ones past their backoff, are ever pushed — so an unconnected workspace queues nothing at all. A push records `linear_synced_at` and marks the ticket `synced`, and the echoed webhook for that push re-applies the same values and reports "unchanged" |
| Webhook authenticity | `POST /api/integrations/linear/webhook` verifies **HMAC-SHA256 over the exact bytes** in constant time against the secret stored for that workspace, and refuses a `webhookTimestamp` more than 60 seconds from now, so a captured delivery cannot be replayed. A missing secret is a `400`, not "verification skipped". The payload is parsed before verification only to learn which team — and therefore which secret — to check against; nothing is written until the signature holds. A team this deployment does not mirror is answered `200` with a reason, because a 4xx would have Linear retry it forever |
| Integration tenancy | The team-to-workspace lookup is the only read in the app that happens before a workspace scope is set, and it reads only the integration row. The change itself is applied through `withWorkspace`, so row-level security decides what can be touched, and a delivery cannot reach a ticket in another workspace. Disconnecting keeps the tickets and the issues, and clears the links with an event saying why |
| Service worker caching | The installable app (milestone 9) runs a hand-written worker at `/sw.js` whose policy is *no HTML response is ever stored*. A browser cache belongs to the **profile, not the session**, so a cached board or ticket page would be one person's data shown to whoever signs in next at that machine — the usual "precache the app shell" advice is exactly that bug. What may be cached is public and versioned: the build's hashed `/_next/static/*` assets, `/icons/*`, the manifest and the offline page. Navigations are network-first and unstored; anything that is not `GET`, anything cross-origin, and any `Range` request (audio is streamed in pieces) is passed through untouched, as are `/api`, server actions and RSC payloads. A response that sets a cookie is skipped, the cache is bounded at 200 entries, and it is discarded wholesale when the worker's version constant changes. `pwa:check` asserts each of these against the worker's own source, and the two policy checks were confirmed by injecting a violation and watching them fail |
| Installed app boundary | The manifest declares `start_url: "/"` and `scope: "/"`, never a workspace route, because a manifest is shared by everyone who installs the app and cannot know who is signed in — an installed Prepo starts at the front door, which resolves the session itself. The install button renders **only** when the browser has actually offered installation (`beforeinstallprompt`, captured before hydration so a late offer is not missed), and it is not a data path: it calls `prompt()` and nothing else. Installing does not grant the app anything a tab does not already have, and there is no push subscription behind it |
| Offline page | The only page that works offline is `/offline.html`, a self-contained static file with no app asset, no script and no session-dependent content: it says there is no offline copy of your data and offers a retry. That is deliberate — the page cannot render anything belonging to a user, because it renders nothing from any user |
| Desktop window | The shell is a native window around the app, not a bundle of it: the app is still loaded over http(s), so its session handling, row-level security and headers apply unchanged. The shell's own page is a local asset that probes the target and hands the window over, and that says which address it tried when the app does not answer |
| Desktop content boundary | **No capability is granted to any window**, so although the plugins register commands (notify, open, update, deep link), nothing in the webview can call one — neither the shell's own page nor the app it opens. `withGlobalTauri` is off, and the shell's own page is served with a CSP that denies by default (`default-src 'self'`, `frame-ancestors 'none'`, no `unsafe-eval`, no inline script) — the app's document carries whatever headers the app itself sends. There is no reachable IPC surface, and the review count the tray would like is not exposed rather than exposed to be shown |
| Desktop navigation | A navigation to any origin other than the configured app is refused inside the window and handed to the system browser, so a link in a meeting note cannot render inside a window that carries the session |
| Desktop target and deep links | The address is whatever `PREPO_DESKTOP_URL` says (default `http://localhost:3000`) and is refused outright unless it is http(s) with no credentials in it. `prepo://` links go through a total grammar: a wrong scheme, a missing or malformed workspace, an unknown target, a malformed ticket key or a percent-escaped identifier are each refused with a reason and logged, never navigated to |
| Desktop single instance | A second launch focuses the window that is already open rather than starting a second process, so a `prepo://` link from the OS reuses the running session instead of opening another one |

## What is **not** implemented

Grouped by the OWASP Top 10 (2021) entries the specification targets, these are the gaps that
remain. None of them are secret; the goal of this list is that nobody has to guess.

| Area | Gap |
|---|---|
| **A02** Cryptographic failures | Integration tokens and webhook secrets are encrypted (AES-256-GCM, key outside the database), but nothing else is: the PGlite directory and any backup are unencrypted, and stored audio relies on filesystem permissions. No encrypted backups. TLS/HSTS are the host's responsibility |
| **A05** Security misconfiguration | The strict CSP with nonces from the specification is not configured; no environment schema validation; no `Permissions-Policy`, COOP or CORP. The only headers the app sets are the ones the installable app needs — `Cache-Control` and `Service-Worker-Allowed` on `/sw.js`, a revalidating `Cache-Control` on the manifest, and a week's cache on the icons — so **none of the security headers in the spec are set**, and they belong with the hosting setup |
| **A06** Vulnerable components | No Dependabot, CodeQL or SBOM job in CI yet; `pnpm audit` is not wired into a pipeline. Run by hand against the pnpm lockfile on 19 October 2026, `pnpm audit --prod` reported **no known vulnerabilities** |
| **A07** Auth failures | No passkeys, OAuth or magic links; no email verification, password reset, or breached-password check (no mail provider); no CAPTCHA/bot challenge; no replay protection within a single TOTP step; no session invalidation on password change |
| **A08** Data integrity | Webhook signatures **are** verified now (HMAC-SHA256, constant time, 60-second window; see above), and a push records the remote issue id and timestamp so an echoed delivery is idempotent. The desktop shell exists but **nothing about it is signed or updated**: no installer, no code signing or notarization, and the updater is registered with no endpoint and no public key, so an update check reports that it cannot run rather than faking one. There is still no integrity check on stored audio bytes beyond the SHA-256 recorded at ingest, and the service worker adds none of its own: it trusts the build's content hashes, so an origin that served a hostile `/sw.js` could cache whatever it liked until the worker was replaced |
| **A09** Logging & monitoring | No Sentry or alerting; `auth_events` and `audit_logs` are append-only but there is no anomaly detection, no "impossible travel" alert, and logs are not shipped anywhere. The follow-up job prints a per-row decision line, but there is no metric or alert on a run that fails wholesale |
| **A10** SSRF | The transcription call is a fixed host with a body of bytes, the email sender is a fixed host with a server-built body, the Linear client is a fixed host (`api.linear.app`) with a server-built GraphQL document, and extraction posts a server-built JSON body to OpenRouter's fixed endpoint — so there is nothing to steer from user input, and applying a webhook never triggers an outbound fetch. No meeting is ever enriched by fetching a "source link" |
| **Linear integration** | The credential is a **personal API key, not OAuth**: it carries the key owner's whole Linear access, cannot be narrowed by scope, and revoking it is done in Linear rather than in Prepo. The webhook reads the body with `request.text()` before the signature is checked, so a large unauthenticated POST costs memory; there is no explicit size cap, no per-IP rate limit and no allow-list of Linear's addresses on that route. The signing secret is pasted by hand rather than registered through Linear's API. Exactly one team and one project are mirrored per workspace. Tickets that predate connecting are not backfilled, so there is no queue entry and no retry for them until they are moved. Linear's `canceled` state has no Prepo equivalent and is left unmapped rather than guessed, and comments, attachments, sub-issues, cycles, estimates and Linear's own labels are neither read nor written |
| AI pipeline | The transcript is sent **as stored** to the configured OpenRouter model: there is no PII redaction, no data-region choice and no per-user limit beyond the workspace's monthly run cap. There is no eval gate or prompt-version pinning, so a model or prompt change is not measured before it ships, and no output classifier — grounding catches uncited items but cannot catch a cited item that is still wrong. The provider is a third party and its retention terms apply to what is sent |
| Follow-up delivery | The `RESEND_API_KEY` is set, but the account has **no verified sending domain**, so Resend refuses every recipient except the account's own address with `403`. That was exercised live: three messages were accepted to the account's own address and eight refused `403`, with Resend's own text stored on each failed row. There is no bounce or complaint handling, no unsubscribe link, no per-recipient send rate limit beyond the ladder itself, and no retry with backoff: a failed message stays failed. The job is a script meant for a scheduler; there is no queue, no worker, no exactly-once guarantee and no scheduled-job auth, so whoever can run it can send |
| Push notifications | Not implemented: no subscription flow, no `push_subscriptions` rows, no VAPID keys. The service worker exists now, but a worker is not a subscription — the ladder lists push on the nudge rung and the code refuses to write a push row while no device is subscribed, so nothing is pretended |
| Offline data | Not implemented, on purpose. There is no client-side store (no IndexedDB, no cached read endpoints), so offline reads and queued edits do not exist and the worker stores no page rather than half-working. The offline page says so. Adding it would need a per-user, encrypted store that is cleared on sign-out and on remote revoke — none of which exists, which is why none of it was faked |
| Object storage | The R2 presigned-PUT flow in the spec is not implemented — there is no Cloudflare account on this machine, so audio uses a local filesystem driver behind the same `StorageDriver` interface. The interface has no presign method at all, which is why the "no publicly addressable URLs" claim holds here; moving to R2 would need the access route re-reviewed |
| Antivirus / content scanning | Uploaded audio is validated by format and size, not scanned. Transcripts are parsed as text only — `.docx` and `.pdf` are refused rather than parsed, so there is no document parser to attack |
| ASVS L2 | Not formally reviewed. The specification's checklist is mapped item by item to its evidence below |

### The pre-launch checklist (PREPO.md 9.4), item by item

| Checklist item | State |
|---|---|
| ASVS L2 checklist reviewed and documented | Not a clause-by-clause review. The two tables above read the same threat model by the OWASP Top 10 areas the specification targets, and record what replaced each gap or why it is not built |
| Automated RLS tests: user A can never read workspace B (including audio and transcripts) | Covered by `db:verify`: cross-tenant read and write attempts against row-level security, asserted on both PGlite and Postgres. Transcript segments, action items, tickets, follow-ups, notifications and notifications-read all resolve through the same scoped query functions, and `db:meeting-delete` checks that a meeting of another workspace is exactly a not-found |
| IDOR tests on every route and every presigned-URL issuer | There is no presigned-URL issuer: the local storage driver has no presign method and no public path, which is the precondition the table above states. The write path's cross-tenant cases are covered (`db:smoke`), but there is no route-by-route matrix asserting the audio playback route's own 401/404 behaviour per caller |
| Prompt-injection suite passes | Not a dedicated suite. The boundaries are asserted rather than ignored: the transcript goes in as JSON data under a prompt that names it as data, there are no model-facing tools, output must pass the Zod schema or nothing imports, citations are resolved against the segment ids that were sent, and Ask Prepo drops citations naming passages that were never sent (`db:ai-smoke`, 56 checks). A suite whose fixture transcript embeds instructions and asserts they change nothing is still to write |
| Upload abuse tests (wrong type, oversized, spoofed extension) | Covered by `db:audio`: a renamed text file does not sniff and is rejected before storage, a file over the cap is rejected, a recording over the duration cap is rejected, and a `.docx` transcript is refused with a reason rather than parsed. Zip bombs are not applicable, nothing is parsed as an archive |
| Linear webhook signature and replay tests | Covered by `db:linear`: a signature verifies against its own secret and fails another, a missing signature fails, a delivery older than the 60-second replay window is rejected, and a future-dated delivery is rejected |
| OWASP ZAP baseline | Not run. There is no hosted origin to scan; `next start` on localhost is not the shape ZAP exists for |
| Headers verified | Not reached at all, because **no security header is configured**: the only headers the app sets are the installable app's cache rules. This is the next item on this list and needs the CSP origin inventory built with the hosting story, not bolted on |
| Dependency, secret, and `cargo audit` scans clean | `pnpm audit --prod` clean by hand on 19 October 2026 (recorded in the A06 row). No automated image: no CI job, no gitleaks hook, no `cargo audit` — nothing mobile/desktop is published, so there is no artefact for cargo to audit |
| Desktop updater tamper test | Not applicable yet: the updater is registered with no endpoint and no signing key, so it reports that it cannot update rather than downloading anything |
| Backup restore drill | Not performed. No scheduled backups exist; the honest drill needs a backup target, restores the PGlite/Postgres volume, and redoes `db:verify` on the restored copy |

## Verifying the claims

The mechanisms above are covered by the test suite rather than by assertion:

```bash
pnpm --filter @prepo/web db:verify   # RLS and cross-tenant isolation, on both engines
pnpm --filter @prepo/web db:smoke    # the write path, including a cross-tenant write failing
pnpm --filter @prepo/web db:auth     # hashing, throttling, sessions, TOTP against RFC vectors
pnpm --filter @prepo/web db:audio    # parsing, sniffing, chunk assembly, retention, tenant boundary
pnpm --filter @prepo/web db:retention  # the retention job, runnable from a scheduler
pnpm --filter @prepo/web db:followup-smoke  # the ladder, quiet hours, digest and the job
pnpm --filter @prepo/web db:linear-smoke    # crypto, mapping, queue, push, pull, webhook, tenancy
pnpm --filter @prepo/web db:extract-smoke   # schema gate, grounding, dates, autonomy, refusals
pnpm --filter @prepo/web db:meeting-delete   # deleting a meeting: counts, cascades, kept tickets, audit
pnpm --filter @prepo/web db:ai-smoke        # Ask Prepo: scope, groundings, refusals, no stored question
pnpm --filter @prepo/web pwa:check     # the installable app, against a running production server
pnpm --filter @prepo/desktop verify   # the shell's configuration: CSP, capabilities, scheme, updater, icons
pnpm --filter @prepo/desktop test     # the shell's rules: target refusal, the prepo:// grammar, workspace detection
```

`db:verify` and `db:smoke` run against the embedded engine and a real Postgres (set
`DATABASE_URL`). `db:meeting-delete` runs against neither of the configured ones: it creates a
temporary database directory of its own, because a destructive check that reseeded the working
database would take the live connections and fixtures with it. Twenty-four checks pass there,
and the working `.pglite` is untouched by a run. `db:auth` pins the TOTP implementation against all six RFC 6238 test vectors.
`db:audio` is the audio equivalent for the part that does not need a provider: the VTT/SRT/plain
parsers, magic-byte sniffing and the size/duration caps, the Deepgram response mapping against a
recorded-shape payload, the storage driver (including a key trying to escape the storage root),
chunked assembly and its refusal of an out-of-order piece, the retention clock and the sweep, the
ingest writes, speaker mapping, and the cross-tenant attempts. Ninety checks pass.

`db:followup-smoke` covers the security-relevant half of the chaser directly: that a refused email is
recorded `failed` **with the reason** and never as `sent`; that the in-app half of the same rung is
still delivered; that quiet hours defer rather than drop, in the recipient's own zone, with an
unknown zone falling back instead of throwing; that a message a person moved is not re-cancelled by
its own move, while a rung left behind by a due-date change is; that a finished ticket cancels what
was pending; that a digest is never placed twice; that marking an inbox read touches only the
caller's own rows; and that a cancellation in one tenant cannot reach another. Ninety-three checks
pass, in either email environment: with a provider configured the recorded reason is the provider's
own words, and without one it names the missing variable.

`db:linear-smoke` is the integration's equivalent, run against an in-memory Linear that really holds
state. One hundred and nineteen checks: the encryption round-trip and its refusals (a wrong key, a
truncated tag, a value that is not `v1`); the mapping arithmetic in both directions, including which
of several same-type states a status picks; HMAC signatures,
including a replayed body and a stale timestamp; the queue refusing to write a `pending` state while
no connection exists; push as create-then-update rather than a duplicate; a refused push recording
the reason, backing off, and recovering; pull applying status and assignee, treating `canceled` as
unmapped, and keeping a removed issue's ticket; both source-of-truth orders, including the override
being written to the timeline; the echoed webhook staying idempotent; the job's counts; the webhook
secret being encrypted at rest; a second workspace's ticket being unreachable; and disconnect
keeping the tickets. What it cannot prove is that Linear itself answers: the network is a fixture.

The network has been used once, deliberately, against a private Linear team. Nine demo tickets were
queued by hand (there is still no backfill) and created as issues with the mapped state, priority and
due date; a later pass wrote the states; and a state changed *in Linear* was pulled back onto its
ticket by the next pass. No assignee was attached, because none of the demo addresses belongs to that
team — owners match by email, and Prepo does not guess. That run is also what exposed the two
integration defects now fixed (a create that did not send `stateId`, and in-progress tickets landing
in whichever `started` state came first), so the live exercise paid for itself. The token used for it
is encrypted in the local database under the same `INTEGRATION_ENCRYPTION_KEY` as any other, and the
demo tickets in Linear can be deleted from Linear without touching Prepo.

`db:extract-smoke` covers the model boundary without a network call. Sixty-six checks: a reply that
is not the agreed shape imports **nothing** and still records its spend; an uncited item is dropped
and counted while a cited one is kept; a citation that does not resolve cannot become evidence; an
ambiguous owner is flagged rather than guessed; confidence is clamped; a date is validated and stored
at 17:00 in the owner's zone across both DST changes; the transcript and monthly caps refuse rather
than truncate; Assist and Autopilot only auto-approve unflagged high-confidence items and record
`actorKind: "prepo"`; a re-run replaces proposed items only; and another workspace's meeting is
indistinguishable from a missing one. What it cannot prove is how well a real model reads a real
transcript — nobody has measured that yet.

`db:ai-smoke` is the ask-and-necessity counterpart of that, on its own throwaway database (56 checks).
On the necessity half: the arithmetic on known inputs, that a meeting with nothing to compare is
left unscored rather than scored 100, that the earliest meeting in a workspace is never scored, that
a stale value is cleared and a re-run changes nothing, and that a meeting in another workspace is
not scoreable at all. On the ask half: retrieval returning the lines that say the thing; the
passages carrying the rows they came from; every refusal (empty question, over-long question, no
model, monthly cap, nothing retrieved) happening **before** any provider call, with a fixture that
throws if it is reached; a citation naming a passage that was never sent being dropped and counted;
a ticket key in lower case resolving anyway; the uncited and unconfident paths carried through; a
schema-breaking answer refused and still recorded; and every ask run written with a null `traceId`,
which is the check on the "never stores the question" claim. The scheduled extraction job is also
driven end to end with a fixture: it extracts a summary-less meeting and the necessity pass behind
it scores its restated item 100.

`desktop:verify` reads the shell the way an attacker would. Forty-eight checks over
`apps/desktop/src-tauri`: that a CSP is set and denies by default without `unsafe-eval` or inline
scripts; that nothing grants a permission to remote content and no command is registered at all;
that the bundle identifier is not the framework default; that the default target's origin is allowed
by `connect-src`, so changing one without the other fails the check; that the `prepo://` scheme in
the Tauri config is the same string the parser accepts; that the updater claims no signing key; that
every icon the bundle names exists, including the `.ico` and the `.icns`; and that the version
agrees across `package.json`, `tauri.conf.json` and `Cargo.toml`. `cargo test` covers the rules as
code, in twenty-two assertions: that `file://`, `javascript:` and `data:` targets are refused and
that an address carrying a login is refused; that a `prepo://` link with no workspace, with
credentials, with an unknown target or with a percent-escaped identifier is refused rather than
sanitised; and that a route like `/download` is not mistaken for a workspace. What neither can prove
is that the window renders, that a tray click opens what its label says, or that an installer
installs — no window has been run by hand here, and no installer exists to run.

`pwa:check` asks a **running production build** for the things a browser asks for before it will
install a site: 55 checks that the manifest is served with a manifest content type and carries a real
name, `start_url`, standalone display and theme colours; that every icon it names is served as a PNG
whose **actual header bytes** match the size the manifest claims, including a maskable rendering that
is a distinct image rather than a relabelled copy; that the service worker is served uncached, allowed
to control `/`, and **compiles**, because a worker with a syntax error takes installability with it
silently. The policy assertions are made against the worker's own source, since a worker cannot be run
in a terminal: that no `.put(` appears anywhere before the asset cache (so a navigation is never
stored), that the precache list is exactly public paths, that non-`GET`, cross-origin and `Range`
requests are excluded, that a cookie-setting response is skipped, and that the cache is bounded. Two
of those were proven by **injecting the violation they describe** — a workspace route added to the
precache list, and a write added to the navigation path — and watching them fail; the second only
failed after the check was tightened, because the first version looked for one variable name. It also
fails if a sitemap entry or a robots rule names `prepo.vercel.app`, the `*.vercel.app` name the
specification suggested, which belongs to an unrelated application: the origin now comes from
`APP_URL` and defaults to localhost. What it cannot prove is that the worker behaves as written in a
browser, that the install prompt appears, or that the offline page looks right: none of that has been
run in a browser here.

On top of the committed suites, the flows were exercised end-to-end over HTTP against the
production build: 46 sign-in checks and 23 two-factor checks while milestone 3 was built, 73
audio checks while milestone 4 was — including refusal of a renamed file and of an upload without
consent, the 25 MB cap, a three-piece chunked upload, `206`/`416` byte ranges, and another
tenant's owner getting `404` on both the stream route and the speaker mapping — 42 follow-up
checks while milestone 5 was, including the unread count on the bell matching the inbox, a
failure's reason rendered on its own row, push admitted to be unqueued, and another tenant's owner
getting `404` on both the timeline and the inbox — and 27 Linear checks while milestone 6 was,
including the integrations page naming the missing `INTEGRATION_ENCRYPTION_KEY` instead of offering
a connect that could not be stored, no webhook address shown before a connection exists, no Linear
card on a ticket in an unconnected workspace, and the public route answering `405` to a `GET`, `400`
to an empty, non-JSON, team-less or stale body, and `200` with a reason for a team nobody mirrors
(which is why a forged signature there changes nothing). The `401` branch itself — a real secret,
a wrong signature — is covered by the committed suite rather than by that live pass, because
reaching it over HTTP needs a connected workspace.

And one live extraction while milestone 7 was built: a four-line synthetic transcript through the
configured free OpenRouter model returned three items, resolved Lena, Sam and Priya by name, turned
"by Friday" into 2026-10-16 and "tomorrow" into 2026-10-13 (both 17:00 Europe/Berlin), left the
undated item undated with `no_deadline`, and reported `$0.000000` cost. One run is an anecdote, not
an eval; it is here because it is the only evidence that the prompt and the free model agree.

And one live Ask Prepo call while this feature was built, run with `db:ask-live "What is the
checkout webhook retry bug?"` against the seeded demo workspace and the same configured model: the
answer was accepted by the schema gate, cited the real transcript line ("We still lose events when
the downstream is slow. I need to fix the checkout webhook retry bug this week, it's blocking the
launch.") and the real ticket `PRE-142`, read 20 passages, reported `$0.000000` cost in 3,920 ms,
and dropped nothing. The question printed in the command is recorded here rather than stored: the
run row's `traceId` is null, which `db:ai-smoke` checks for every ask run. It is an anecdote, not a
benchmark, and it is one run on top of the suite, not part of it.

The meeting page was also checked over HTTP: 16 checks against the production build, including the
Extraction panel appearing on a meeting with minutes and offering a re-run whose copy promises that
proposed items are replaced while ticketed and rejected ones are kept, a meeting with a transcript
and no minutes offering a first extraction, clarity rendering as a scored meter, necessity saying
that comparing meetings is not built, the transcript tab still rendering, and no `sk-or-` key
appearing anywhere in the page. (The necessity meter's copy is different now: the score shipped
after that pass, and its hint describes the arithmetic instead. The rest still reads the same.)
