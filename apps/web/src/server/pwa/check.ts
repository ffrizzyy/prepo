import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { BRAND } from "@prepo/shared";
import { runCli } from "../db/run";

/**
 * The installable app (PREPO.md §3.1), checked against a running server:
 *   pnpm --filter @prepo/web build && pnpm --filter @prepo/web start
 *   pnpm --filter @prepo/web pwa:check
 *
 * A browser decides whether a site may be installed from the manifest, the icons,
 * the service worker and the link tags in the HTML. All four are observable over
 * HTTP, so this asks for them the way a browser would: it fetches the manifest,
 * reads each icon's actual PNG header to see whether it is the size it claims,
 * and checks the worker is served uncached with a scope that covers the app.
 *
 * Two things it cannot do, and says so rather than implying otherwise:
 *
 *   - It cannot run the worker. Whether a fetch policy behaves as written needs a
 *     browser; what is asserted here is the worker's own source, that nothing
 *     before the asset cache writes to it, so a navigation is never stored.
 *   - It cannot prove the install prompt appears. `beforeinstallprompt` is
 *     Chromium's decision, taken at runtime, on a secure origin with engagement.
 *
 * Set PREPO_CHECK_URL to check somewhere other than http://localhost:3000.
 */

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `, ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const base = (process.env.PREPO_CHECK_URL ?? "http://localhost:3000").replace(/\/$/, "");

function local(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** The width and height out of a PNG's IHDR chunk, or null if it is not a PNG. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((byte, i) => bytes[i] === byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The `PRECACHE` array as written in the worker, parsed as JSON. */
function precacheList(source: string): string[] | null {
  const match = /const PRECACHE = (\[[\s\S]*?\]);/.exec(source);
  const body = match?.[1];
  if (body === undefined) return null;
  try {
    // The source is JavaScript, so it is allowed a trailing comma that JSON is
    // not. Dropping it is the whole difference between the two notations here.
    const parsed: unknown = JSON.parse(body.replace(/,(\s*)\]$/, "$1]"));
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`Checking the installable app at ${base}\n`);

  /* ------------------------------------------------------------- the linker */

  const home = await fetch(`${base}/`).catch(() => null);
  check("the app answers at all", home?.ok === true, home ? String(home.status) : "no response");
  const html = home?.ok ? await home.text() : "";
  check(
    "the page tells the browser where the manifest is",
    /<link[^>]+rel="manifest"[^>]+href="[^"]*manifest\.webmanifest"/.test(html),
  );
  check(
    "the page carries the theme colour the browser chrome uses",
    /<meta[^>]+name="theme-color"/.test(html),
  );
  check(
    "the page links an icon and an apple-touch-icon",
    /rel="icon"/.test(html) && /rel="apple-touch-icon"/.test(html),
  );

  /* ------------------------------------------------------------ the manifest */

  const manifestResponse = await fetch(`${base}/manifest.webmanifest`).catch(() => null);
  check(
    "the manifest is served",
    manifestResponse?.ok === true,
    manifestResponse ? String(manifestResponse.status) : "no response",
  );
  const contentType = manifestResponse?.headers.get("content-type") ?? "";
  check(
    "the manifest is served as a manifest",
    /manifest\+json|application\/json/.test(contentType),
    contentType,
  );

  let manifest: Record<string, unknown> = {};
  let manifestIsJson = false;
  if (manifestResponse?.ok) {
    try {
      manifest = (await manifestResponse.json()) as Record<string, unknown>;
      manifestIsJson = true;
    } catch {
      manifestIsJson = false;
    }
  }
  check("the manifest is JSON", manifestIsJson);
  check("the manifest names the product", manifest.name === BRAND.name, String(manifest.name));
  check("the manifest has a short name for a home screen", typeof manifest.short_name === "string");
  check("the manifest opens the front door", manifest.start_url === "/", String(manifest.start_url));
  check(
    "the manifest is scoped to the whole app, so in-app links stay in the window",
    manifest.scope === "/",
    String(manifest.scope),
  );
  check(
    "the manifest asks for a standalone window",
    manifest.display === "standalone",
    String(manifest.display),
  );
  check(
    "the manifest sets a theme and background colour",
    typeof manifest.theme_color === "string" && typeof manifest.background_color === "string",
  );

  const icons = Array.isArray(manifest.icons)
    ? (manifest.icons as Array<Record<string, string | undefined>>)
    : [];
  const anyIcon = (sizes: string) =>
    icons.some((icon) => icon.sizes === sizes && icon.purpose !== "maskable");
  const maskable = icons.find((icon) => icon.purpose === "maskable");

  check("the manifest offers a 192px icon", anyIcon("192x192"));
  check("the manifest offers a 512px icon", anyIcon("512x512"));
  check("the manifest offers a maskable icon", Boolean(maskable), maskable?.sizes ?? "(none)");

  /* ---------------------------------- the icons themselves: bytes, not names */

  const iconBytes = new Map<string, Uint8Array>();

  for (const icon of icons) {
    const src = icon.src ?? "";
    const response = await fetch(`${base}${src}`).catch(() => null);
    check(`the icon at ${src} is served`, response?.ok === true, String(response?.status ?? "none"));
    if (!response?.ok) continue;

    const type = response.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    iconBytes.set(src, bytes);
    const size = pngSize(bytes);
    check(
      `${src} really is a PNG with the size the manifest claims`,
      Boolean(type.startsWith("image/png") && size),
      `content-type ${type}, header ${size ? `${size.width}x${size.height}` : "not a PNG"}`,
    );
    if (size && icon.sizes) {
      check(
        `${src} matches its declared size ${icon.sizes}`,
        `${size.width}x${size.height}` === icon.sizes,
        `${size.width}x${size.height}`,
      );
    }
  }

  // Whether the maskable icon's corners are opaque cannot be answered without
  // decoding the PNG (this does not), so it is verified by eye - what is checked
  // here is that it is a distinct rendering rather than the 512px icon relabelled,
  // which would be cropped with its transparent corners and look broken.
  const declared512 = icons.find((icon) => icon.sizes === "512x512" && icon.purpose !== "maskable")?.src;
  const maskableBytes = maskable?.src ? iconBytes.get(maskable.src) : undefined;
  const plainBytes = declared512 ? iconBytes.get(declared512) : undefined;
  check(
    "the maskable icon is its own rendering, not the plain icon relabelled",
    Boolean(maskableBytes && plainBytes) && maskableBytes!.length !== plainBytes!.length,
    `${maskableBytes?.length ?? 0} vs ${plainBytes?.length ?? 0} bytes`,
  );

  for (const path of ["/apple-icon.png", "/icon.png"]) {
    const response = await fetch(`${base}${path}`).catch(() => null);
    check(
      `${path} is served for a browser that asks for the installed icon`,
      response?.ok === true,
      String(response?.status ?? "none"),
    );
  }

  /* --------------------------------------------------------- the worker */

  const workerResponse = await fetch(`${base}/sw.js`).catch(() => null);
  check("the service worker is served", workerResponse?.ok === true, String(workerResponse?.status ?? "none"));
  const worker = workerResponse?.ok ? await workerResponse.text() : "";

  check(
    "the worker is served as JavaScript",
    /javascript/.test(workerResponse?.headers.get("content-type") ?? ""),
    workerResponse?.headers.get("content-type") ?? "",
  );

  // Compiled, never run: a worker with a syntax error is rejected by the browser
  // and takes installability with it, silently.
  let workerCompiles = false;
  let compileError = "";
  try {
    new Script(worker);
    workerCompiles = worker.length > 0;
  } catch (error) {
    compileError = error instanceof Error ? error.message : String(error);
  }
  check(
    "the served worker bytes are valid JavaScript that a browser will not reject",
    workerCompiles,
    compileError,
  );
  check(
    "the worker is not cached, so a change to its policy takes effect",
    /max-age=0/.test(workerResponse?.headers.get("cache-control") ?? ""),
    workerResponse?.headers.get("cache-control") ?? "",
  );
  check(
    "the worker is allowed to control the whole app",
    workerResponse?.headers.get("service-worker-allowed") === "/",
    workerResponse?.headers.get("service-worker-allowed") ?? "(absent)",
  );
  check(
    "the worker installs a fetch handler, without which no browser offers installation",
    /addEventListener\(\s*["']fetch["']/.test(worker),
  );
  check("the worker carries a cache version, so a new policy can discard the old", /const VERSION = "/.test(worker));
  check(
    "the worker takes over rather than waiting for every tab to close",
    worker.includes("skipWaiting") && worker.includes("clients.claim"),
  );

  /* The policy, read out of the source. This is the only way to hold a worker to
   * a rule without a browser, so the assertions are on structure, not on prose. */
  check(
    "the worker ignores anything that is not a GET, so no mutation is replayed",
    /request\.method !== "GET"/.test(worker),
  );
  check(
    "the worker ignores other origins",
    /url\.origin !== self\.location\.origin/.test(worker),
  );
  check(
    "the worker leaves ranged requests alone, because audio is streamed in pieces",
    /request\.headers\.has\("range"\)/.test(worker),
  );
  const beforeAssetCache = worker.split("async function cached(")[0] ?? worker;
  const strayWrite = /\.put\(/.exec(beforeAssetCache)?.[0];
  check(
    "nothing before the asset cache writes to a cache, so a navigation is never stored",
    strayWrite === undefined,
    strayWrite ? "found a write outside the asset cache" : "",
  );
  check(
    "the worker does not store a response that sets a cookie",
    /!response\.headers\.has\("set-cookie"\)/.test(worker),
  );
  check("the worker bounds how much it keeps", /MAX_ENTRIES/.test(worker));

  const precache = precacheList(worker);
  check("the precache list can be read as a list, so it can be reviewed", precache !== null);
  check(
    "every precached entry is public bytes, no workspace route, no API, no query",
    precache !== null &&
      precache.length > 0 &&
      precache.every((entry) =>
        /^\/offline\.html$|^\/manifest\.webmanifest$|^\/icons\/[a-z0-9-]+\.png$/.test(entry),
      ),
    precache === null ? "unreadable" : precache.join(", "),
  );

  /* ------------------------------------------------------- the site origin */

  // The spec suggested a free `*.vercel.app` name; `prepo.vercel.app` turned out to be an
  // unrelated app, so nothing may claim it. This is checked here because the manifest, the
  // sitemap and the installed app all describe the same site.
  const sitemapResponse = await fetch(`${base}/sitemap.xml`).catch(() => null);
  const sitemap = sitemapResponse?.ok ? await sitemapResponse.text() : "";
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
  check("the sitemap lists pages", locations.length > 0, `${locations.length} entries`);
  check(
    "no page claims somebody else's domain",
    !sitemap.includes("prepo.vercel.app") && locations.every((loc) => !loc.includes("prepo.vercel.app")),
  );
  check(
    "every sitemap entry is an absolute URL, so it is a site origin and not a guess",
    locations.every((loc) => /^https?:\/\//.test(loc)),
    locations[0] ?? "",
  );
  const robotsResponse = await fetch(`${base}/robots.txt`).catch(() => null);
  const robots = robotsResponse?.ok ? await robotsResponse.text() : "";
  check(
    "robots.txt points at this origin's sitemap, not a stranger's",
    /Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/i.test(robots) && !robots.includes("prepo.vercel.app"),
  );

  /* ------------------------------------------------------- the offline page */

  const offlineResponse = await fetch(`${base}/offline.html`).catch(() => null);
  check("the offline page is served", offlineResponse?.ok === true, String(offlineResponse?.status ?? "none"));
  const offline = offlineResponse?.ok ? await offlineResponse.text() : "";
  check(
    "the offline page can render with nothing else cached",
    offline.length > 0 && !offline.includes("/_next/") && !offline.includes("<script"),
  );
  check(
    "the offline page says there is no offline copy of the data",
    /no offline copy/i.test(offline),
  );

  /* --------------------------------------------- the client half, as source */

  const registrar = local("src/components/pwa/service-worker-registrar.tsx");
  check(
    "the app registers the worker itself, rather than relying on a script tag",
    registrar.includes('navigator.serviceWorker') && registrar.includes('"/sw.js"'),
  );
  check(
    "the worker is not registered in development, where it would cache the build",
    registrar.includes('process.env.NODE_ENV !== "production"'),
  );
  const layout = local("src/app/layout.tsx");
  check("the root layout renders the registrar", layout.includes("<ServiceWorkerRegistrar"));
  check(
    "the install offer is captured before hydration, so the button is not missed",
    layout.includes("beforeinstallprompt"),
  );

  console.log("");
  if (failures > 0) {
    console.log(`${failures} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log("all installable-app checks passed");
}

runCli("pwa/check.ts", main);
