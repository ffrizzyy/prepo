# Live reports: Lighthouse, axe, headers, ZAP and IDOR

Snapshot taken against the hosted Railway origin
`https://prepo-web-production.up.railway.app` on **23 October 2026**. The live
deployment is `07dc9289-3156-4055-afdc-0e0763a9aedc` (commit `7ca5b3a`), which
finished building at **11:31:47 +07 (04:31:47 UTC)**. The JSON and text files in
the dated directories beside this note are the raw reports; this page is the
short version and names the things a score hides.

The earlier **21 October 2026** directories (`lighthouse/`, `lighthouse-mobile/`,
`axe/` and `idor-page-routes.json`) are kept as history. They describe the
pre-nonce build and are not the current live state. The dated
`*-live-2026-10-23` directories are the current evidence.

## How they were run

- **Lighthouse 12.8.2**, Chrome 156 headless. The unthrottled set uses
  `--throttling-method=provided` (no simulated slow network or CPU). The mobile
  set uses Lighthouse's default `formFactor=mobile` and `throttlingMethod=simulate`
  (150 ms RTT, 1.6 Mbps, 4x CPU slowdown). Categories: performance,
  accessibility, best-practices and SEO.
- **axe-core 4.14.0**, Chrome 156 headless through Selenium, default rule set,
  after a 2-second load delay.
- **OWASP ZAP baseline** via
  `ghcr.io/zaproxy/zaproxy:stable`, 2-minute spider, generated
  **04:52:16 UTC**.
- **securityheaders.com** scanned from a normal (non-headless) Chrome window:
  the site's Cloudflare challenge blocks headless Chrome from this host. The
  report text is saved verbatim.

No authenticated workspace page is in the Lighthouse or axe set. It covers
`/`, `/security`, `/privacy`, `/terms`, `/download`, `/sign-in` and `/demo`;
the demo page signs in only on submit, so it is the unauthenticated front door.
The page-route IDOR browser pass does sign in and reaches `/northwind`.

## Unthrottled scores

| Page | Performance | Accessibility | Best practices | SEO |
|---|---:|---:|---:|---:|
| `/` | 100 | 96 | 96 | 100 |
| `/security` | 100 | 96 | 96 | 100 |
| `/privacy` | 100 | 96 | 96 | 100 |
| `/terms` | 100 | 96 | 96 | 100 |
| `/download` | 100 | 96 | 96 | 100 |
| `/sign-in` | 100 | 100 | 96 | 100 |
| `/demo` | 100 | 100 | 96 | 63 |

LCP was **0.6-0.9 s**, TBT **0 ms** and CLS **0** on every page. This is the
origin on the machine that ran the scan, not a phone on a slow network. Raw
reports: `lighthouse-live-2026-10-23/`.

## Mobile-throttled scores

| Page | Performance | Accessibility | Best practices | SEO |
|---|---:|---:|---:|---:|
| `/` | 97 | 96 | 96 | 100 |
| `/security` | 99 | 96 | 96 | 100 |
| `/privacy` | 99 | 96 | 96 | 100 |
| `/terms` | 99 | 96 | 96 | 100 |
| `/download` | 99 | 96 | 96 | 100 |
| `/sign-in` | 99 | 100 | 96 | 100 |
| `/demo` | 99 | 100 | 96 | 63 |

LCP was **1.8-1.9 s**, TBT **40-170 ms** and CLS **0**. The home page's 97 is
the honest outlier: its TBT was 170 ms against 40-100 ms elsewhere, so its
performance score dropped by two points. These are the mobile numbers to quote;
the unthrottled table above is only a fast-machine baseline. Raw reports:
`lighthouse-mobile-live-2026-10-23/`.

## What the non-perfect scores are

- **Accessibility 96 on the five public pages** is one rule,
  `color-contrast`, on one element: the oversized `Prepo` wordmark in the
  footer. It is `aria-hidden="true"`, purely decorative, and WCAG 1.4.3 exempts
  pure decoration from the contrast requirement, but the automated rule cannot
  know that. The measured ratio is 1.25:1 against the footer background. This
  is a documented exemption, not a claim that the wordmark is readable; it is
  not meant to be. `/sign-in` and `/demo` have no contrast violation and score
  100.
- **Best practices 96** is one `inspector-issues` entry: Chrome's Issues panel
  records a "Content security policy" issue with **no sub-items**, so
  Lighthouse does not say which directive it dislikes. The live policy keeps
  `style-src 'self' 'unsafe-inline'` because React sets style attributes for
  progress bars and charts; the script half is a per-request nonce with
  `'strict-dynamic'` and `script-src-attr 'none'`, and a browser pass found no
  CSP violation. This report does not claim the Issues panel is empty. The
  earlier pre-nonce build also scored 96; its `script-src` allowed
  `'unsafe-inline'`, so the score alone does not distinguish the two builds.
- **Demo SEO 63** is deliberate: `robots.txt` disallows `/demo` because opening
  it signs a visitor into a shared account. Lighthouse still audits it when
  asked directly.
- The first 21 October scan caught a real hydration mismatch (`React error
  #418`) on the landing page: the sample action items were formatted with
  `toLocaleDateString` on both server and client, and a `17:00Z` due date is
  the next day in UTC+7. The formatter now fixes the locale **and** the zone to
  UTC. The current Lighthouse reports have an empty `errors-in-console` audit
  and no hydration mismatch.

## axe detail

`axe` reported **zero violations on `/sign-in` and `/demo`**, and exactly one on
each of the five public pages: `color-contrast` on `footer .select-none`, the
decorative footer wordmark described above. The previous `landmark-unique`
violation on the two navigation landmarks is gone in this build; the navs now
carry `aria-label="Primary"` and `aria-label="Footer"`.

Raw reports: `axe-live-2026-10-23/`. They include every pass and inapplicable
rule, not only the violations, so the absence of a violation can be checked
rather than assumed.

## Page-route IDOR checks

The one-off Selenium pass against the live origin is **28/28**, checked at
**04:41:12 UTC** on the 23 October build: `idor-page-routes-live-2026-10-23.json`.
It covers:

- signed out, `/northwind` redirects to `/sign-in`;
- as the seeded Northwind member, all 11 Northwind pages render: the dashboard,
  `/ask`, `/board`, `/followups`, `/insights`, `/integrations`, `/meetings`,
  `/meetings/new`, `/notifications`, `/settings` and `/tickets`;
- the member's own meeting detail and ticket detail render;
- the member's meeting id and ticket key asked for under `/globex`, and all 11
  `/globex/...` pages, are not found with no "Globex" text in the body;
- a foreign workspace's meeting id and ticket key inside a workspace the caller
  belongs to render the in-shell empty state with HTTP 200 and neither title,
  identical to an unknown id. That is not an IDOR: the row-level query returns
  nothing for both. It is the one asymmetry with the API routes, which answer
  404.

The repeatable HTTP matrix is `db:idor-smoke` (**58 checks**), run in CI against
the built production server; this browser pass is UI evidence on the live
deployment, not a substitute for it. There is no presigned-URL issuer to test:
the local storage driver has no presign method and no public path.

## Security headers: A+ on the live origin

`securityheaders.com` graded the live origin **A+** at
**23 Oct 2026 04:36:44 UTC**. The report is `securityheaders-live-2026-10-23.txt`.
It lists all six checked headers: Content-Security-Policy, Permissions-Policy,
Referrer-Policy, Strict-Transport-Security, X-Content-Type-Options and
X-Frame-Options.

The live policy is:

```text
default-src 'self';
script-src 'self' 'nonce-<per-request-value>' 'strict-dynamic';
script-src-attr 'none';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
media-src 'self' blob:;
connect-src 'self';
font-src 'self';
worker-src 'self';
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

The nonce is generated per request in `apps/web/src/proxy.ts`; the two
pre-hydration scripts in the root layout read it. `X-Powered-By` is absent, and
the response also carries HSTS (`max-age=31536000; includeSubDomains`, no
`preload`), `X-Frame-Options: DENY`, `nosniff`, a least-privilege
`Permissions-Policy`, same-origin COOP/CORP and
`Cross-Origin-Embedder-Policy: require-corp`.

This is the deployed build, not a tunnel. The trade is real: a nonce cannot be
baked into static HTML, so every document renders for the request and the
marketing/legal pages are no longer CDN-cached. The live mobile run measures
97-99 with LCP 1.8-1.9 s and TBT 40-170 ms; that is the current number, not the
old tunneled 90 (the tunnel added its own latency, so that number is superseded
rather than used as a performance claim). The loss of HTML caching is recorded
in `SECURITY.md`.

## OWASP ZAP baseline

Run against the live origin at **04:52:16 UTC** on 23 October 2026:
**0 failures, 9 warnings, 59 passes**. Reports:
`zap-live-2026-10-23/report.json`, `report.md` and `report.html`. There are no
High or Critical alerts.

The warnings were read from the JSON, not waved through:

- **CSP `style-src 'unsafe-inline'`** — expected and documented. React sets
  inline style attributes for progress bars and charts, which cannot be nonced;
  the script policy has no inline allowance.
- **Absence of anti-CSRF tokens** — a false positive for Next Server Actions.
  The session cookie is `SameSite=Lax`, and the action checks the Origin; the
  six form routes are driven by `db:idor-smoke`.
- **User-controllable HTML element attribute** — Next's `$ACTION_*` fields and
  `next`. `safeNext` rejects backslashes and control characters before
  redirecting.
- **Big redirect** — Next's `/api` and `/r` normalization returning a standard
  page, not data.
- **Content-Type missing on `/api/` and `/r/`** — the same 308 redirects, not
  rendered content.
- **Re-examine cache-control** — `manifest.webmanifest`, `robots.txt` and
  `sitemap.xml`; these are public and intentionally cacheable.
- **Non-storable content** — the dynamic documents now carry no-store headers
  because they are rendered per request. That is the nonce trade, not a leak.
- **Storable/cacheable** — hashed `/_next/static` assets and the font, which is
  correct.
- **Modern web application / authentication request** — framework and
  login-form informationals.

The committed ZAP files replace Next's opaque `$ACTION_KEY` values with
`<redacted>`. They are per-request form identifiers, not credentials, and the
findings and counts are otherwise unchanged.

ZAP crawls the unauthenticated surface only; it does not log in to the
workspace, so it is not a substitute for `db:idor-smoke`.

## Reproduce

```powershell
$base = "https://prepo-web-production.up.railway.app"

# Unthrottled Lighthouse (one page)
npx lighthouse@12 "$base/" `
  --output=json --output-path=home.json `
  --only-categories=performance,accessibility,best-practices,seo `
  --chrome-flags="--headless --no-sandbox --disable-gpu" `
  --throttling-method=provided --quiet

# Mobile-throttled Lighthouse: omit --throttling-method=provided
npx lighthouse@12 "$base/" `
  --output=json --output-path=home-mobile.json `
  --only-categories=performance,accessibility,best-practices,seo `
  --chrome-flags="--headless --no-sandbox --disable-gpu" --quiet

# ZAP baseline
$out = "$env:TEMP\prepo-zap"; New-Item -ItemType Directory -Force $out | Out-Null
docker run --rm -v "${out}:/zap/wrk/:rw" ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py -t $base -m 2 -J report.json -w report.md -r report.html

# securityheaders.com
# Open in a normal browser (Cloudflare blocks headless Chrome from this host):
# https://securityheaders.com/?q=https%3A%2F%2Fprepo-web-production.up.railway.app&followRedirects=on
```

The axe runner is not committed as a dependency: it was a throwaway Selenium
script in the temp directory. That is a gap for CI, not a claim that axe runs
there. The raw JSON is committed so the result can be inspected without the
runner.
