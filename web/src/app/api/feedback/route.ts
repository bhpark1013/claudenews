import { NextRequest } from "next/server";

// User-submitted feedback (explicit, via /claudenews:feedback). We store
// ONLY the message the user typed, a timestamp, and the plugin version —
// never an IP, user agent, or any identifier, consistent with the rest of
// the project. If no KV is configured this is a harmless no-op.
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const MAX_LEN = 1000;

async function kv<T = string | number | null>(
  cmd: string[]
): Promise<T | null> {
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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Admin-only read of the actual messages. Guarded by a shared secret so
  // the raw feedback list is never publicly exposed. Compared with a
  // length-aware check; missing/empty ADMIN_TOKEN means the door stays shut.
  const admin = params.get("admin");
  if (admin !== null) {
    if (!ADMIN_TOKEN || admin !== ADMIN_TOKEN) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const raw = (await kv<string[]>(["LRANGE", "feedback:list", "0", "-1"])) || [];
    const items = raw.map((e) => {
      try {
        return JSON.parse(e) as { t: string; v: string | null; m: string };
      } catch {
        return { t: null, v: null, m: e };
      }
    });
    return Response.json({ ok: true, count: items.length, items });
  }

  if (params.get("stats") === "1") {
    const total = await kv(["GET", "feedback:count"]);
    return Response.json({ feedback: Number(total) || 0 });
  }
  return Response.json({ ok: true, usage: "POST { message, version? }" });
}

export async function POST(request: NextRequest) {
  let body: { message?: unknown; version?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const message = String(body.message ?? "").trim().slice(0, MAX_LEN);
  if (!message) {
    return Response.json(
      { ok: false, error: "empty message" },
      { status: 400 }
    );
  }
  const version = String(body.version ?? "")
    .trim()
    .slice(0, 32);

  const entry = JSON.stringify({
    t: new Date().toISOString(),
    v: version || null,
    m: message,
  });

  await kv(["RPUSH", "feedback:list", entry]);
  await kv(["INCR", "feedback:count"]);

  return Response.json({ ok: true });
}
