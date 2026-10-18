import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@prepo/shared"],
  // PGlite ships WASM and worker assets, and pg opens raw sockets. Both must be
  // required at runtime rather than bundled by Turbopack.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    return [
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
