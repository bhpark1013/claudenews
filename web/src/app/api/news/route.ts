import { NextRequest } from "next/server";

// Simple in-memory cache (lives for Vercel function warm duration)
let cache: { items: NewsItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  score?: number;
  comments?: number;
  author?: string;
  timestamp: number;
}

async function fetchHackerNews(): Promise<NewsItem[]> {
  try {
    const topRes = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
      { next: { revalidate: 300 } }
    );
    const ids: number[] = await topRes.json();
    const topIds = ids.slice(0, 50);

    const stories = await Promise.all(
      topIds.map(async (id) => {
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
        // Open the HN discussion thread rather than the external article —
        // the comments are the point of Hacker News.
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
    // GitHub has no official trending API; we use the search API for recently created popular repos
    const res = await fetch(
      "https://api.github.com/search/repositories?q=created:>" +
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) +
        "&sort=stars&order=desc&per_page=30",
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 900 },
      }
    );
    const data = await res.json();
    if (!data.items) return [];

    return data.items.map((repo: {
      id: number;
      full_name: string;
      description?: string;
      html_url: string;
      stargazers_count: number;
      language?: string;
      owner: { login: string };
      created_at: string;
    }) => ({
      id: `gh-${repo.id}`,
      title: `${repo.full_name}${repo.description ? " — " + repo.description : ""}`,
      url: repo.html_url,
      source: "GitHub Trending",
      score: repo.stargazers_count,
      author: repo.owner.login,
      timestamp: new Date(repo.created_at).getTime(),
    }));
  } catch {
    return [];
  }
}

async function getAllNews(): Promise<NewsItem[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }

  const [hn, gh] = await Promise.all([fetchHackerNews(), fetchGitHubTrending()]);

  // Interleave: 2 HN, 1 GH, 2 HN, 1 GH ...
  const items: NewsItem[] = [];
  let hnIdx = 0;
  let ghIdx = 0;
  while (hnIdx < hn.length || ghIdx < gh.length) {
    if (hnIdx < hn.length) items.push(hn[hnIdx++]);
    if (hnIdx < hn.length) items.push(hn[hnIdx++]);
    if (ghIdx < gh.length) items.push(gh[ghIdx++]);
  }

  cache = { items, fetchedAt: now };
  return items;
}

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10", 10);
  const sources = request.nextUrl.searchParams.get("sources")?.split(",");

  let items = await getAllNews();
  if (sources && sources.length > 0) {
    items = items.filter((i) =>
      sources.some((s) => i.source.toLowerCase().includes(s.toLowerCase()))
    );
  }

  // Pick one random item for "next" display, plus return the batch
  const pick = items[Math.floor(Math.random() * Math.min(items.length, 15))];

  return Response.json({
    pick,
    items: items.slice(0, limit),
    cached: !!cache,
    fetchedAt: cache?.fetchedAt,
  });
}
