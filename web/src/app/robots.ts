import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// There was no robots.txt at all, so crawlers had no sitemap to follow and the
// API routes were as crawlable as the landing page. Those return JSON for the
// plugin, not pages worth indexing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
