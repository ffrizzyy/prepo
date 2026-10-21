# Prepo: design direction

This file is the design direction the UI is built against. It exists because a
filter can remove what is wrong but cannot decide what is right, and because a
visual decision with no writable reason is a decision that has not been made
(the anti-slop keystone rule, R-31).

It was written after the fact for a codebase that already had a design system in
`globals.css`, and it records both what that system already was and what this
pass changed.

## Design Read

> Reading this as: an authenticated meeting-to-ticket tool plus its marketing
> site, for engineering leads and product managers, in a calm, editorial,
> ink-and-coral visual language, dial ENERGY 2 / RHYTHM 2 / MOTION 1.

Why those dials, in one line each:

- **ENERGY 2.** The product's whole promise is that it chases work on your
  behalf, so the interface should read as decisive: one accent, one primary
  action per screen, no shouting. It is a tool someone opens every morning, not
  an agency site.
- **RHYTHM 2.** The marketing page varies its composition (split hero, three
  numbered steps, feature cells at three different sizes, a before/after pair, an
  FAQ), and the app is a consistent shell with a few deliberate breaks (a focal
  summary strip, one wide column beside a narrow one). Consistent with breaks,
  not uniform, not asymmetric for its own sake.
- **MOTION 1.** This is a surface for reading text and triaging tickets. Motion
  is hover, focus and press feedback only. Nothing scrolls into view, nothing
  parallaxes, and `prefers-reduced-motion` removes even the transitions.

## Identity

- **Ink `#0B0B0C`**: the wordmark bar, the footer lockup and the desktop icon.
  A near-black that is warmer than pure black, so it sits under the coral without
  vibrating.
- **Prepo Coral `#FF6B6B`** (dark `#FF7A7A`) with `--accent-fg` near-black text on
  it: the single accent. On a coral button the text is ink, not white, because
  white on coral fails contrast and reads as a warning.
- **Neutrals** are one Zinc family (`--bg`, `--surface`, `--surface-2`,
  `--border`, `--text`, `--text-muted`, `--text-subtle`), so a surface is a step
  in one ramp rather than a new colour.
- **Two semantic colours** exist and are not the accent: `--danger` `#B91C1C`
  (dark `#F87171`) and `--success` `#15803D` (dark `#4ADE80`). An overdue ticket
  must not look like the thing the accent points at, so red is a word, not a hex
  repeated in a dozen components.
- **Identity motif**: the coral accent appears at most once per screen as a fill
  (the primary action), and elsewhere only as a 4 to 6 px status dot, a small
  label, or the one link that moves you onward.

## Typography

- **Geist Sans** for everything read as language, **Geist Mono** for identifiers
  only: ticket keys (`PRE-143`), meeting ids, timestamps, log lines.
- **Numbers are sans with `tabular-nums`, not mono.** A currency-style monospace
  score reads as a terminal; tabular numerals give the same column alignment in
  the product's own voice. This changed in the taste pass: clarity and necessity
  scores, dashboard counts and meeting scores all moved off mono.
- **No uppercase labels with wide letter-spacing.** The `Eyebrow` component used
  to be 12px mono, uppercase, `tracking-[0.18em]`, in coral. It is now a quiet
  sentence-case line, and it is used only where it carries a fact the headline
  does not (the class of document a legal page is), never to restate the headline
  (R-06, R-09).

## Space, radius, elevation

- **Radius scale, three steps** (`--radius-1` 6px, `--radius-2` 10px,
  `--radius-3` 14px): 1 for inner things (priority chips, small inputs), 2 for
  controls (buttons, selects), 3 for surfaces (cards, panels, notices). Before
  this, every card was `rounded-2xl`, every button `rounded-[10px]` and every
  badge a pill, which flattens the hierarchy the radius is supposed to express
  (R-11).
- **One elevation** (`--shadow-1`), for a surface that genuinely floats above the
  page: a menu, a modal. Cards are separated by a hairline border and a
  background step, not by shadow, so nothing in the app looks like it is hovering
  (R-12).
- **Spacing is structural.** The summary strip and card padding are the same
  rhythm on every page, so an empty state and a full one have the same shape.

## What the taste pass changed

| Change | Reason |
| --- | --- |
| Removed the coral drop shadow from every primary button | A coral button that also glows competes with the one focal point on the screen; glow on every primary button is the most common generated-UI tell (R-13) |
| `hover:brightness-[1.05]` replaced with `hover:bg-accent-hover` | A brightness filter is not a designed hover state; a named hover colour is themeable and predictable |
| Three equal stat cards replaced with one summary strip | The screen's job is "what is late", so the overdue count is the largest number and the other counts defer to it; three identical tiles make the reader rank them (R-14, C-3) |
| Arrows removed from card action links | Arrows on every link are decoration; the label already says where it goes (R-08) |
| A bare dash placeholder for an unscored meeting replaced with "Not scored" | A dash is a glyph pretending to be a value; the honest placeholder says what is missing (R-38) |
| Semantic `--danger` / `--success` tokens replace repeated hexes | Two literals repeated in a dozen components is how a palette drifts (R-29) |
| Touch targets: `min-h-11` under `pointer-coarse` | This is a desktop tool, so controls stay dense for a mouse, and grow to the 44px minimum only where a finger is the pointer (R-03) |
| `prefers-reduced-motion` now removes transitions, not just smooth scroll | The declared MOTION dial is 1, and a person who has asked the system for less motion should get none of it (C-4) |
| The necessity meter gained an `invert` tone, and the meeting page passes it | The hint said "higher means the meeting likely repeated earlier ones" while the tone painted a 90 as a success; two signals that disagree are worse than either one alone. Necessity is the one number in the app where up is bad, and the colour now agrees with the words |
| Ask Prepo is a box and a source list, not a chat | It is retrieval with a model behind it, so it says that in its shape: one box, one answer, one list of passages with their speakers. A bubble and a typing indicator would dress it as something that listens, and would put nothing where the checking happens |
| Its source list reuses the review queue's evidence shape | The transcript quote, the speaker and the meeting link are the same elements a proposed action item shows, so "check this answer" requires reading the same kind of paragraph the reader already learned to check |
| Every em dash in code copy was rewritten with the punctuation the sentence actually meant | 192 instance dashes became commas, colons or periods; the sweep covers `apps/web/src`, `packages/shared`, and the desktop offline page, so the codebase holds zero em dashes in text the agent writes |
| The repeated `#B91C1C` / `#15803D` hexes and their dark twins moved to the tokens | Ten red and twelve green literals across the app tables, the ticket pages, the marketing components and the insights chart now read `text-danger`, `text-success`, `bg-danger/10` and friends; the dark twins disappear because the token already switches |
| `rounded-2xl` became `rounded-3`, `rounded-[10px]` became `rounded-2`, `rounded-[8px]` became `rounded-1` | Every radius in the codebase now sits on the scale, so a future change to the scale reaches the marketing cards, the modals, the inputs and the inner drop-zone button as well; `rounded-[10px]` is a no-op rewrite of the same 10px, the others tighten onto designed steps |
| The meetings table's score cell says "Not scored" and its numbers use tabular figures | The meter had already made that change; the table's own copy of it still rendered a bare dash and monospaced numbers, which is the same tell two components apart |
| `formatDate` renders "No date set" for a null date | A dash in a date cell is a glyph pretending to be a value, the exact placeholder this direction bans; the words say what is missing |
| The demo meeting titles lost their dashes ("Q4 Launch, Weekly Sync") | Titles are copy too, and the seeded constants and every lookup already travelled together in one commit |

## What this pass did not do

Recorded rather than left implied, because a design document that only lists wins
is not evidence:

- **A browser click-through.** No browser automation exists in this environment,
  so interactive states were verified by reading the components rather than by
  clicking them. Recorded as a gap in the check report, not as a pass.
- **The working `.pglite` was reseeded, and that is on the record.** Before the
  database-kind guard above existed, several check suites ran against the
  default directory, and their `seed()` truncated every table in it on
  19 October 2026. The casualties were the rows only a person can make (the
  Linear connection's encrypted personal key, their browser sessions) and of
  course any unseeded data; the demo dataset itself was rebuilt identically by
  the seeds, and the TOTP and audio fixtures were reinstalled from their
  scripts once the fixture installers stopped truncating. A personal Linear
  connection cannot be recreated except by the person who pasted the key. The
  honest consequences the app can still demonstrate afterwards are checked by
  the same suites.

## Polish: the first increment

| Change | Reason |
| --- | --- |
| The workspace segment loads behind an instant skeleton (`[workspace]/loading.tsx`) | Server pages each run Postgres queries, so a plain screen sits between navigation and content; the skeleton draws the surfaces the page is about to draw (a header, a summary strip, a card of rows) so the swap-in reads as progress, not as a layout change |
| The skeleton is grey and still | MOTION is dial 1 and the only motion it allows is hover and focus feedback; a pulsing skeleton is ambient motion, so the blocks are flat surface-2 shapes. The file says this in its own comment so nobody "fixes" it |
| `role="status"` and a "Loading" label on the container | The swap from skeleton to page is invisible to a screen reader unless the container announces itself; the label is the one word that is true |
| The spec's pre-launch checklist is mapped item by item in `SECURITY.md` | A checkbox list that is mostly not yet checkable is more honest as a state table: what a suite covers, and what is waiting on a hosted origin rather than on code |
| The security response headers are one invariant policy applied to every route | A CSP that is a single constant string cannot diverge between a cached static page and the server's own answer, which is what makes a config-file policy honest for the marketing and legal pages too; the allowances it grants are read directly out of an origin inventory (no web fonts, no cross-origin scripts, no analytics, no third-party images, no iframes), and `Permissions-Policy` grants exactly what the recorder uses: this app's own microphone |
| `Content-Security-Policy` keeps the inline allowance only because the marketing pages are static | The specification's strict CSP with nonces needs every page to render for a request (the Next.js guide's nonce section is explicit); the marketing and legal pages are static on purpose, so the nonce upgrade is recorded as a named next step rather than as a claim of strictness this build does not have |

What this increment did not do, and is not claimed to have done: an axe pass, a
keyboard-only walkthrough, a Lighthouse budget, a ZAP scan, the strict-dynamic
CSP upgrade, and anything browser-enforced (the click-through gap above covers
why the headers were verified over HTTP, not in a DOM).

## The security suites: databases that cannot bleed, and the injection matrix

Two things changed about how truth is asserted, both discovered by pressing the
suites this pass:

- **Check scripts can no longer reach the working database.** The database kind
  is now said at each script's call site (`runCli(name, fn, "live" | "fresh")`).
  The operator jobs stay `live`; every check suite is `fresh`: a generated
  throwaway `PGLITE_DIR` created before any access and deleted after the run,
  with the file handle closed first so a Windows rm can actually delete it. Two
  of the older suites each had their own copy of this pattern; the rest trusted
  the default and *reseeding the workspace was the default*, which is exactly
  what a suite's seed does: truncate every table. That is how a working
  `.pglite` loses its connections and fixtures, and it is now impossible to do
  by accident rather than merely warned about. A consequence worth its own line:
  the fixture installers (`db:totp-fixture`, `db:audio-fixture`) stopped
  truncating too, seeding only when the database is empty and dropping their own
  leftovers instead, so installing one no longer deletes the other.
- **The injection suite caught a real bug in the schema gate.** The
  documentation's promise was "if `title` is a number, the run fails and nothing
  is imported", but `actionItems: z.array(schema).catch([])` swallowed an
  element-level failure and turned it into `[]`, so a structural break could
  arrive as a quietly successful zero-item run (minutes written, run recorded,
  nothing refused). The catch is off the array now: element shapes are
  structural, the run is refused, and the suite asserts the refusal. The devlog
  lesson stands: the `catch` that makes a model's preference degrade gracefully
  (priority, confidence) is a different instrument from the one that should make
  its structure fail loudly, and gluing them together made the gate weaker than
  its own description.

The `db:idor-smoke` suite drives the *built production server* over HTTP with
real sessions and real bytes: 24 checks over audio streaming (401 anonymous,
byte-identical 404 for "foreign" and "unknown" so a probe learns nothing, 200
member, 206 seek, 416) and the six form routes (a foreign workspace told 404
before its body ids are honoured, a refused delete followed by the stream still
playing). One process at a time owns a PGlite directory, so the suite closes its
own handle before the server opens the same one. What it does not reach - page
routes rendered by server components, anything browser-enforced - is said in
`SECURITY.md`'s mapping, which carries the honest remainder.

## The push that made the guards ambient: CI, CodeQL, and the restore drill

- **CI is the battery plus the hygiene gate, and it was green on the first
  push.** `.github/workflows/ci.yml` has two jobs: one runs typecheck, the ten
  fresh-database suites, the production build, `db:idor-smoke` against the built
  server, `pwa:check` against a server it starts itself, and the desktop shell's
  configuration verify; the other gates `pnpm audit --prod` and scans full git
  history with gitleaks. The Rust rules ride in a third job with the webkit
  system libraries a link needs, cached. A fresh checkout cannot run
  `db:restore-drill` (there is no working dataset to copy), so it stays out on
  purpose and the exclusion is written down rather than silent.
- **CodeQL earned its keep on the first run.** Its security-extended analysis
  raised six alerts on `main`. Three files changed: the staged-upload writer
  stops checking a path and then operating on it (one creating-and-truncating
  open for a first piece, one refusing-to-create open for a later piece, so an
  out-of-order piece throws without resurrecting the file it would have
  checked - and the `db:audio` suite caught the regression where the mkdir
  would have created the directory for a piece that never had a first one),
  and the transcript's tag strip became a scanner that consumes nested markup
  in one pass (the fix-point replace idiom the rule recommends was not
  recognized by the mechanism; a scanner uses no multi-character replacement,
  so there is nothing to mis-reason about). Two alerts were dismissed with
  reasons on the alert itself: a suite's fixture-string assertion, and the
  recording bytes streaming to the configured Deepgram endpoint, which is the
  pipeline's advertised purpose - both reasons cite the suites that carry the
  surrounding claims.
- **The gitleaks allowlist is two strings, each with a reason.** The full-history
  scan flagged the RFC 6238 test seed (base32 of "12345678901234567890", the
  seed `db:auth` pins its TOTP against) and the demo fixture account's password.
  Both are in `.gitleaks.toml`, and neither has credential value; the demo
  password is printed in the docs deliberately, and it grants nothing.
- **The restore drill ran, locally, where the data is.** `db:restore-drill`
  copies `.pglite` and `.storage` (twelve checks: schema, counts, mapping
  integrity, the tenant boundary against whatever workspaces the copy holds,
  and the recording bytes at their keys), points a scratch PGlite at nothing
  but the copy, and verifies the restore seed-free - because `db:verify`
  reseeds, which on a restored copy would truncate it and prove nothing about
  the restored data. What it does not claim: a schedule, an off-machine
  target, PITR.
- **The shell job caught a Linux-only break on its first day, which is what it
  is for.** CI compiled `tauri-plugin-deep-link 2.6.2` against `rust-ini`
  0.21.3 and stopped on a missing-field error in the plugin's
  `#[cfg(target_os = "linux")]` desktop-entry initializer - code this Windows
  machine never compiles, so the local `cargo test` could not have seen it.
  `rust-ini` 0.21.2 added two `ParseOption` fields that the plugin does not
  set; 0.21.2 was then yanked for its own parser regression (indented sections
  read as keys, issue #146), fixed in 0.21.3, which keeps the fields. The
  plugin's newest stable release is still 2.6.2 (the 3.0 line is a Tauri-3
  alpha, not usable here), so the committed lock pins `rust-ini` 0.21.1 - the
  last release before the fields existed, never yanked, and predating the
  regression too. CI runs `cargo test --locked` so resolution cannot silently
  walk away from the pin. `Cargo.toml` records the pin and its removal
  condition. (The first fix attempt pinned 0.21.2 on the wrong reading of the
  changelog; CI rejected it in three minutes, which is the job working. The
  0.21.1 pin went green on 21 October 2026, run 39533322567, all three jobs.)

## Assets

No new visual asset was generated in this pass. The wordmark, the app icon and
the desktop mark are the product owner's own, generated from the same coral-on-ink
mark in milestone 9. Nothing here is a stock illustration, a generated avatar, or
a placeholder disguised as final (R-22, R-23).
