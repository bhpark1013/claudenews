import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// One entry today because the landing page is the only indexable route. When
// the public reader lands, its item pages are appended here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
