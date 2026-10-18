import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // The origin comes from APP_URL (see lib/site-url.ts): this repository has not deployed,
  // and the `*.vercel.app` name the spec suggested belongs to an unrelated app.
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
