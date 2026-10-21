import { BRAND } from "@prepo/shared";

/**
 * The origin this deployment answers on.
 *
 * The specification said "launch on a free `*.vercel.app` URL", and this file used to
 * hardcode `https://prepo.vercel.app`. That URL is **not this project**: it answers 200 with
 * somebody else's app. Hardcoding it meant the sitemap advertised a stranger's host, and
 * every absolute Open Graph URL pointed there too, so there is nothing to keep.
 *
 * Hosted deployments set `APP_URL` (the same variable the Linear backlink and the webhook
 * address use) and metadata, the sitemap and robots.txt all follow it. Without it the honest
 * origin is the one development actually runs on: `http://localhost:3000`. A value that is
 * not http(s) or that carries credentials is refused loudly and falls back, rather than
 * being put into a canonical URL.
 *
 * The sitemap and robots routes read this per request (`force-dynamic`) because a Docker
 * build does not inherit service variables; the first Railway deploy proved that by baking
 * localhost into a static sitemap.
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
