import { NextRequest } from "next/server";

// Anonymous install analytics. We store ONLY a client-generated random
// install id (a UUID with no link to identity), counters, and per-day
// buckets — never an IP, user agent, or anything that ties back to a
// person. The id lets us (a) de-duplicate so reinstalls don't inflate the
// count and (b) detect uninstalls. If no KV is configured every endpoint
// is a harmless no-op (deploy still works).
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Random opaque token, must be 8–64 of [A-Za-z0-9-]. Anything else is
// ignored and treated as a legacy (id-less) ping.
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
// Per-day bucket keys: "<prefix>:YYYY-MM-DD".
const dayKeyRe = (prefix: string) =>
  new RegExp(`^${prefix}:\\d{4}-\\d{2}-\\d{2}$`);

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

// Walk the keyspace for "<prefix>:YYYY-MM-DD" buckets, oldest→newest.
// SCAN is cursor-paged; loop until the cursor returns to "0".
async function dailyBuckets(prefix: string): Promise<Record<string, number>> {
  const re = dayKeyRe(prefix);
  const keys: string[] = [];
  let cursor = "0";
  do {
    const page = await kv<[string, string[]]>([
      "SCAN",
      cursor,
      "MATCH",
      `${prefix}:*`,
      "COUNT",
      "1000",
    ]);
    if (!page) break;
    cursor = page[0];
    for (const k of page[1] || []) if (re.test(k)) keys.push(k);
  } while (cursor !== "0");

  keys.sort();
  if (keys.length === 0) return {};
  const values = await kv<(string | null)[]>(["MGET", ...keys]);
  const out: Record<string, number> = {};
  keys.forEach((k, i) => {
    out[k.slice(prefix.length + 1)] = Number(values?.[i]) || 0;
  });
  return out;
}

async function stats(includeDaily: boolean) {
  const [installsTotal, uniqueEver, uninstallsTotal, active, uninstalled] =
    await Promise.all([
      kv(["GET", "installs:total"]), // legacy cumulative ping counter
      kv(["GET", "installs:unique"]), // unique ids ever seen (id-aware clients)
      kv(["GET", "uninstalls:total"]),
      kv(["SCARD", "installs:ids"]), // currently installed (unique)
      kv(["SCARD", "uninstalls:ids"]), // uninstalled (unique)
    ]);
  const base = {
    installs: Number(installsTotal) || 0, // back-compat field name
    unique_installs: Number(uniqueEver) || 0,
    active: Number(active) || 0,
    uninstalled: Number(uninstalled) || 0,
    uninstalls_total: Number(uninstallsTotal) || 0,
  };
  if (!includeDaily) return base;
  const [daily, dailyUninstalls] = await Promise.all([
    dailyBuckets("installs"),
    dailyBuckets("uninstalls"),
  ]);
  return { ...base, daily, daily_uninstalls: dailyUninstalls };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("daily") === "1") return Response.json(await stats(true));
  if (params.get("stats") === "1") return Response.json(await stats(false));

  const day = new Date().toISOString().slice(0, 10);
  const rawId = (params.get("id") || "").trim();
  const id = ID_RE.test(rawId) ? rawId : null;
  const event = params.get("event");

  // --- Uninstall: only meaningful with an id (we need to know WHO left). ---
  if (event === "uninstall") {
    if (id) {
      const removed = await kv(["SREM", "installs:ids", id]);
      const firstTime = await kv(["SADD", "uninstalls:ids", id]);
      // Count the uninstall once per id, and only if they were a known
      // install (removed === 1) — avoids counting phantom uninstalls.
      if (firstTime === 1 && removed === 1) {
        await kv(["INCR", "uninstalls:total"]);
        await kv(["INCR", `uninstalls:${day}`]);
      }
    }
    return Response.json({ ok: true, event: "uninstall" });
  }

  // --- Install / heartbeat ---
  if (id) {
    const added = await kv(["SADD", "installs:ids", id]); // 1 if newly unique
    await kv(["SREM", "uninstalls:ids", id]); // reinstall clears the flag
    if (added === 1) {
      await kv(["INCR", "installs:unique"]);
      await kv(["INCR", `installs:${day}`]);
    }
    return Response.json({ ok: true });
  }

  // Legacy id-less client: keep the old cumulative behaviour so older
  // installs still register (just without de-dup/uninstall awareness).
  await kv(["INCR", "installs:total"]);
  await kv(["INCR", `installs:${day}`]);
  return Response.json({ ok: true });
}
