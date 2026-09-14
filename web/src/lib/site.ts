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

/** Per-locale metadata copy. Both routes render the same page, in two languages. */
export const SITE_COPY = {
  en: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  ko: {
    title: `${SITE_NAME} — AI가 생각하는 동안, 개발 뉴스.`,
    description:
      "Claude Code가 일하는 동안 Hacker News, GitHub Trending, 각 언어권 개발 피드를 상태 표시줄에 띄우는 플러그인. 자동 번역과 한 줄 요약까지. 무료, MIT 라이선스.",
  },
} as const;

/** hreflang pairs. `/` is English, `/ko` is Korean, and each points at the other. */
export const LOCALE_PATHS = { en: "/", ko: "/ko" } as const;

export const LANGUAGE_ALTERNATES = {
  en: LOCALE_PATHS.en,
  ko: LOCALE_PATHS.ko,
  "x-default": LOCALE_PATHS.en,
};
