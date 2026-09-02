// RSS 2.0 / Atom parsing + fetching shared by /api/news (catalog + custom
// feeds) and /api/feeds (registration probe). Regex-based, no deps.
import type { NewsItem } from "./news-item";

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// Minimal RSS 2.0 / Atom parser (regex, no deps). Used for PUBLIC catalog
// feeds (e.g. GeekNews) and for user-registered custom feeds (public URLs,
// validated at registration).
export interface RssOptions {
  browserUa?: boolean;   // Reddit & co. 403/429 non-browser UAs
  maxItems?: number;
  maxAgeDays?: number;   // drop dated entries older than this (pinned posts)
  withBody?: boolean;    // include feed_text (stripped body, capped)
  custom?: boolean;
}
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEED_BODY_MAX = 1500;

export function parseFeedXml(
  xml: string,
  sourceName: string,
  opts: RssOptions = {}
): NewsItem[] {
  const maxItems = opts.maxItems ?? 30;
  const blocks =
    xml.indexOf("<item") !== -1
      ? xml.split(/<item[\s>]/).slice(1)
      : xml.split(/<entry[\s>]/).slice(1);
  const pick = (b: string, tag: string) => {
    const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? decodeEntities(m[1]) : "";
  };
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    if (out.length >= maxItems) break;
    const title = pick(b, "title");
    let link = pick(b, "link");
    if (!link) {
      const hm = b.match(/<link[^>]*href=["']([^"']+)["']/i); // Atom
      link = hm ? hm[1] : "";
    }
    if (!title || !link || seen.has(link)) continue;
    const dateStr =
      pick(b, "pubDate") || pick(b, "published") || pick(b, "updated") || "";
    const parsed = Date.parse(dateStr);
    const ts = parsed || Date.now();
    if (
      opts.maxAgeDays &&
      parsed &&
      Date.now() - parsed > opts.maxAgeDays * 864e5
    )
      continue;
    seen.add(link);
    const item: NewsItem = {
      id: `rss-${sourceName}-${link}`,
      title,
      url: link,
      source: sourceName,
      timestamp: ts,
    };
    if (opts.withBody) {
      const body =
        pick(b, "content:encoded") ||
        pick(b, "content") ||
        pick(b, "description") ||
        pick(b, "summary");
      const text = body.replace(/\s+/g, " ").trim().slice(0, FEED_BODY_MAX);
      if (text) item.feed_text = text;
    }
    if (opts.custom) item.custom = true;
    out.push(item);
  }
  return out;
}

export interface FeedFetchResult {
  ok: boolean;       // HTTP fetch succeeded (2xx)
  status: number;    // HTTP status, 0 on network error/timeout
  items: NewsItem[];
}

// One fetch path for catalog feeds, custom feeds AND the registration probe.
// Uses Next's Data Cache (revalidate) so a feed fetched by /api/feeds at
// registration is served from cache to the /api/news call that follows —
// one origin request instead of two, which matters for hosts that
// rate-limit per IP (Reddit: ~1 unauthenticated request / 30s).
export async function fetchFeed(
  url: string,
  sourceName: string,
  opts: RssOptions = {}
): Promise<FeedFetchResult> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": opts.browserUa ? BROWSER_UA : "claudenews/1.0",
        Accept: "*/*",
      },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, status: res.status, items: [] };
    const xml = (await res.text()).slice(0, 1_000_000);
    return { ok: true, status: res.status, items: parseFeedXml(xml, sourceName, opts) };
  } catch {
    return { ok: false, status: 0, items: [] };
  }
}

export async function fetchRss(
  url: string,
  sourceName: string,
  opts: RssOptions = {}
): Promise<NewsItem[]> {
  return (await fetchFeed(url, sourceName, opts)).items;
}

// User-registered feeds: browser UA (Reddit), small per-feed cap so one feed
// can't flood the round-robin, 14-day age gate (hot-order feeds surface old
// pinned posts), and the feed body for summarization.
export const CUSTOM_FEED_OPTS: RssOptions = {
  browserUa: true,
  maxItems: 12,
  maxAgeDays: 14,
  withBody: true,
  custom: true,
};

