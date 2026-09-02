// Shared registry of user-registered RSS/Atom feeds ("custom feeds").
//
// A feed registered by any user becomes a public source id (cf-<hash>) that
// every client can enable via /claudenews:list, and /api/news fetches it
// server-side with the same per-source cache as catalog feeds. One fetch per
// feed per cache window serves every install — which is also what keeps
// rate-limited hosts (Reddit: ~1 unauthenticated request / 30s / IP) happy.
//
// Stored in KV under "feeds:json" as a JSON array of CustomFeed. Without KV
// the registry is empty and registration is refused (nothing to persist).
import { createHash } from "crypto";
import { kv, kvConfigured } from "./kv";

export interface CustomFeed {
  id: string;        // "cf-" + 10 hex chars of sha1(normalized url)
  name: string;      // display name shown as the item's source
  url: string;       // feed URL (http/https, public host)
  lang: string;      // 2-letter content language, default "en"
  addedAt: number;   // epoch ms
}

export const FEED_ID_PREFIX = "cf-";
export const MAX_FEEDS = 300;
export const MAX_NAME_LEN = 60;
export const MAX_URL_LEN = 500;
const KV_KEY = "feeds:json";
const REGISTRY_TTL_MS = 60 * 1000;

let memo: { feeds: CustomFeed[]; at: number } | null = null;

export function normalizeFeedUrl(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > MAX_URL_LEN) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  // Public hosts only — the server fetches this URL, so refuse anything that
  // could reach internal networks (SSRF): localhost, literal IPs, .local.
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  )
    return null;
  u.hostname = host;
  u.hash = "";
  return u.toString();
}

export function feedIdFor(normalizedUrl: string): string {
  return (
    FEED_ID_PREFIX +
    createHash("sha1").update(normalizedUrl).digest("hex").slice(0, 10)
  );
}

export function isCustomFeedId(id: string): boolean {
  return id.startsWith(FEED_ID_PREFIX);
}

export function sanitizeName(raw: unknown, fallbackUrl: string): string {
  const s = String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
  if (s) return s;
  try {
    return new URL(fallbackUrl).hostname;
  } catch {
    return "feed";
  }
}

export function sanitizeLang(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(s) ? s : "en";
}

function isFeed(x: unknown): x is CustomFeed {
  if (!x || typeof x !== "object") return false;
  const f = x as Record<string, unknown>;
  return (
    typeof f.id === "string" &&
    typeof f.url === "string" &&
    typeof f.name === "string"
  );
}

export async function loadCustomFeeds(force = false): Promise<CustomFeed[]> {
  if (!force && memo && Date.now() - memo.at < REGISTRY_TTL_MS)
    return memo.feeds;
  let feeds: CustomFeed[] = [];
  const stored = await kv<string>(["GET", KV_KEY]);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) feeds = parsed.filter(isFeed);
    } catch {
      feeds = [];
    }
  }
  memo = { feeds, at: Date.now() };
  return feeds;
}

export async function saveCustomFeeds(feeds: CustomFeed[]): Promise<boolean> {
  if (!kvConfigured) return false;
  const ok = await kv<string>(["SET", KV_KEY, JSON.stringify(feeds)]);
  memo = { feeds, at: Date.now() };
  return ok !== null;
}

export async function findCustomFeed(id: string): Promise<CustomFeed | null> {
  const feeds = await loadCustomFeeds();
  return feeds.find((f) => f.id === id) ?? null;
}
