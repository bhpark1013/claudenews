import { kv, kvConfigured, kvSet } from "./kv";
import type { NewsItem } from "./news-item";

/**
 * Daily snapshots of what the feed showed.
 *
 * /api/news is a live proxy: it fetches Hacker News and GitHub on request and
 * keeps a five-minute in-memory cache, so nothing is retained. An item on the
 * front page today is unreachable in two days, which means any URL built on it
 * would die — the worst outcome for a page meant to be indexed.
 *
 * Capturing costs almost nothing and a day not captured is gone for good, so
 * this runs now, ahead of the pages that will read it.
 */
export type DaySnapshot = {
  date: string; // YYYY-MM-DD, UTC
  capturedAt: number;
  items: NewsItem[];
};

const DAY_KEY = (date: string) => `news:day:${date}`;
const INDEX_KEY = "news:days";

/** Cap per day: enough for a digest, small enough to stay a cheap KV value. */
const MAX_ITEMS_PER_DAY = 120;

export const archiveEnabled = kvConfigured;

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function readDay(date: string): Promise<DaySnapshot | null> {
  const raw = await kv<string>(["GET", DAY_KEY(date)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DaySnapshot;
  } catch {
    return null;
  }
}

/** Newest first. */
export async function listDays(limit = 60): Promise<string[]> {
  const days = await kv<string[]>([
    "ZRANGE",
    INDEX_KEY,
    "0",
    String(Math.max(0, limit - 1)),
    "REV",
  ]);
  return days || [];
}

/**
 * Merge `items` into `date`'s snapshot, keyed by item id.
 *
 * Merging rather than overwriting means the capture can run more than once a
 * day and accumulate what each run happened to see, instead of the last run
 * deciding the whole day. Returns how many were newly added.
 */
export async function captureDay(
  date: string,
  items: NewsItem[]
): Promise<{ added: number; total: number }> {
  const existing = await readDay(date);
  const byId = new Map<string, NewsItem>();
  for (const it of existing?.items || []) if (it?.id) byId.set(it.id, it);

  let added = 0;
  for (const it of items) {
    if (!it?.id || byId.has(it.id)) continue;
    byId.set(it.id, it);
    added++;
  }

  const merged = [...byId.values()].slice(0, MAX_ITEMS_PER_DAY);
  const snapshot: DaySnapshot = {
    date,
    capturedAt: Date.now(),
    items: merged,
  };

  // kvSet, not kv(["SET", ...]): the snapshot is kilobytes and kv() puts every
  // argument in the URL path, where a value this size never arrives.
  const stored = await kvSet(DAY_KEY(date), JSON.stringify(snapshot));
  if (!stored) throw new Error("archive write failed");
  await kv(["ZADD", INDEX_KEY, String(Date.parse(date) / 1000), date]);
  return { added, total: merged.length };
}
