# Lighthouse and axe reports

Snapshot taken against the hosted Railway origin
`https://prepo-web-production.up.railway.app` on **21 October 2026**. The JSON
files beside this note are the raw reports; this page is the short version and
names the things a score hides.

The live build at scan time was the 14:09 UTC deploy. Railway paused new
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
the scan. A mobile-throttled run exists separately:

| Run | Performance | Accessibility | Best practices | SEO |
|---|---:|---:|---:|---:|
| `/`, mobile emulation, simulated slow 4G (150 ms RTT, 1.6 Mbps) and 4x CPU slowdown | 97 | 96 | 96 | 100 |

That run (`lighthouse-mobile/home.json`) measured FCP 1.1 s, LCP 1.8 s, TBT
170 ms and CLS 0. It is one page, not all seven; the other scores above remain
unthrottled.

## What the non-perfect scores are

- **Accessibility 96 on the five public pages** is one rule, `color-contrast`,
  on one element: the oversized `Prepo` wordmark in the footer. It is
  `aria-hidden` and purely decorative, which WCAG 1.4.3 exempts from the
  contrast requirement, but the automated rule cannot know that. The same
  pages had a `landmark-unique` violation in this snapshot (two `<nav>`
  elements with no distinct names); `aria-label="Primary"` and
  `aria-label="Footer"` are in this commit, but the live instance is still the
  14:09 build because Railway paused new deployments immediately afterwards.
  Re-run this set once that deploy lands. The contrast fix was not cosmetic:
  `text-subtle` was 4.47:1 against the light background, and darkening it to
  4.7:1 fixed real small text.
- **Best practices 96** is one `inspector-issues` entry: Chrome's Issues panel
  records a "Content security policy" issue with no sub-items. The CSP keeps
  `script-src 'unsafe-inline'`, which is also why `securityheaders.com` caps
  the grade at A. This is the known nonce/`strict-dynamic` gap, not a new one.
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

## Page-route IDOR browser pass

`db:idor-smoke` drives the built server over HTTP, which covers the audio
streaming route and the six form routes but not a rendered workspace page. A
separate one-off browser pass on 21 October 2026 covered the page routes:

- signed out, `/northwind` and `/northwind/board` both redirected to
  `/sign-in` (2 checks);
- signed in as the seeded demo user, all 11 Northwind pages rendered:
  the dashboard, `/ask`, `/board`, `/followups`, `/insights`, `/integrations`,
  `/meetings`, `/meetings/new`, `/notifications`, `/settings` and `/tickets`;
- the member's own meeting detail (`/northwind/meetings/<uuid>`) and ticket
  detail (`/northwind/tickets/PRE-133`) rendered, while the same ids under
  `/globex` returned the not-found page;
- all 11 `/globex/...` pages returned the same not-found page as an unknown
  workspace, with no "Globex" or `GLO-101` text in the body.

**28/28 passed.** The raw result, including the final URL and the first 180
characters of each body, is in `idor-page-routes.json`. This was a Selenium pass
against the live origin, not a CI job: the browser/driver dependency is not in
the repository, so it does not run on every push. That limitation is the reason
the checklist entry says a browser pass, not an automated suite.

