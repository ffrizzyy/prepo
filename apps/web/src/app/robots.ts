import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Runtime, for the same reason as sitemap.ts: the origin is a runtime variable, and a
// Docker build does not see the host's service variables.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/r/", "/demo"],
    },
    // APP_URL decides the origin (lib/site-url.ts).
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
