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

## What this pass did not do

Recorded rather than left implied, because a design document that only lists wins
is not evidence:

- **Em dashes in pre-existing copy.** The rule is zero em dashes in text the
  agent writes. Copy written during this pass has none, and the strings touched
  in the components below were rewritten. The marketing and legal pages, the
  integration page and several app strings still contain them from earlier
  milestones. This is a known open item, not a decision to keep them.
- **Repeated hex colours outside the app primitives.** `#B91C1C` / `#15803D` and
  their dark twins still appear literally in the marketing components and in
  `board.tsx`, `tickets-table.tsx`, `ticket-detail.tsx`, `meetings-table.tsx`,
  `extract-button.tsx`, the follow-ups page, the integrations page and the
  insights page. They render correctly; they should move to `text-danger` and
  `text-success`.
- **Literal `rounded-[10px]` on inputs.** It is the same 10px as `--radius-2`, so
  it is visually consistent, but it is not tokenised, so a change to the scale
  would miss it.
- **`rounded-2xl` on the marketing cards and the desktop shell modals.** The
  radius scale is applied to the app primitives; the marketing components and a
  few modals still carry the old value.
- **A browser click-through.** No browser automation exists in this environment,
  so interactive states were verified by reading the components rather than by
  clicking them. Recorded as a gap in the check report, not as a pass.

## Assets

No new visual asset was generated in this pass. The wordmark, the app icon and
the desktop mark are the product owner's own, generated from the same coral-on-ink
mark in milestone 9. Nothing here is a stock illustration, a generated avatar, or
a placeholder disguised as final (R-22, R-23).
