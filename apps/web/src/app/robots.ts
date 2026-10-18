import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/r/", "/demo"],
    },
    // APP_URL decides the origin (lib/site-url.ts); the spec's suggested
    // `*.vercel.app` name turned out to belong to an unrelated app.
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
