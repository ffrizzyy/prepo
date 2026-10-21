import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework; it is not a security boundary, but it is
  // free to remove and securityheaders.com flags it.
  poweredByHeader: false,
  transpilePackages: ["@prepo/shared"],
  // The deployment image runs `.next/standalone`. The tracing root is the
  // workspace, not apps/web, so `@prepo/shared` (a transpiled workspace
  // package) is copied into the standalone node_modules tree.
  output: "standalone",
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  // PGlite ships WASM and worker assets, and pg opens raw sockets. Both must be
  // required at runtime rather than bundled by Turbopack.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    // The security headers. The CSP is the Next.js guide's own config-file
    // pattern for apps that are not all dynamically rendered: this one has
    // static marketing and legal pages, and a nonce policy renders those
    // unhydratable, so script-src keeps the inline allowance and the honest
    // restriction is what the origin inventory allows (SKM: no web fonts,
    // no cross-origin scripts, no analytics, no images beyond the app's own
    // icons). 'strict-dynamic' with a nonce is the upgrade once every page
    // decides whether it renders for a request.
    const isDev = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "font-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        // Every route, documents and API answers alike: a header this app
        // never needs to vary per route goes here once and holds everywhere.
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Legacy clickjacking answer for browsers without frame-ancestors.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // The recorder is the app's own microphone use, mic-only; screen
            // capture is in the specification and is not here, so it is
            // refused until it exists.
            key: "Permissions-Policy",
            value:
              "camera=(), display-capture=(), geolocation=(), microphone=(self), payment=(), usb=()",
          },
          // No third-party content shares a window with the app, so popups
          // from other origins can never reach a session.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // Every subresource is same-origin (the CSP allows nothing else), so
          // requiring CORP costs nothing and clears ZAP's COEP warning.
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          // HSTS. Browsers ignore it over HTTP, so a local production build is
          // unaffected; a hosted HTTPS origin gets it. No `preload`: a platform
          // subdomain is not eligible for the preload list, and claiming
          // otherwise would be a lie in a header.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        // The service worker is the one file whose staleness lasts: a cached
        // worker keeps applying a cached policy, and the browser would not learn
        // otherwise. The client asks for no intermediary cache either, but that
        // is a request, not a guarantee.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
      {
        // The icons change only when the mark does, and they are asked for by
        // the manifest on every install. A week is long enough to be worth it
        // and short enough that a new mark arrives without a rename.
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
