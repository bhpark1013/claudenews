import { NextRequest } from "next/server";

// Anonymous install counter. We store ONLY counters — never an IP, user
// agent, or any identifier — so this can't be tied back to a user. If no
// KV is configured the endpoint is a harmless no-op (deploy still works).
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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
    const total = await kv(["GET", "installs:total"]);
    return Response.json({ installs: Number(total) || 0 });
  }
  // One install ping → bump a global counter and a per-day bucket.
  // No request metadata is read or persisted.
  const day = new Date().toISOString().slice(0, 10);
  await kv(["INCR", "installs:total"]);
  await kv(["INCR", `installs:${day}`]);
  return Response.json({ ok: true });
}
