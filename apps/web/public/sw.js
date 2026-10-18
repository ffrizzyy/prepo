/*
 * Prepo's service worker.
 *
 * It does three things, and deliberately not a fourth:
 *
 *   1. It exists, which is one of the things a browser requires before it will
 *      offer to install a site. Without a worker with a fetch handler there is no
 *      install prompt at all, whatever the manifest says.
 *   2. It answers a failed navigation with an offline page instead of the
 *      browser's error page, so being offline looks like something a person did.
 *   3. It caches the build's own hashed assets, so a second visit is fast.
 *
 * What it does NOT do is keep your data offline. Prepo has no offline data
 * layer: tickets, meetings and transcripts live in the workspace database and are
 * rendered per request. Caching authenticated HTML here would mean one person's
 * tickets sitting in a browser cache the next person at that machine reads, so
 * **no HTML response is ever stored** — only public, versioned assets. The
 * offline page says as much, rather than implying your board is available.
 *
 * The policy, in one table:
 *
 *   navigation (HTML)        network first, never stored, offline page on failure
 *   /_next/static/*          cache first (the filenames contain a content hash)
 *   /icons/*, /manifest.*    cache first
 *   POST/PUT/PATCH/DELETE    untouched
 *   another origin           untouched
 *   Range requests           untouched (audio is streamed in pieces)
 *   everything else          untouched: /api, server actions, RSC payloads
 *
 * `pwa:check` reads this file and asserts those rules, because a worker cannot
 * be run in a terminal.
 */

const VERSION = "prepo-sw-1";
const CACHE = `${VERSION}-public`;

/* The entire precache list: public bytes, no user data, nothing fetched with a
 * session attached. Each is added on its own so one 404 cannot fail the install. */
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

/* Cache-first, and only these. Everything matched here is either content-hashed
 * by the build or versioned by us. */
const CACHE_FIRST = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /^\/manifest\.webmanifest$/,
  /^\/offline\.html$/,
];

/* An upper bound so a long-lived install cannot grow a cache without limit.
 * Eviction drops the entries inserted first, which for hashed build assets is
 * close enough: a new build re-inserts whatever it actually needs. */
const MAX_ENTRIES = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {
            /* A missing entry is not worth failing an install over; the fetch
             * handler still answers with the network. */
          }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  if (CACHE_FIRST.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(cached(request));
  }
});

async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    const offline = await cache.match("/offline.html");
    if (offline) return offline;
    return new Response("Prepo needs a connection.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function cached(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok && response.type === "basic" && !response.headers.has("set-cookie")) {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((key) => cache.delete(key)));
}
