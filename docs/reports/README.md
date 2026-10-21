# Lighthouse and axe reports

Snapshot taken against the hosted Railway origin
`https://prepo-web-production.up.railway.app` on **21 October 2026**. The JSON
files beside this note are the raw reports; this page is the short version and
names the things a score hides.

The live build at scan time was the 14:09 local (07:09 UTC) deploy. Railway paused new
deployments immediately afterwards, so the navigation-label fix in this commit
is **not** on the origin yet; the reports below are a timestamped snapshot, not
a claim about the committed tree. Everything else in that build - the hydration
fix, the darker `text-subtle`, the demo link underline - is deployed.

## How they were run

- **Lighthouse 12.8.2**, Chrome 156 headless, `--throttling-method=provided`
  (no simulated slow network or CPU), categories performance, accessibility,
  best-practices and SEO.
- **axe-core 4.14.0**, Chrome 156 headless through Selenium, default rule set,
  after a 2-second load delay.

No authenticated workspace page is in this set. It covers `/`, `/security`,
`/privacy`, `/terms`, `/download`, `/sign-in` and `/demo`; the demo page signs
in only on submit, so it is the unauthenticated front door.

## Scores

| Page | Performance | Accessibility | Best practices | SEO |
|---|---:|---:|---:|---:|
| `/` | 100 | 96 | 96 | 100 |
| `/security` | 100 | 96 | 96 | 100 |
| `/privacy` | 100 | 96 | 96 | 100 |
| `/terms` | 100 | 96 | 96 | 100 |
| `/download` | 100 | 96 | 96 | 100 |
| `/sign-in` | 100 | 100 | 96 | 100 |
| `/demo` | 100 | 100 | 96 | 63 |

Performance 100 is **not** a claim about a slow phone on a slow network: the
throttling method was `provided`, so this is the origin on the machine that ran
the scan. A separate set with Lighthouse's default mobile emulation and
simulated slow 4G (150 ms RTT, 1.6 Mbps) plus 4x CPU slowdown is in
`lighthouse-mobile/`:

| Page | Performance | Accessibility | Best practices | SEO |
|---|---:|---:|---:|---:|
| `/` | 99 | 96 | 96 | 100 |
| `/security` | 98 | 96 | 96 | 100 |
| `/privacy` | 98 | 96 | 96 | 100 |
| `/terms` | 99 | 96 | 96 | 100 |
| `/download` | 99 | 96 | 96 | 100 |
| `/sign-in` | 99 | 100 | 96 | 100 |
| `/demo` | 99 | 100 | 96 | 63 |

LCP was 1.8-1.9 s on every page and TBT was 40-150 ms. These are the mobile
numbers to quote; the unthrottled table above is only a fast-machine baseline.

## What the non-perfect scores are

- **Accessibility 96 on the five public pages** is one rule, `color-contrast`,
  on one element: the oversized `Prepo` wordmark in the footer. It is
  `aria-hidden` and purely decorative, which WCAG 1.4.3 exempts from the
  contrast requirement, but the automated rule cannot know that. The same
  pages had a `landmark-unique` violation in this snapshot (two `<nav>`
  elements with no distinct names); `aria-label="Primary"` and
  `aria-label="Footer"` are in this commit, but the live instance is still the
  14:09 local build because Railway paused new deployments immediately afterwards.
  Re-run this set once that deploy lands. The contrast fix was not cosmetic:
  `text-subtle` was 4.47:1 against the light background, and darkening it to
  4.7:1 fixed real small text.
- **Best practices 96** is one `inspector-issues` entry: Chrome's Issues panel
  records a "Content security policy" issue with no sub-items. This snapshot is
  the pre-nonce build, whose CSP kept `script-src 'unsafe-inline'`. The committed
  build moves the policy to `src/proxy.ts` with a per-request nonce and
  `'strict-dynamic'`; `securityheaders.com` grades it **A+**, and a local browser
  pass found no CSP violations and no nonce-less inline script. The live Railway
  origin is still the older A build because deploys are paused.
- **Demo SEO 63** is deliberate: `robots.txt` disallows `/demo` because opening
  it signs a visitor into a shared account. Lighthouse still audits it when
  asked directly.
- The first scan also caught a real hydration mismatch (`React error #418`)
  on the landing page: the sample action items are formatted with
  `toLocaleDateString` on both server and client, and a `17:00Z` due date is
  the next day in UTC+7. The formatter now fixes the locale **and** the zone to
  UTC. Best practices moved from 93 to 96 after that change; the remaining
  entry is the CSP one above.

## axe detail

`axe` reported **zero violations on `/sign-in` and `/demo`**, and two on each of
the five public pages in this snapshot:

1. `color-contrast` on the decorative footer wordmark (explained above).
2. `landmark-unique` on the two navigation landmarks; fixed in this commit by
   `aria-label="Primary"` and `aria-label="Footer"`.

The raw axe JSON includes every pass and inapplicable rule, not only the
violations, so the absence of a violation for a rule can be checked rather than
assumed.

## Reproduce

```powershell
# Lighthouse (one page)
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npx lighthouse@12 "https://prepo-web-production.up.railway.app/" `
  --output=json --output-path=home.json `
  --only-categories=performance,accessibility,best-practices,seo `
  --chrome-flags="--headless --no-sandbox --disable-gpu" `
  --throttling-method=provided --quiet

# axe needs a ChromeDriver matching Chrome. The snapshot used
# browser-driver-manager's Chrome/ChromeDriver 156 with a short Selenium
# script that injects axe-core and calls axe.run().
```

The axe runner is not committed as a dependency: it was a throwaway Selenium
script in the temp directory. That is a gap for CI, not a claim that axe runs
there.

## Page-route IDOR checks

`db:idor-smoke` now drives the built server over HTTP for the audio route, the
six form routes and the rendered workspace pages. The page-route matrix is
repeatable in CI rather than a one-off browser pass:

- signed out, `/northwind` redirects to `/sign-in`;
- as the seeded Northwind member, all 11 Northwind pages render: the
  dashboard, `/ask`, `/board`, `/followups`, `/insights`, `/integrations`,
  `/meetings`, `/meetings/new`, `/notifications`, `/settings` and `/tickets`;
- the member's own meeting detail (`/northwind/meetings/<uuid>`) and ticket
  detail (`/northwind/tickets/PRE-118`) render;
- the same ids under `/globex`, and all 11 `/globex/...` pages, answer 404
  to the Northwind member with no "Globex" text in the body;
- a Globex member can render `/globex`, but a Northwind meeting id or ticket
  key asked for inside `/globex` renders the in-shell **empty state with HTTP
  200** (`Meeting not found` / `Ticket PRE-118 not found`), not the data. The
  workspace layout itself is 404 when the caller is not a member.

The 200 empty state is not an IDOR: a foreign id and an unknown id render the
same text, because the row-level security query returns nothing either way. It
does mean a page route does not mirror the API routes' 404 status, so the
assertion is "the meeting title and ticket title are absent", not "404".

The earlier one-off Selenium pass against the live origin remains as UI
evidence, **28/28**, in `idor-page-routes.json`. It is no longer the only
page-route coverage; the HTTP matrix is the part that runs on every push.

## Security headers: A+ on the build, A on the live origin

Two scans on 21 October 2026, forty-five seconds apart:

- **09:18:55 UTC, live Railway origin: A.** The only warning was
  `script-src 'unsafe-inline'`.
- **09:23:44 UTC, the committed build through an ephemeral Cloudflare quick
  tunnel: A+.** The policy was
  `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic';
  script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'
  blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self';
  worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self';
  form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`.
  The nonce is generated per request in `apps/web/src/proxy.ts`; the tunnel is
  gone, so there is no public URL to re-scan.

The live origin still runs the older build because Railway refuses new
deployments. The committed build makes every document dynamic, since a nonce
cannot be baked into static HTML. That removes CDN caching for the marketing
and legal pages, so the 98-99 mobile table above is a snapshot of the pre-nonce
build. A tunneled mobile run of the nonce build measured performance 90, LCP
1.9 s, TBT 370 ms; the difference is recorded, not rounded away.



