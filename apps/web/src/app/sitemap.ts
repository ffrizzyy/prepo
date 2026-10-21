import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Read APP_URL when the request arrives, not when the image is built. A Docker build does
// not inherit the host's runtime variables, so a static sitemap baked in localhost on the
// first Railway deploy even though APP_URL was set on the service.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // The origin comes from APP_URL (see lib/site-url.ts), with a documented localhost
  // fallback for development only.
  const base = siteUrl();
  // Workspace routes and /demo are deliberately absent: the first require
  // membership, and the second is disallowed in robots.txt because it signs the
  // visitor into a shared account.
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/download`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
