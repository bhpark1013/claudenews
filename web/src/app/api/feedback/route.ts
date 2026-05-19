import { NextRequest } from "next/server";

// User-submitted feedback (explicit, via /claudenews:feedback). We store
// ONLY the message the user typed, a timestamp, and the plugin version —
// never an IP, user agent, or any identifier, consistent with the rest of
// the project. If no KV is configured this is a harmless no-op.
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const MAX_LEN = 1000;

async function kv(cmd: string[]): Promise<string | number | null> {
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
    return json.result ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("stats") === "1") {
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
