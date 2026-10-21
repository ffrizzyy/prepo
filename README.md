# Prepo

> **The meeting ends. The work starts.**

Prepo is an AI agent that acts as a proxy project manager. It turns meetings (recordings,
transcripts, or raw minutes) into assigned tickets and keeps following up until the work
is done.

[![CI](https://github.com/ffrizzyy/prepo/actions/workflows/ci.yml/badge.svg)](https://github.com/ffrizzyy/prepo/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ffrizzyy/prepo/actions/workflows/codeql.yml/badge.svg)](https://github.com/ffrizzyy/prepo/actions/workflows/codeql.yml)
[![eval gate: item F1 0.800](https://img.shields.io/badge/eval_items_F1-0.800-blue)](#the-eval-gate)

This repository is being built against the specification in [`PREPO.md`](./PREPO.md).
The shape of the built system, its trust boundaries and the decisions behind it
are in [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`docs/adr/`](./docs/adr/README.md).

## Status

**Milestone 9 — the installable app.** The schema, migrations, tenant isolation and seed are
complete and verified against two engines; the app reads and writes Postgres; authentication is
real — password sign-in, per-device sessions with revoke, throttling, and TOTP two-factor with
single-use recovery codes; the audio path (milestone 4) records, uploads and transcribes; the
follow-up engine (milestone 5) chases; **milestone 6 mirrors tickets into Linear and takes
Linear's changes back**, through a queue that never makes a local write wait on the network.
**Milestone 7 turns a transcript into minutes and candidate action items through OpenRouter**,
grounded in the transcript before a single row is written. **Milestone 8 adds `apps/desktop`**: a
Tauri 2 window around the web app with a tray, a global shortcut, `prepo://` links and native
notifications — compiled, unit-tested, and checked, but **not packaged or published**, and with no
bridge from the page in the window back into the shell. **Milestone 9 makes the web app
installable**: a manifest, real icons and a service worker, so a browser will offer to install it
and it opens in its own window.

Installing gives you the app, not your data. The service worker's fetch policy is written to cache
**no rendered page at all** — a browser cache is shared by everyone who uses that browser profile,
so a stored board would show one person's tickets to the next — which means offline you get an
offline page that says so, not your tickets. Offline reads, queued edits and push notifications are
not built; the `/download` page, the FAQ and the "Get the app" section each say exactly that.

The extraction step is deliberately conservative. The transcript is sent as JSON and treated as
untrusted data; the reply has to pass the same Zod schema the prompt describes; every action item
must cite a segment token that resolves to a real row, and an item that cannot is **dropped**
rather than repaired. The quote the review screen shows is read from the transcript, not from the
model's prose. Owners resolve only against workspace members (full name, alias, or the email's
local part; a first-name match scores lower, and two matches are ambiguous, not a guess). A date
becomes 17:00 in the owner's zone, and clarity is arithmetic over what was extracted rather than a
second opinion. Assist and Autopilot auto-approve only high-confidence items with no ambiguity or
duplicate flag. A run is capped at 120,000 characters of transcript and 200 runs per workspace per
month, and both refusals say so.

The follow-up engine is honest about what it can and cannot deliver here. A `RESEND_API_KEY` is
configured, but the account has **no verified sending domain**, so Resend accepts a send only to
the account's own address; anything else comes back `403` and is **recorded as failed with
Resend's own words**, never quietly marked sent, while the in-app half is delivered to the
notification centre. That is not theory: the chaser was run against the live API, three messages
were accepted to the account's own address (`01a14cdb-…`, Resend's ids) and eight were refused
`403` because the demo members are not that address. The refused rows on the follow-ups page carry
Resend's message verbatim. Whether the key is set or not, a refused email always carries a reason.
Push is listed on the nudge rung because the ladder advertises it, but **no push row is ever
queued**: that needs a subscription and a key to send from, and neither exists. Quiet
hours **defer** a message until the window ends, in the recipient's own timezone, rather than
dropping it — an early run at 17:00 UTC moved its messages to the next working morning and said so.

One older gap stays as it was, and the UI still says so: there is no `DEEPGRAM_API_KEY`, so nothing
is sent anywhere for speech-to-text, and import-by-transcript is the working path. The extractor
is configured: `AI_MODEL_EXTRACT` names a model on OpenRouter, chosen from the provider's live model
list and free to run at this size, so a real extraction needs no credit.

The links under the landing page are real routes now — `/security`, `/privacy`, `/terms` and
`/download` — and so are the 404 and 500 states. [`SECURITY.md`](./SECURITY.md) records what is
implemented next to the OWASP gaps that are still open, so nothing has to be taken on trust.

One correction is worth naming. The specification suggested launching on a free `*.vercel.app`
name, and the metadata, sitemap and robots.txt had `https://prepo.vercel.app` hardcoded — which
turns out to answer `200` with an **unrelated application**. No page claims it any more: the origin
comes from `APP_URL` (`src/lib/site-url.ts`), and with that unset the site describes itself as
`http://localhost:3000`, which is where an undeployed checkout genuinely runs. `pwa:check` fails if
a sitemap entry or a robots rule names that domain again.

| Area | State |
|---|---|
| pnpm monorepo (`apps/web`, `apps/desktop`, `packages/shared`, `packages/config`) | Done |
| Design tokens (coral + near-black, light/dark, radius scale, one elevation) | Done - direction and dials in [`DESIGN.md`](DESIGN.md) |
| Landing page, all 11 sections | Done |
| Static pages — `/security`, `/privacy`, `/terms`, `/download` | Done |
| Designed states — 404 (`not-found.tsx`) and 500 (`error.tsx`, `global-error.tsx`) | Done |
| Interactive hero preview (approve → ticket) | Done |
| Sample-data layer shared with the app | Done |
| SEO (`robots.txt`, `sitemap.xml`, metadata) | Done |
| App shell: sidebar, mobile bottom nav, command palette | Done |
| Dashboard, Meetings (+detail, transcript), Board, Tickets (+detail) | Done |
| Follow-ups (real timeline, cancel/reschedule), Notifications, Insights, Settings | Done |
| Postgres schema - 25 tables, Drizzle migrations | Done |
| Row-Level Security, cross-tenant isolation verified | Done |
| Seed (two workspaces) and the repository read layer | Done |
| UI wired to Postgres — server-component reads, server-action writes | Done |
| Sign-in / sign-up / create workspace, argon2id passwords | Done |
| Per-device sessions, revoke one / revoke the others, idle + absolute expiry | Done |
| Sign-in throttling and the identity-plane audit log | Done |
| TOTP 2FA with single-use recovery codes | Done |
| In-app recorder: mic, pause/resume, timer, level meter, chunked upload | Done |
| Upload a recording: magic-byte sniffing, 25 MB / 4 h caps, consent gate | Done |
| Import a transcript (`.vtt .srt .txt .md`) or paste minutes | Done |
| Speaker mapping to workspace members | Done |
| Transcript + audio player: click to seek, speed, `206` byte ranges | Done |
| Private storage driver, no publicly addressable audio URLs | Done |
| Retention setting, delete-audio-now, and the sweep job | Done |
| Escalation ladder: reminders, overdue nudge, escalation to the organizer | Done |
| Follow-up job: quiet hours per person, digest, cancellation on completion | Done |
| Notification centre, per-person unread count, mark one / mark all read | Done |
| Ticket controls: chase now, snooze, stop chasing | Done |
| Linear — connect with a personal API key, token encrypted (AES-256-GCM), never stored in the clear | Done |
| Linear — choose a team (and optional project), editable priority/status/label/owner mapping | Done |
| Linear — local writes queue, `db:linear` (or "Sync now") does the network, failures back off and retry | Done |
| Linear — pull and signed webhook share one conflict rule; `canceled` is reported as unmapped | Done — a real team, one real push (9 issues) and one real pull are recorded below |
| Linear — link, sync status and one-click retry on the ticket page | Done |
| Linear OAuth 2.0 | Not implemented — the personal API key path was built instead (see **Linear** below) |
| Extraction — summary, decisions, open questions, action items, one call per meeting | Done — OpenRouter, JSON Schema (with a JSON-mode fallback) |
| Extraction grounding — citations resolved to real segments, uncited items dropped, owners from the roster, dates at 17:00 local | Done |
| Review — approve / reject with the transcript quote, owner confidence and flags | Done |
| Budget and observability — 120k-character cap, 200 runs per workspace per month, `ai_runs` cost/latency/usage | Done |
| Autonomy — Suggest / Assist / Autopilot applied at extraction time | Done |
| Automated extraction evals (golden set, precision/recall gate) | Done for **recorded** outputs — `db:eval` gates item F1 0.800, owners 0.833, deadlines 0.833 against 0.75 floors; it makes no model call and says nothing about live-model quality (see **The eval gate**) |
| PII redaction before the model call | Not implemented |
| Speech-to-text provider (Deepgram) | Wired, **unconfigured without a key** |
| Tab-audio capture (`getDisplayMedia`), `.docx`/`.pdf` transcripts | Not implemented — recorder is mic-only; transcripts are parsed as text |
| Email delivery (Resend) | Wired and used live: 3 messages accepted to the account's own address, 8 refused `403` (no verified sending domain) with Resend's reason recorded on the row |
| Push notifications | Not implemented — no subscription flow and no VAPID key; being installable is not subscribing, so no push row is ever queued |
| Installable app (PWA) - manifest, icons, service worker, install offer | Done - `pwa:check` 55/55 against the production build. The worker caches **no rendered page**, so offline reads are not built and offline is a page that says so |
| Delete a meeting, its transcript, its recording and its recap links (owner/admin, audited) | Done - `db:meeting-delete` 24/24 on a throwaway database. Tickets created from the meeting are **kept** and unlinked |
| Insights - status mix, meeting to ticket conversion, clarity trend, meeting load grid | Done - every figure is computed from the workspace's own rows; no sample numbers are drawn |
| Ask Prepo (question answering over a workspace) | Done - `db:ai-smoke` covers retrieval, citation grounding and every refusal. Answers are cited and non-streamed; there is no side panel |
| Meeting necessity score (does one meeting repeat earlier ones) | Done - arithmetic over the stored action items and decisions, at the same 0.6 title match the duplicate flag uses. Run by the extraction path and by `db:necessity`; a meeting with nothing to compare against is left **unscored**, never guessed |
| Meeting-decision insights (which meetings were worth holding) | Partly - `/insights` shows meeting load; the necessity column is the one figure drawn from this score |
| Desktop (Tauri 2) shell - native window, tray, global shortcut, `prepo://` links, notifications, single instance, window state, external links kept out of the app window | Done - `cargo test` 22/22, `desktop:verify` 48/48. **No installer is built or published**, there is no update endpoint or signing key, and no command is exposed to the page in the window |
| Docs - `PREPO.md`, `SECURITY.md` (posture + OWASP gaps), `DESIGN.md` (direction, dials, reasons) | Done |

The app runs at **`/northwind`** on the seeded "Northwind Studio" workspace. Sign in
(see below) and everything you see is read from Postgres. Approving an action item writes a
real ticket, schedules its whole escalation ladder, and moves the item to `ticketed`; moving a
ticket on the board records an audit event and, when it reaches `done`, cancels what was left of
that ladder. Mutations are server actions, so the UI updates
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

## Audio and transcription

There are four ways to get a meeting in: **record** it in the app, **upload** a recording,
**import** a transcript file, or **paste** the minutes. All four post to route handlers rather
than server actions — a server action body is capped at 1 MB, which a recording is not — and all
four work as plain `<form>` posts, so the page is usable with JavaScript off. The recorder is the
only part that needs JavaScript; everything else degrades to a form.

**Recording.** `MediaRecorder` captures the microphone (not the tab — `getDisplayMedia` is not
implemented, and the recorder says so). Pause/resume, a visible timer and a level meter are live.
The audio is uploaded in 2 MB pieces to `/api/uploads/audio/chunk`, each piece staged on disk, and
only assembled when the final piece arrives — a dropped connection costs one piece, not the
meeting. The meeting row is not written unless assembly succeeds. Staging abandoned for over an
hour is reclaimed.

**Validation is on the bytes, not on the filename.** The container is sniffed (RIFF/WAVE, an MPEG
frame sync, Matroska/WebM, ISO-BMFF brands for M4A/MP4) and the extension the client claimed is
ignored, so renaming a text file to `.mp3` is refused with that as the reason. Caps: 25 MB a file,
4 MB a piece, 4 hours a recording. WAV duration is read from the RIFF header; other containers use
the client-reported duration with the size as the hard cap. A recording also requires an explicit
consent confirmation, recorded against the person who gave it — the route checks the flag itself
rather than trusting the form.

**Storage and playback.** Bytes go through a `StorageDriver` interface — the implementation in
this repo is the local filesystem under `apps/web/.storage` (git-ignored), because there is no
Cloudflare account here. The interface has no "presign" method at all: audio is never publicly
addressable. Playback goes through `/api/audio/[assetId]`, which walks the caller's own workspaces
and lets row-level security decide what exists, then streams with `private, no-store` and `206`
byte ranges so seeking works. A non-member gets **404**; an anonymous caller **401**.

**Transcription.** `TranscriptionProvider` is the seam the spec asks for; the one implementation
posts to Deepgram (`nova-3`, diarization, utterances, smart formatting) and maps utterances — or
word-level output — into the same timed, speaker-labelled segments the transcript parsers produce.
It is handed **bytes, not a URL**, so there is no user-controlled outbound request. **No key is
configured on this deployment**, so this path reports itself unconfigured: the recording is stored,
the retry button explains why nothing happens, and the transcript route is the working one. The
mapping itself is pinned in `db:audio` against a recorded-shape payload. Cost is only recorded when
`DEEPGRAM_COST_PER_MINUTE` is set, and each workspace has a monthly transcription-minutes budget
(300 by default) that Settings shows; a run over budget stores the audio without sending it.

**Speakers and retention.** Diarization gives `Speaker 1/2/3`; the transcript tab lists the labels
with their line counts and lets you rename one and attach it to a workspace member, in one form
post. Retention is a setting, not a fixed policy: keep until the meeting is deleted, or delete 7 /
30 / 90 days after transcription, or *as soon as it is transcribed*. The clock is set when the
recording is stored and recomputed when it is transcribed, so the last of those means exactly what
it says. Deleting the audio leaves the transcript, its segments and anything derived from them.
`db:retention` is the sweep, written to be run from a scheduler; it also reclaims unfinished
uploads and recordings never transcribed after 90 days.

> `db:audio-fixture` installs a quiet generated tone, matching the seeded transcript's length, on
> the seeded meeting, so the player and byte ranges can be exercised against real bytes. It is a
> tone, not a recording of the meeting, and the script says so.

## Follow-ups

The agent's whole job is the chase, so the ladder is arithmetic rather than a cron somewhere:
`src/server/followups/ladder.ts` is a pure function of the due date, and everything else consumes
it. Four rungs, as the UI has always advertised:

| Rung | When | To | Channels |
|---|---|---|---|
| Reminder | 24h before the due date | the assignee | in-app + email |
| Reminder | on the due day | the assignee | in-app + email |
| Overdue nudge | +1 day | the assignee | in-app + email (+ push, which is not built) |
| Escalation | +3 days | whoever ran the meeting | email |

Rungs whose moment has already passed are **not** scheduled when a ladder is built. A ticket with
no due date is never chased; an unassigned ticket gets only the escalation, because there is no
owner to remind. The escalation's recipient is `meetings.created_by`, falling back to the
workspace owner — "organizer" is a role the schema does not have, and both the code and the page
say which it used.

**The job.** `runFollowups()` is what a scheduler calls, exposed as
`pnpm --filter @prepo/web db:followups`, with `--at <ISO>` to run it at a chosen moment. Each run
considers every message whose time has come and decides one of four things: deliver it, fail it
with a reason, defer it for quiet hours, or cancel it because it no longer makes sense. It prints
that decision per row, so a scheduler log is readable rather than a shrug.

There is no row lock between passes. Two `db:followups` processes started at the same time can
both pick up the same message, and a crash after an email is accepted but before the row is
marked can resend it: delivery is **at-least-once**, and the scheduler must run one pass at a
time. The same applies to `db:linear`, where a crash between creating an issue and storing its id
can create a duplicate. See [`docs/adr/0003`](docs/adr/0003-row-and-a-pass-instead-of-a-workflow-engine.md).

- **Cancelled, not sent.** A message is cancelled when the ticket was finished after the message
  was queued, when its due date moved so the rung's moment no longer exists, when chasing was
  turned off for the workspace, or when a person cancelled, snoozed or replaced it. A row a person
  or the engine has already moved carries a note in `detail` and is left where it is — only an
  untouched rung is re-checked against the due date, which is what stops a quiet-hours deferral
  from being cancelled by its own move.
- **Quiet hours defer.** The window from Settings (`18:00`–`09:00` by default) is read in the
  recipient's own timezone, using `Intl`, which is also where the workspace's `Europe/Berlin`
  members and `America/New_York` members part ways. An unknown timezone falls back to UTC instead
  of throwing. A held message keeps its place in the queue and says it was held.
- **Email is attempted, then judged.** The Resend sender is a plain `fetch`; with no key the row
  is marked `failed` with `Not sent, because no email provider is configured (set
  RESEND_API_KEY)`, and the in-app half of the same rung still goes out. Only a 2xx response marks
  a message `sent`. Set the key and the same code path delivers.
- **Push is never queued.** The nudge rung lists push because that is the ladder the product
  advertises, but `pushAvailable` is false until a device is actually subscribed — and nothing
  subscribes one: there is no subscription flow and no VAPID key to send from. The app is
  installable now, but installing is not subscribing, so no push row is ever written, and the page
  says that instead of implying a notification you would never receive.
- **The digest.** Owners and admins get a weekly summary — what is late, what is due in the next
  week, and how much is waiting for review — on a weekday you choose, at 09:00 in each person's own
  zone. It is `in_app` + `email` rows with no ticket, so it appears in the same timeline, and a
  pending digest is never placed twice.

**Per person, not per workspace.** A reminder about your own work and the digest land in
`/northwind/notifications`, and the header bell carries that count. Two members of the same
workspace see different inboxes; marking one message read, or all of them, only touches your own
rows. The ticket page has `Chase now`, `Snooze 3 days` and `Stop chasing`, and the follow-ups page
lets you move or cancel any pending message individually.

## Linear

The plan (`PREPO.md` §8.6) says OAuth. What is built is a **personal API key**, because it is the
same integration with one fewer moving part: paste the key on `/[workspace]/integrations`, and
Prepo tries it against Linear's `viewer` before storing anything. A wrong key is refused on the
spot instead of being discovered later by a failed sync. The seam is a `LinearClient` interface
that takes an auth style, so an OAuth token would slot into the same place.

The token is encrypted at rest with **AES-256-GCM** under `INTEGRATION_ENCRYPTION_KEY` (32 bytes,
base64 or 64 hex) and stored as `v1.<iv>.<ciphertext>.<tag>`. Without that variable, connecting is
**refused outright** — there is no plaintext fallback and no "just this once" path — and a token
encrypted under a different key is reported as unusable on the page rather than crashing it.
Changing the connection is one of the few actions restricted to `owner` and `admin`.

**Nothing local waits on Linear.** Moving a ticket on the board, approving an action item or
snoozing a chase writes the change *and* marks the ticket `linear_sync_state = 'pending'` in one
transaction; the network happens in `runLinearSync()`. That function is exposed as a job —

```bash
pnpm --filter @prepo/web db:linear     # one pass: pull what changed, push what is queued
```

— and the **Sync now** button on the integrations page calls the very same function inside the
request, so pressing it proves what a scheduler would do rather than describing it. Tickets that
existed **before** connecting are not swept up: there is no board backfill, so an old ticket is
offered to Linear the next time it is moved or its action item is approved. The page says that.

**The mapping** is editable, and the defaults are Linear's own scale: priority `p0…p3` → Urgent /
High / Medium / Low, and status → workflow state *type* (`in_review` lands in `started`, because
Linear has no review type). A type with more than one state — Linear's default team has both
"In Progress" and "In Review" — is narrowed by name, so an in-progress ticket does not land in
whatever started state came back first. Labels map by name unless a row overrides one, and owners
map by email — both are `prepo=linear` lists. A label with no row is sent under its own name, and
an assignee with no Linear counterpart is left unassigned rather than guessed at.

**The conflict rule lives in one function.** `applyRemoteChange()` is used by both the pull and
the webhook, so a poll and a delivery cannot disagree about the same change. A field the payload
does not carry is never touched; a field that is present and `null` clears. With **Prepo first**
(the default), a ticket that is still queued keeps its local edit and the override is written into
the ticket's timeline as a conflict. With **Linear first**, the same change is applied along with
title, priority and due date. Linear's `canceled` state has **no Prepo equivalent**, so the ticket
is left alone and the state is reported as unmapped — instead of pretending the work finished.

**The webhook** is a shortcut, not a requirement: without one, the job still pulls the same
changes. Point a Linear webhook at `/api/integrations/linear/webhook` and paste the signing secret
Linear shows you. Deliveries are checked with **HMAC-SHA256 in constant time** against the secret
stored *per workspace*, and a delivery whose `webhookTimestamp` is more than 60 seconds old is
refused, so a captured request cannot be replayed later. The handler parses the body first — the
team in it is what names the secret to check against — but nothing is acted on until the signature
holds. A delivery for a team this deployment does not mirror is answered `200` with a reason
rather than an error, because that is a configuration choice and a 4xx would make Linear retry it
forever.

**When Linear refuses**, the ticket records Linear's own words, an attempt count and a backoff —
`1m, 5m, 15m, 1h, 6h`, capped — and the job retries it once past that. The ticket page shows the
error and offers a retry, which **queues** the ticket rather than sending from the page. A push
that succeeds clears the error and the count. Loops are prevented by recording `linear_synced_at`
and marking the ticket `synced`: the echoed webhook for that push re-applies the same values and
reports "unchanged", and only `pending` tickets (or failed ones past their backoff) are pushed.

**Not synced, and the page says so:** comments and attachments; sub-issues, cycles, estimates and
Linear's own labels; and exactly one team and one project are mirrored per workspace.

**How this is verified.** `pnpm --filter @prepo/web db:linear-smoke` runs **119 checks** against an
in-memory Linear that really holds state, so a refused call, a deleted issue, a replayed webhook
and both source-of-truth orders are all exercised — but Linear is not what answers.

The real API has been used, once, against a personal team (`FRI`, the only team the key can see).
The demo tickets were queued deliberately instead of relying on a backfill, and one pass created
`FRI-5`…`FRI-13` with the mapped state, priority and due date; a second pass wrote the states,
including the in-progress ticket landing in **In Progress** and the done ones in **Done**; then a
state was changed *in Linear* to Done and the next pass pulled it back onto the ticket. Assignees
were left empty, because none of the demo addresses is a member of that Linear workspace — email is
the only thing Prepo matches owners on, and it does not guess. Two real bugs came out of that run
and are fixed: a newly created issue was filed in the team's default state instead of the mapped
one, and `in_progress` and `in_review` both landed in whichever `started` state came first.

Nothing in this repository can prove a real push lands in *your* team until it is pointed at one,
and the README will not claim otherwise.

## Extraction

Milestone 7 turns a transcript into minutes and candidate tickets: one model call per meeting,
made through OpenRouter, followed by a grounding pass that decides whether anything the model said
is allowed into the database.

**Configuration.** Two values, both required:

```bash
OPENROUTER_API_KEY=      # in apps/web/.env.local, never committed
AI_MODEL_EXTRACT=        # a model id from OpenRouter's live model list
AI_MODEL_ASK=            # optional: what Ask Prepo answers with, else AI_MODEL_EXTRACT
```

`db:providers` shows whether they are set (masked); `--live` checks the key against
`https://openrouter.ai/api/v1/key`. With either missing, the meeting page names the missing value
and `db:extract` prints the same sentence and writes nothing. The request asks for a JSON Schema
response; if a provider rejects that, one retry uses JSON mode, and either way the reply must pass
`rawExtractionSchema` before anything is written. `AI_MODEL_FAST` is still not read (see **Ask
Prepo**).

**What a run does** (`extractMeeting` in `server/ai/extract.ts`):

1. Read the meeting, segments, roster, workspace settings and this month's run count in one
   workspace transaction.
2. Refuse early when there is no transcript, when the meeting already has minutes (the scheduled
   job never re-extracts), when the transcript exceeds 120,000 characters, or when the workspace
   has used its 200 runs for the month.
3. Call the provider **outside any transaction**. A 90-second timeout is a failed run, not a hung
   request.
4. Validate the reply, then ground it: `s1`-style citations are resolved against the transcript
   that was sent; an item with no valid citation is dropped and counted; owners resolve against
   members only; `dueDate` must be a real calendar date and is stored at 17:00 in the owner's
   timezone; near-identical titles are flagged, not deleted.
5. In a second transaction, write the summary, decisions, open questions, clarity score, items
   and one `ai_runs` row, plus an audit entry.
6. Apply the autonomy level. **Suggest** leaves everything in review; **Assist** tickets items at
   ≥ 0.85 confidence with an owner, a date and no ambiguity/duplicate flag; **Autopilot** drops the
   owner/date requirement but keeps the flag rule. Auto-approved tickets record `actorKind: "prepo"`
   with a null actor and get their normal follow-up ladder.

The review screen shows the quote from the transcript segment itself, so the evidence cannot be
fabricated; "Extract again" replaces only items still in review, never a ticketed or rejected one.

**What is deliberately not here.** There is no live-model eval: `db:eval` scores **recorded**
model outputs against golden transcripts (below), so it can catch a regression in grounding,
member resolution or date handling, but it cannot score a real model's judgement. PII redaction
before the call is not implemented. A transcript over the cap is refused rather than split. The
necessity score is a separate pass over stored rows rather than a second model call, and it is
arithmetic, so "why did this meeting score 90" has an answer that does not involve asking a model
what it meant.

**How this is verified.** `pnpm --filter @prepo/web db:extract-smoke` runs **66 checks** with a
fixture provider: configuration reasons, DST-correct date handling, schema degradation, grounding
(unknown citations, ambiguous owners, clamped confidence), the full happy path with stored values,
idempotency, replacement, Assist and Autopilot, the character and budget refusals, an invalid
reply, and cross-tenant invisibility. Run the scheduler entry point with `db:extract`. A live call
is the one thing the suite cannot make: one was run once against the configured free model and is
recorded in `SECURITY.md`, but it is not part of CI and it is not an eval. The meeting page itself
was checked over HTTP (16 checks: the panel, the re-run copy, the first-extraction state, the meter,
and no key in the HTML), also recorded there.

### The eval gate

`pnpm --filter @prepo/web db:eval` scores **recorded model outputs** against three golden
transcripts: 8 predicted items, 7 gold, 6 matched - item precision 0.750, recall 0.857, **item F1
0.800**; owners **5/6 (0.833)**; deadlines **5/6 (0.833)**. The floors are 0.75 for each, and the
suite exits non-zero below any of them.

The fixtures are deliberately imperfect: one reply loses an action item, one invents an item
nobody promised, and one gets an owner and a date wrong. Each reply still goes through the real
pipeline - schema, grounding, member and date resolution, the database write - and the rows that
land are matched to the gold labels one-to-one by title similarity. The scorer also checks itself:
a perfect prediction must score 1.000, an empty one 0.000, and a duplicate must cost precision.

What the gate proves: a change to the prompt contract, grounding, member resolution or due-date
handling that loses a known item, reassigns an owner or moves a date fails the build. What it
cannot prove: how a live model reads a transcript it has not seen. The number is a regression
floor for the pipeline, not a claim about model quality, and the badge at the top of this README
is that same recorded score. CI runs it without a model call or a network request. A live read
still needs `db:ask-live` and a key.

## Ask Prepo

`/[workspace]/ask` (sidebar: **Ask**) answers a question from the workspace's own transcript lines,
meetings and tickets, and shows the passages the answer rests on.

**How it retrieves.** Postgres full-text, not embeddings: `websearch_to_tsquery` over the
`transcript_segments.tsv` column that `drizzle/policies/002_search.sql` maintains with a trigger,
ranked by `ts_rank`, plus the workspace's recent meetings (title, date, minutes) and its tickets
(key, title, status, priority, owner, due date). A workspace-sized ticket list is cheaper to send
whole than to guess a keyword query for it, which is what makes "which of Sam's tickets are
overdue" answerable at all. Passages go to the model, never a whole transcript.

**What comes back.** `rawAskSchema` allows three fields: `answer`, `sources`, `confident`. Sources
are ids copied from the passages that were sent (`s1`, `s2`… for transcript lines, `m1`, `m2`… for
meetings, then ticket keys) and are resolved the way extraction resolves citations: an id that
names a passage that was never sent is dropped and counted, so the count in the footer is a real
count. Each transcript citation shows the words, the speaker and the meeting, and links to that
meeting's transcript tab. An answer that cited nothing is returned and labelled **uncited** rather
than withheld or dressed up, and "the passages do not answer this" is a permitted reply.

**Limits.** One question is capped at 500 characters; a workspace gets 300 Ask runs a month; the
question text is never written to the database (the `ai_runs` row records purpose, model, tokens,
cost and latency, with a null trace id). Empty, over-long, unconfigured, over-budget and
nothing-retrieved runs are refused with the reason, before any model call, so a refusal costs
nothing.

**What is deliberately not here.** Answers are not streamed and there is no side panel; a citation
opens the meeting's transcript tab rather than jumping to the exact line or audio moment. The
spec's fast-model query rewrite was not built either: `websearch_to_tsquery` already drops
stopwords and reduces a question to its content words, and the retrieval check in `db:ai-smoke`
shows that finding the right lines without it.

**How this is verified.** `pnpm --filter @prepo/web db:ai-smoke` runs **56 checks** on a throwaway
database with fixture providers: the scoring arithmetic, the seeded-history pass with its
idempotency and cross-tenant invisibility, retrieval ranking, the passage set, every refusal,
citation grounding (invented ids counted, lower-case ticket keys resolved), the uncited and
unconfident paths, the schema rejection, cost recording, and the scheduled job that extracts a
meeting and scores it behind the scenes. No key is needed and nothing is spent. One live call has
been made and is recorded in `SECURITY.md`:

```
db:ask-live "What is the checkout webhook retry bug?"
→ status: answered
  "The checkout webhook retry bug causes events to be lost when the downstream service is slow …"
  Speaker 2 in "Q4 Launch — Weekly Sync": "We still lose events when the downstream is slow. I need to fix the checkout webhook retry bug this week, it's blocking the launch."
  PRE-142
  20 passages read, model nvidia/nemotron-3-super-120b-a12b:free, cost $0.000000, 3920ms
```

## Meeting necessity score

Every meeting page carries a **Necessity** meter and `/meetings` shows the column. It is the
likelihood that the meeting repeated earlier ones, computed as a percentage:

```
100 × (items and decisions that repeat an earlier meeting) ÷ (all of this meeting's items and decisions)
```

A title matches at the same 0.6 Jaccard the within-meeting duplicate flag uses, so the two rules
cannot disagree about one pair of titles. A decision counts on its own, so a meeting that settled
the same things again with no action items still scores. The hint under the meter names the closest
match, so a number can be checked against the rows it came from.

It returns **null, not zero**, when there is nothing to compare: a meeting with no items and no
decisions, or the earliest meeting in a workspace. Null is shown as "Not scored" and never as a
guess or a zero.

Where it runs: after an extraction, from the page and from the scheduled job, plus
`pnpm --filter @prepo/web db:necessity` which recomputes every meeting oldest-first (the backfill
and the cron entry point). It is idempotent, compares only against meetings held earlier, and makes
no network call.

## Desktop shell

`apps/desktop` is a Tauri 2 shell — a native window around the web app, plus the four things a
browser cannot do on its own: a tray menu, a global shortcut (`Ctrl/⌘ + Shift + R` opens the
recorder), `prepo://` links, and native notifications. It is Rust and four small modules:

| File | What it decides |
|---|---|
| `src-tauri/src/config.rs` | where the window points (`PREPO_DESKTOP_URL`, default `http://localhost:3000`), and that the answer must be http(s) with no credentials in it |
| `src-tauri/src/deeplink.rs` | the `prepo://<workspace>`, `prepo://<workspace>/ticket/<KEY>` and `prepo://<workspace>/meeting/<id>` grammar, and where each one lands |
| `src-tauri/src/urls.rs` | which workspace the window is showing, and the routes the tray items open |
| `src-tauri/src/shell.rs` | the window, tray, shortcut, deep links, notifications and the update check |

The shell holds no product logic and no data of its own, and **no capability is granted to any
window** — so although the plugins register commands, nothing in the webview can reach the tray, the
filesystem, the opener or the updater; not the shell's own page, and not the app it opens. A link to
any other origin is handed to the system's browser rather than loaded in a window that carries the
session. Sessions appear as `desktop` in the device list because the shell sends a user agent
containing `Tauri/2 PrepoDesktop/0.1.0`, which is what `src/server/auth/user-agent.ts` reads.

**What it is not.** No installer is built or published — no `.dmg`, `.msi` or `.AppImage` — and
nothing is signed. There is no update endpoint and no update signing key, so *Check for updates*
answers with exactly that. `prepo://` registration in a development run lasts for the session; an
installed build would register the scheme through its own installer. Tray items and the shortcut
open the workspace the window is showing and fall back to the app's front door when none is known,
and the shell's "New recording" opens the recorder rather than starting it from the tray.

Two things check it without a screen:

```bash
pnpm --filter @prepo/desktop test     # 22 Rust tests: refusing a target, the prepo:// grammar, workspace detection
pnpm --filter @prepo/desktop verify   # 48 configuration checks: CSP, capabilities, icons, scheme, updater, versions
```

`verify` reads the configuration the way an attacker would: is a CSP set and does it deny by
default, does anything grant remote content IPC permission, does the update channel claim a key it
does not have, is the target origin actually allowed by `connect-src`. Neither it nor the tests
prove the window looks right or that a tray click does what the menu says; that needs a person and a
desktop, and has not been done.

## The installable app

The web app installs. Four things make that true, and each one is served by the production build:

| Piece | Where it lives | What it decides |
|---|---|---|
| Manifest | `src/app/manifest.ts` → `/manifest.webmanifest` | the name, the description, `start_url: "/"`, `display: standalone`, the theme colour, and the three icons a browser looks for |
| Icons | `public/icons/*.png`, `src/app/icon.png`, `src/app/apple-icon.png` | the same mark as the desktop shell — an ink rounded square with a coral P — at 192px, 512px, a 512px **maskable** rendering whose background bleeds to every edge, the 64px favicon and the 180px Apple touch icon |
| Service worker | `public/sw.js` | the fetch policy below, plus `skipWaiting`/`clients.claim` so a new policy is not stuck behind an open tab |
| Install offer | `src/components/pwa/install-button.tsx` + a capture script in `src/app/layout.tsx` | a button that appears **only when the browser has actually offered installation**, and never otherwise |

The fetch policy is the part worth reading, because it is where a service worker usually goes wrong:

| Request | What happens |
|---|---|
| A navigation (any HTML) | network first; **never stored**; on failure, the offline page |
| `/_next/static/*` | cache first — the filenames contain a content hash |
| `/icons/*`, `/manifest.webmanifest`, `/offline.html` | cache first |
| Anything that is not `GET` | untouched |
| Another origin | untouched |
| A `Range` request | untouched — audio is streamed in pieces, and piece ranges are not cacheable responses |
| Everything else (`/api`, server actions, RSC payloads) | untouched |

**No HTML response is ever put in a cache.** A browser cache belongs to the profile, not the
session: a stored board would be one person's tickets shown to the next person who signs in at that
machine. Caching the app shell is the usual advice and the reason most service workers leak; here the
trade is deliberate — you get an install, and offline you get a page that says you are offline. The
cache holds only public, versioned bytes, is bounded at 200 entries, skips any response that sets a
cookie, and is discarded wholesale when the worker's version constant changes.

```bash
pnpm --filter @prepo/web build
pnpm --filter @prepo/web start      # the worker only registers in a production build
pnpm --filter @prepo/web pwa:check  # 55 checks against the running server
```

`pwa:check` asks for these the way a browser would: it fetches the manifest, reads each icon's
**actual PNG header** to confirm it is the size the manifest claims, checks the worker is served
uncached and allowed to control `/`, compiles the served worker bytes to prove a browser will not
reject them, and reads the worker's own policy out of its source — that a navigation is never
stored, that no non-`GET` is touched, that the precache list contains only public paths.

Two of its checks were verified by making them fail on purpose: a workspace route smuggled into the
precache list, and a write added to the navigation path. Both were caught (the second only after the
check was tightened — it had looked for one variable name, and the injected code used another).

**What is not built:** offline **reads** (there is no client-side data store, so there is nothing to
read), queued edits, and push (no subscription flow, no VAPID key). Nothing in this repository has
run the worker in a browser: the policy above is asserted against its source, and whether the install
prompt appears is the browser's decision, on a secure origin, at runtime.

## Requirements

- Node.js ≥ 22 (developed on 24)
- pnpm 10+ (`npm i -g pnpm`)
- Docker *(optional)* — only for a real Postgres; the default embedded database needs nothing
- Rust (stable) and, on Windows, the MSVC build tools *(optional)* — only to build the desktop
  shell in `apps/desktop`

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

pnpm --filter @prepo/desktop verify   # check the desktop shell's configuration (48 checks)
pnpm --filter @prepo/desktop test     # the shell's Rust tests (URL refusal, prepo:// parsing)
pnpm --filter @prepo/desktop dev      # run the shell against the dev server
pnpm --filter @prepo/desktop build    # build an installer locally (none is published)
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
pnpm --filter @prepo/web db:audio      # exercise parsing, sniffing, storage, retention
pnpm --filter @prepo/web db:totp-fixture  # add a test account with 2FA on (see Authentication)
pnpm --filter @prepo/web db:audio-fixture # give the seeded meeting real audio bytes (a tone)
pnpm --filter @prepo/web db:retention  # run the retention sweep (scheduler entry point)
pnpm --filter @prepo/web db:followups  # work the follow-up queue (scheduler entry point)
pnpm --filter @prepo/web db:followup-smoke    # exercise the ladder, quiet hours and the engine
pnpm --filter @prepo/web db:linear      # work the Linear queue: pull what changed, push what is queued
pnpm --filter @prepo/web db:linear-smoke # exercise crypto, mapping, queue, push, pull and the webhook
pnpm --filter @prepo/web db:extract      # extract every ready meeting with no minutes (scheduler entry point)
pnpm --filter @prepo/web db:extract-smoke # exercise the schema gate, grounding, autonomy and refusals
pnpm --filter @prepo/web db:eval       # score recorded model outputs against three golden transcripts
pnpm --filter @prepo/web db:meeting-delete # delete a meeting and its derived data, on a throwaway database
pnpm --filter @prepo/web db:necessity  # recompute every meeting's necessity score, oldest first
pnpm --filter @prepo/web db:ai-smoke   # exercise Ask Prepo, citation grounding and necessity scoring
pnpm --filter @prepo/web db:injection-smoke # the poisoned-transcript suite: boundaries, not model opinions
pnpm --filter @prepo/web db:idor-smoke # every data route vs no cookie, forged token, foreign member (needs `next build` first)
pnpm --filter @prepo/web db:restore-drill  # the backup-restore drill: copy the data, verify only the restore
pnpm --filter @prepo/web db:ask-live "…" # ask the real provider one question and print the sources
pnpm --filter @prepo/web db:providers        # which keys are set, and whether they work
pnpm --filter @prepo/web db:studio     # browse the data
pnpm --filter @prepo/web pwa:check     # the installable app, against a running production server
```

`db:verify` migrates, seeds, then asserts the tenant boundary at the database level: each
workspace sees only its own rows, an unscoped session sees nothing, a cross-tenant read by
explicit id returns nothing (tickets, and with non-empty preconditions, transcripts and
recordings too), and a cross-tenant **write** is rejected by RLS. All twelve checks
pass on PGlite by default; to run them against a real Postgres instead, set both
`DATABASE_URL` and a scratch `PGLITE_DIR` (the suite keeps any database an operator points
at, and creates a throwaway only when nothing was pointed anywhere).

Every `db:*` check suite (`db:verify`, `db:smoke`, `db:auth`, `db:audio`,
`db:followup-smoke`, `db:linear-smoke`, `db:extract-smoke`, `db:eval`, `db:ai-smoke`,
`db:injection-smoke`, `db:meeting-delete`, `db:idor-smoke`) runs on a throwaway
database it generates for the run and deletes afterwards: a suite that reseeds
would otherwise truncate the working `.pglite`, taking the Linear connection and
the installed fixtures with it. The operator jobs (`db:seed`, `db:migrate`, the
fixture installers, the scheduled entry points) are the ones that touch the
working database, on purpose. `db:idor-smoke` additionally needs a production
build (`next build`) because it starts `next start` on a scratch port against
its own throwaway directory.

The battery and the hygiene gate are not only local: on every push and pull
request CI (`.github/workflows/ci.yml`) runs typecheck, the eleven fresh-database
suites from this list, the production build, `db:idor-smoke`, `pwa:check` against
a server it starts itself, the desktop shell's configuration verify, and — in its
own job — the shell's Rust rules (`cargo test`). A second job gates on
`pnpm audit --prod` and scans the full git history with gitleaks; `.gitleaks.toml`
documents the only two strings it allows, both fixture constants with no credential
value. CodeQL (security-extended) runs in its own workflow, Dependabot config
covers the workspace, and `db:restore-drill` runs against a dataset the web job
migrates, seeds and gives an audio fixture first — so the copy-and-verify
mechanics are checked on every push, while drilling an operator's own dataset
stays a local run. The web and scan jobs were first
green on 19 October 2026; the shell's Rust job found a Linux-only compile break
on its first run and was first green two days later, after the dependency pin
recorded in `DESIGN.md` (run 39533322567).

`db:smoke` drives the same write functions the server actions call — approving
action items, moving a ticket, rejecting one, commenting, changing a setting — and reads the
results back through the tenant-scoped queries. It covers key sequencing, idempotent
approval, reminder scheduling, audit events, and a northwind session failing to move a
globex ticket. (The mutations live in `src/server/writes.ts` rather than inside the actions,
precisely so this stays runnable: an action needs a request scope for `cookies()` and
`revalidatePath()`, a script does not have one.)

`db:auth` builds a throwaway database, then exercises the authentication core the way the sign-in action does:
argon2id hashing and verification, the timing decoy for unknown addresses, per-email and
per-network throttling windows, session creation and lookup by hash (never by token),
revocation scoped to the owning user, revoke-others, absolute and idle expiry, account
creation with a duplicate-email rejection, and creating a workspace whose owner is its only
member. The TOTP section pins the algorithm against all six RFC 6238 test vectors and drives
the enrolment round-trip: pending secret → confirm → recovery codes hashed and single-use →
challenge lookup, expiry and cleanup → per-user throttle of second-factor failures.
Fifty-five checks, all passing.

`db:audio` builds a throwaway database and then covers the audio path end to end. It points the storage driver at a
scratch directory first, so it never touches the app's real audio. It checks the VTT, SRT and
plain-text parsers (including the `Speaker 1:` prefix that makes numbered captions usable), the
magic-byte sniffer against a real RIFF header, an MPEG frame sync, a Matroska header and an M4A
brand, and the refusal of a renamed text file, an empty file, a zip archive (never unpacked), an
oversized upload, a WAV whose header outruns the duration cap even when the client reports five
seconds, and titles or transcripts over their caps; the Deepgram response
mapping against a recorded-shape payload (utterances and word-level fallback, empty utterances
dropped, an empty response failing rather than becoming an empty transcript); the storage driver
round trip, a byte range, and a key that tries to escape the storage root; chunked assembly and
its refusal of a piece that arrives without its predecessors; the retention clock, the sweep
deleting an expired blob while leaving a future-dated one alone, and the delete-audio path; and
the cross-tenant attempts, where a globex scope cannot see a northwind asset or map its speakers.
Ninety-eight checks, all passing.

The retention job is a script rather than a hidden timer:

```bash
pnpm --filter @prepo/web db:retention
# deleted 0 recording(s) · 0.00 MB reclaimed · 0 row(s) had no bytes left · …
```

It reports what it reclaimed, what had already gone, what was abandoned, and how many unfinished
uploads it cleared, so a scheduler run leaves a log that can be read.

`db:followups` is the other scheduler entry point, and the only way a message is ever sent:

```bash
pnpm --filter @prepo/web db:followups -- --at 2026-11-02T09:00:00Z
# considered 30 due message(s) · 12 sent · 18 failed · 0 deferred for quiet hours ·
# 0 cancelled · 12 notification(s) written · 6 digest row(s) placed
```

`db:followup-smoke` is the test for it — ninety-two checks. The ladder, the quiet-hours clock, the
digest placement and the message wording are pure functions and are asserted directly, including
the awkward cases: a rung that fires exactly on the boundary, an unassigned ticket, an invalid
timezone, a window that wraps midnight, a digest slot that has already passed today, and a due date
that moved behind the app's back. The engine is then run against the seeded workspace at a fixed
moment (Monday 19 October 2026, 10:00 UTC) and the outcomes are read back: the in-app half
delivered, the email half failed **with the reason**, the deferred message still queued and saying
why, the second pass finding nothing to do, the digest placed once and only once, and — with no
email key anywhere — nothing marked `sent` that was not. It finishes by cancelling a real ladder
through completion, a snooze and a stop-chasing, and by checking that a globex action cannot touch a
northwind row. It seeds a throwaway database for the run, so the demo one is untouched.

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
│     ├─ src/app/api/          # upload, chunk, transcript, audio stream, retry, delete, speakers, linear webhook
│     ├─ src/lib/              # cn() and the shared date/initial formatters
│     ├─ src/server/           # context (workspace + viewer), queries, actions, writes
│     ├─ src/server/audio/     # storage driver, validation, parsers, provider, ingest, retention
│     ├─ src/server/linear/    # crypto, mapping, GraphQL client + fixture, queue, webhook, sync
│     ├─ src/server/ai/        # extraction provider (OpenRouter), prompt, schema, grounding, run
│     ├─ src/server/auth/      # passwords, TOTP, challenges, sessions, throttle, identity audit, DAL
│     ├─ src/server/db/        # Drizzle schema, client, migrations, seed, verify, repo
│     ├─ src/server/pwa/       # the installable-app check that runs against a served build
│     ├─ public/sw.js          # the service worker: the fetch policy, in one file
│     ├─ public/offline.html   # the offline page, self-contained so it renders with nothing cached
│     ├─ public/icons/         # the manifest icons
│     └─ drizzle/              # generated migrations + hand-written RLS/policy SQL
├─ packages/
│  ├─ shared/                  # Zod schemas, constants, sample meeting data
│  └─ config/                  # shared tsconfig bases
├─ docker-compose.yml          # optional Postgres 17 for the DATABASE_URL path
└─ PREPO.md                    # the specification
```

## Design system

The direction, the three dials it is held to (ENERGY 2 / RHYTHM 2 / MOTION 1), the reason
behind each visual decision, and everything this pass deliberately left undone are in
[`DESIGN.md`](DESIGN.md). That file is the thing to read before changing a colour, a radius
or a typeface.

Tokens live in `apps/web/src/app/globals.css` as CSS variables, exposed to Tailwind v4
through `@theme inline`. Light is the default; `.dark` overrides, set by an inline script
that reads `prefers-color-scheme` and a stored preference (no flash).

- **Accent:** Prepo Coral `#FF6B6B` (dark `#FF7A7A`), with `--accent-fg` near-black text
  and a named `--accent-hover`. One accent fill per screen.
- **Neutrals:** one Zinc family, driven by `--bg`, `--surface`, `--border`, `--text`.
- **Semantics:** `--danger` and `--success`, deliberately not the accent colour.
- **Ink:** `#0B0B0C` for the wordmark bar and footer lockup.
- **Radius:** a three step scale (`--radius-1` inner, `--radius-2` controls, `--radius-3`
  surfaces) instead of one value on everything.
- **Elevation:** one shadow (`--shadow-1`) for a surface that really floats; cards are
  separated by a hairline.
- **Type:** Geist Sans / Geist Mono via `next/font`, self-hosted through the `geist` package.
  Mono is for identifiers (ticket keys, timestamps), never for numbers read as values.
- **Icons:** Phosphor only (SSR entry in server components, main entry in client components).

## Sample data

`packages/shared/src/sample.ts` holds a realistic seeded meeting ("Q4 Launch — Weekly
Sync") with a speaker-labelled transcript, seven action items (including ones
flagged for a missing owner or deadline), existing tickets, and a small roster. `db:seed`
loads this into Postgres — the app reads the database, not the file — while the hero preview
and several landing sections render straight from it, so the marketing page and the seeded
workspace stay in step. The demo minutes are hand-written: there are no seeded `ai_runs`, because
no model produced them.

## Roadmap

Milestones follow section 12 of `PREPO.md`:

1. ✅ Foundation, design system, landing page
2. ✅ App shell on seeded data (sidebar, dashboard, meetings, board, tickets)
3. ✅ Database, tenant isolation and the durable core loop — schema, RLS, seed, the wired UI,
   and sign-in with per-device sessions, revocation, TOTP 2FA and recovery codes
4. ✅ Audio and transcription — recorder, uploads, transcript import, speaker mapping, private
   storage and streaming, prompt-free provider seam, retention and the sweep. The provider is
   unconfigured without a key, and extraction stays in milestone 7 where its model lives
5. ✅ Follow-up engine — the ladder, the job, quiet hours and the digest, cancellation on
   completion, the notification centre and the per-ticket controls. Email is wired, a key is
   configured, and the chaser has been run against the live API: three messages were accepted to the
   account's own address and eight refused `403` because the account has no verified sending domain.
   A refusal is recorded with Resend's own words rather than faked, and push is not queued because
   there is no subscription flow to queue it for
6. ✅ Linear two-way sync — personal API key encrypted at rest, team/project pick, editable mapping,
   a queue the request never waits on, a job and a Sync now button that call the same function,
   pull and signed webhook through one conflict rule, per-ticket link/status/retry, and disconnect
   that keeps both sides. Run against a real team: nine issues created, states written, and a change
   made in Linear pulled back. OAuth, comments, attachments and sub-issues are not part of it, and
   the page says so
7. ◐ Extraction, scores and evals — extraction (OpenRouter, grounded, budgeted, with the
   Suggest/Assist/Autopilot split), the clarity score and the necessity score are done, and Ask
   Prepo answers with cited passages (`db:ai-smoke` 56/56, one live call recorded). A
   recorded-output eval gate runs in CI (`db:eval`: item F1 0.800, owners 0.833, deadlines 0.833
   against 0.75 floors). It scores fixed model replies, not live-model quality; that eval is
   still absent
8. ✅ Desktop app (Tauri 2) — the window, tray, global shortcut, `prepo://` links, notifications,
   single instance, window state and external-link handling. Compiled and tested (22 Rust tests,
   48 configuration checks). Not packaged: no installer, no signing key, no update endpoint, and no
   bridge from the page in the window into the shell
9. ✅ Installable web app — manifest, icons, a service worker and an install offer, all served and
   all checked (`pwa:check`, 55 checks). The worker caches no rendered page, so offline reads,
   queued edits and push are still absent, and every page that mentions them says so
10. Polish and security checklist
