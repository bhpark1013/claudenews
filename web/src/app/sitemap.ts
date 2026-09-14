import type { MetadataRoute } from "next";
import { SITE_URL, LOCALE_PATHS } from "@/lib/site";

// The landing page in both languages. Each entry declares the other as its
// alternate so the pair is not read as duplicate content. Item pages are
// appended here when the public reader lands.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    en: `${SITE_URL}${LOCALE_PATHS.en}`,
    ko: `${SITE_URL}${LOCALE_PATHS.ko}`,
  };
  const lastModified = new Date();

  return (Object.keys(LOCALE_PATHS) as (keyof typeof LOCALE_PATHS)[]).map((l) => ({
    url: `${SITE_URL}${LOCALE_PATHS[l]}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: l === "en" ? 1 : 0.9,
    alternates: { languages },
  }));
}
