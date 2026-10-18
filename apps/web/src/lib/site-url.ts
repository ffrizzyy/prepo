import { BRAND } from "@prepo/shared";

/**
 * The origin this deployment answers on.
 *
 * The specification said "launch on a free `*.vercel.app` URL", and this file used to
 * hardcode `https://prepo.vercel.app`. That URL is **not this project**: it answers 200 with
 * somebody else's app. Hardcoding it meant the sitemap advertised a stranger's host, and
 * every absolute Open Graph URL pointed there too, so there is nothing to keep.
 *
 * Until a deployment exists, the honest origin is the one this code actually runs on:
 * `http://localhost:3000`. Set `APP_URL` (already the variable the Linear backlink and the
 * webhook address use) and metadata, the sitemap and robots.txt all follow it. A value that
 * is not http(s) or that carries credentials is refused loudly and falls back, rather than
 * being put into a canonical URL.
 */
export function siteUrl(): string {
  const configured = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (configured.length === 0) return "http://localhost:3000";

  try {
    const url = new URL(configured);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      throw new Error("not an http(s) origin without credentials");
    }
    return url.origin;
  } catch (error) {
    console.warn(
      `[prepo] APP_URL is not a usable origin (${configured}): ${BRAND.name} will use http://localhost:3000 instead`,
      error,
    );
    return "http://localhost:3000";
  }
}
