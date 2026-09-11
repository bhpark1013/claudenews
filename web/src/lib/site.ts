/**
 * Canonical origin for the public site.
 *
 * Kept in one place and driven by env so moving off the generated Vercel
 * hostname onto a real domain is a single environment-variable change rather
 * than a search-and-replace across metadata, robots and the sitemap.
 *
 * Order: an explicit override, then the production deployment Vercel tells us
 * about, then the current deployment. The final literal only applies to a
 * local build with no Vercel env at all.
 */
const fromVercel = (host?: string) => (host ? `https://${host}` : undefined);

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  fromVercel(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  fromVercel(process.env.VERCEL_URL) ??
  "https://web-olive-three-47.vercel.app";

export const SITE_NAME = "claudenews";

export const SITE_TAGLINE = "Dev news, while AI thinks.";

export const SITE_DESCRIPTION =
  "A Claude Code plugin that puts Hacker News, GitHub Trending and per-language dev feeds in your status line while the agent works — auto-translated, with short summaries. Free and MIT licensed.";
