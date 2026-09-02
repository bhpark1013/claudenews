import { NextRequest } from "next/server";
import {
  CustomFeed,
  MAX_FEEDS,
  feedIdFor,
  loadCustomFeeds,
  normalizeFeedUrl,
  sanitizeLang,
  sanitizeName,
  saveCustomFeeds,
} from "@/lib/feeds";
import { kvConfigured } from "@/lib/kv";
import { BROWSER_UA, CUSTOM_FEED_OPTS, parseFeedXml } from "@/lib/rss";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function publicView(f: CustomFeed) {
  return { id: f.id, name: f.name, url: f.url, lang: f.lang, addedAt: f.addedAt };
}

// GET → the shared registry (every feed anyone registered).
export async function GET() {
  const feeds = await loadCustomFeeds();
  return Response.json(
    { feeds: feeds.map(publicView) },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}

// POST { url, name?, lang? } → register (or return the existing entry for
// the same URL). The server fetches the feed once here to prove it is
// reachable from the backend and parses as RSS/Atom; feeds that fail get
// 422 so the client can keep fetching them locally instead.
export async function POST(request: NextRequest) {
  let body: { url?: unknown; name?: unknown; lang?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!kvConfigured) {
    return Response.json(
      { ok: false, error: "registry unavailable" },
      { status: 503 }
    );
  }
  const url = normalizeFeedUrl(String(body.url ?? ""));
  if (!url) {
    return Response.json(
      { ok: false, error: "invalid url (public http/https feed required)" },
      { status: 400 }
    );
  }
  const id = feedIdFor(url);
  const feeds = await loadCustomFeeds(true);
  const existing = feeds.find((f) => f.id === id);
  if (existing) {
    return Response.json({ ok: true, created: false, feed: publicView(existing) });
  }
  if (feeds.length >= MAX_FEEDS) {
    return Response.json(
      { ok: false, error: "registry full" },
      { status: 507 }
    );
  }
  const name = sanitizeName(body.name, url);
  // Prove the backend can fetch + parse it before anyone can enable it.
  let entries = 0;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return Response.json(
        { ok: false, error: `feed fetch failed (${res.status})`, unreachable: true },
        { status: 422 }
      );
    }
    const xml = (await res.text()).slice(0, 1_000_000);
    entries = parseFeedXml(xml, name, { ...CUSTOM_FEED_OPTS, maxAgeDays: 0 }).length;
  } catch {
    return Response.json(
      { ok: false, error: "feed fetch failed", unreachable: true },
      { status: 422 }
    );
  }
  if (!entries) {
    return Response.json(
      { ok: false, error: "no RSS/Atom entries found at that url" },
      { status: 422 }
    );
  }
  const feed: CustomFeed = {
    id,
    name,
    url,
    lang: sanitizeLang(body.lang),
    addedAt: Date.now(),
  };
  const saved = await saveCustomFeeds([...feeds, feed]);
  if (!saved) {
    return Response.json({ ok: false, error: "save failed" }, { status: 500 });
  }
  return Response.json({ ok: true, created: true, feed: publicView(feed) });
}

// DELETE { admin, id } → maintainer-only removal (spam / dead feeds).
export async function DELETE(request: NextRequest) {
  let body: { admin?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!ADMIN_TOKEN || String(body.admin ?? "") !== ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const id = String(body.id ?? "");
  const feeds = await loadCustomFeeds(true);
  const kept = feeds.filter((f) => f.id !== id);
  if (kept.length === feeds.length) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  await saveCustomFeeds(kept);
  return Response.json({ ok: true, removed: id });
}
