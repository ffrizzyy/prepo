import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@prepo/shared"],
  // PGlite ships WASM and worker assets, and pg opens raw sockets. Both must be
  // required at runtime rather than bundled by Turbopack.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
