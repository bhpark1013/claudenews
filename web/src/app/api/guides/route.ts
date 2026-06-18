import { NextRequest } from "next/server";

// Server-driven status-line guides (the rotating hints the plugin shows).
// Lets the maintainer change the tips — and announce new features — WITHOUT
// a client update: the plugin caches whatever this returns. Stored in KV
// under "guides:json" (a JSON array of strings); falls back to DEFAULTS when
// unset. If no KV is configured, DEFAULTS are always returned.
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// Built-in fallback shown when KV has nothing set. The
// "/claudenews:feed to expand this item" tip was intentionally removed.
const DEFAULTS: string[] = [
  "/claudenews:list to see & pick news sources",
  "/claudenews:translate ko to set language",
  "/claudenews:feedback <msg> to send feedback",
  "add your own RSS/Reddit feeds in ~/.claudenews/config.json",
];

const MAX_GUIDES = 20;
const MAX_GUIDE_LEN = 120;

async function kv<T = string | null>(cmd: string[]): Promise<T | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(
      `${KV_URL}/${cmd.map(encodeURIComponent).join("/")}`,
      {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json.result ?? null) as T | null;
  } catch {
    return null;
  }
}

function sanitize(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((g): g is string => typeof g === "string")
    .map((g) => g.trim().slice(0, MAX_GUIDE_LEN))
    .filter(Boolean)
    .slice(0, MAX_GUIDES);
}

export async function GET() {
  const stored = await kv<string>(["GET", "guides:json"]);
  let guides: string[] = [];
  if (stored) {
    try {
      guides = sanitize(JSON.parse(stored));
    } catch {
      guides = [];
    }
  }
  if (!guides.length) guides = DEFAULTS;
  return Response.json(
    { guides },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}

// Admin-only update so tips can change on the fly (no redeploy needed).
// POST { admin: "<token>", guides: ["...", ...] }
export async function POST(request: NextRequest) {
  let body: { admin?: unknown; guides?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!ADMIN_TOKEN || String(body.admin ?? "") !== ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guides = sanitize(body.guides);
  if (!guides.length) {
    return Response.json({ ok: false, error: "empty guides" }, { status: 400 });
  }
  await kv(["SET", "guides:json", JSON.stringify(guides)]);
  return Response.json({ ok: true, guides });
}
