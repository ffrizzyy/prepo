import type { MetadataRoute } from "next";

const BASE_URL = "https://prepo.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Workspace routes and /demo are deliberately absent: the first require
  // membership, and the second is disallowed in robots.txt because it signs the
  // visitor into a shared account.
  return [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/download`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
