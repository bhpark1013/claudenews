import { NextRequest } from "next/server";
import { CATALOG_BY_ID } from "@/lib/sources";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  lang?: string;
  score?: number;
  comments?: number;
  author?: string;
  timestamp: number;
}

// Per-source in-memory cache (lives for the function's warm duration).
// Keyed by source id so different ?sources= combinations share fetches.
const cache: Record<string, { items: NewsItem[]; at: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchHackerNews(): Promise<NewsItem[]> {
  try {
    const topRes = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
      { next: { revalidate: 300 } }
    );
    const ids: number[] = await topRes.json();
    const stories = await Promise.all(
      ids.slice(0, 50).map(async (id) => {
        const r = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          { next: { revalidate: 300 } }
        );
        return r.json();
      })
    );
    return stories
      .filter((s) => s && s.title && s.url)
      .map((s) => ({
        id: `hn-${s.id}`,
        title: s.title,
        url: `https://news.ycombinator.com/item?id=${s.id}`,
        source: "HackerNews",
        score: s.score,
        comments: s.descendants,
        author: s.by,
        timestamp: s.time * 1000,
      }));
  } catch {
    return [];
  }
}

async function fetchGitHubTrending(): Promise<NewsItem[]> {
  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const res = await fetch(
      `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=30`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 900 },
      }
    );
    const data = await res.json();
    if (!data.items) return [];
    return data.items.map(
      (repo: {
        id: number;
        full_name: string;
        description?: string;
        html_url: string;
        stargazers_count: number;
        owner: { login: string };
        created_at: string;
      }) => ({
        id: `gh-${repo.id}`,
        title: `${repo.full_name}${
          repo.description ? " — " + repo.description : ""
        }`,
        url: repo.html_url,
        source: "GitHub Trending",
        score: repo.stargazers_count,
        author: repo.owner.login,
        timestamp: new Date(repo.created_at).getTime(),
      })
    );
  } catch {
    return [];
  }
}

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

// Minimal RSS 2.0 / Atom parser (regex, no deps). Only used for PUBLIC
// catalog feeds (e.g. GeekNews), never user-private URLs.
async function fetchRss(url: string, sourceName: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "claudenews/1.0" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const blocks =
      xml.indexOf("<item") !== -1
        ? xml.split(/<item[\s>]/).slice(1)
        : xml.split(/<entry[\s>]/).slice(1);
    const pick = (b: string, tag: string) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? decodeEntities(m[1]) : "";
    };
    const out: NewsItem[] = [];
    for (const b of blocks.slice(0, 30)) {
      const title = pick(b, "title");
      let link = pick(b, "link");
      if (!link) {
        const hm = b.match(/<link[^>]*href=["']([^"']+)["']/i); // Atom
        link = hm ? hm[1] : "";
      }
      if (!title || !link) continue;
      const ts =
        Date.parse(pick(b, "pubDate") || pick(b, "updated") || "") || Date.now();
      out.push({
        id: `rss-${sourceName}-${link}`,
        title,
        url: link,
        source: sourceName,
        timestamp: ts,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function getSource(id: string): Promise<NewsItem[]> {
  const c = cache[id];
  if (c && Date.now() - c.at < CACHE_TTL_MS) return c.items;
  let items: NewsItem[] = [];
  if (id === "hn") items = await fetchHackerNews();
  else if (id === "github") items = await fetchGitHubTrending();
  else {
    const def = CATALOG_BY_ID[id];
    if (def?.type === "rss" && def.url)
      items = await fetchRss(def.url, def.name);
  }
  // Tag each item with its source's content language so the plugin can skip
  // translating a source that's already in the user's target language.
  const lang = CATALOG_BY_ID[id]?.lang ?? "en";
  items = items.map((it) => ({ ...it, lang }));
  cache[id] = { items, at: Date.now() };
  return items;
}

// Round-robin merge so no single source dominates.
function interleave(lists: NewsItem[][]): NewsItem[] {
  const out: NewsItem[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++)
    for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

export async function GET(request: NextRequest) {
  const limit = Math.min(
    50,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "10", 10) || 10)
  );
  const requested = (request.nextUrl.searchParams.get("sources") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && CATALOG_BY_ID[s]);
  // Default to the always-on builtin sources if none specified.
  const ids = requested.length ? requested : ["hn", "github"];

  const lists = await Promise.all(ids.map((id) => getSource(id)));
  const items = interleave(lists);
  const pick =
    items[Math.floor(Math.random() * Math.min(items.length, 15))] || null;

  return Response.json({
    pick,
    items: items.slice(0, limit),
    sources: ids,
  });
}
