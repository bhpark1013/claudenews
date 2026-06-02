import { NextRequest } from "next/server";

// Anonymous install analytics. We store ONLY a client-generated random
// install id (a UUID with no link to identity), counters, and per-day
// buckets — never an IP, user agent, or anything that ties back to a
// person. The id lets us (a) de-duplicate so reinstalls don't inflate the
// count, (b) detect uninstalls, and (c) measure active users via daily
// heartbeats. If no KV is configured every endpoint is a harmless no-op.
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

// How long activity sets live. Sets auto-expire so the keyspace can't grow
// without bound; retention is a little longer than each window so the
// current bucket is always intact when queried.
const TTL_DAY = String(60 * 60 * 24 * 10); // 10 days
const TTL_WEEK = String(60 * 60 * 24 * 16); // 16 days
const TTL_MONTH = String(60 * 60 * 24 * 45); // 45 days

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

// ISO-8601 week label ("YYYY-Www") for a "YYYY-MM-DD" date, computed in UTC
// to match how the day bucket is derived.
function isoWeek(dayStr: string): string {
  const d = new Date(dayStr + "T00:00:00Z");
  const dayNr = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNr + 3); // shift to that week's Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstNr + 3);
  const week =
    1 +
    Math.round(
      (d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000)
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function listScanKeys(): { day: string; week: string; month: string } {
  const day = new Date().toISOString().slice(0, 10);
  return { day, week: isoWeek(day), month: day.slice(0, 7) };
}

// SADD the id into the install set and keep the unique-ever counter in sync.
// Shared by the install ping and the heartbeat (a heartbeat proves the
// client is still installed, so it self-heals clients that pre-date ids).
async function markInstalled(id: string): Promise<boolean> {
  const added = await kv(["SADD", "installs:ids", id]); // 1 if newly unique
  await kv(["SREM", "uninstalls:ids", id]); // active again → clear uninstalled
  if (added === 1) await kv(["INCR", "installs:unique"]);
  return added === 1;
}

// Walk the keyspace for "<prefix>:YYYY-MM-DD" counter buckets, oldest→newest.
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

// Daily active-user history: SCARD of each "active:day:YYYY-MM-DD" set.
// Sets (not counters) so we SCAN then SCARD each key.
async function dailyActive(): Promise<Record<string, number>> {
  const re = dayKeyRe("active:day");
  const keys: string[] = [];
  let cursor = "0";
  do {
    const page = await kv<[string, string[]]>([
      "SCAN",
      cursor,
      "MATCH",
      "active:day:*",
      "COUNT",
      "1000",
    ]);
    if (!page) break;
    cursor = page[0];
    for (const k of page[1] || []) if (re.test(k)) keys.push(k);
  } while (cursor !== "0");

  keys.sort();
  const counts = await Promise.all(keys.map((k) => kv(["SCARD", k])));
  const out: Record<string, number> = {};
  keys.forEach((k, i) => {
    out[k.slice("active:day:".length)] = Number(counts[i]) || 0;
  });
  return out;
}

async function stats(includeDaily: boolean) {
  const { day, week, month } = listScanKeys();
  const [
    installsTotal,
    uniqueEver,
    uninstallsTotal,
    active,
    uninstalled,
    dau,
    wau,
    mau,
  ] = await Promise.all([
    kv(["GET", "installs:total"]), // legacy cumulative ping counter
    kv(["GET", "installs:unique"]), // unique ids ever seen (id-aware clients)
    kv(["GET", "uninstalls:total"]),
    kv(["SCARD", "installs:ids"]), // currently installed (unique)
    kv(["SCARD", "uninstalls:ids"]), // uninstalled (unique)
    kv(["SCARD", `active:day:${day}`]), // active today
    kv(["SCARD", `active:week:${week}`]), // active this ISO week
    kv(["SCARD", `active:month:${month}`]), // active this month
  ]);
  const base = {
    installs: Number(installsTotal) || 0, // back-compat field name
    unique_installs: Number(uniqueEver) || 0,
    active: Number(active) || 0,
    uninstalled: Number(uninstalled) || 0,
    uninstalls_total: Number(uninstallsTotal) || 0,
    dau: Number(dau) || 0,
    wau: Number(wau) || 0,
    mau: Number(mau) || 0,
  };
  if (!includeDaily) return base;
  const [daily, dailyUninstalls, activeDaily] = await Promise.all([
    dailyBuckets("installs"),
    dailyBuckets("uninstalls"),
    dailyActive(),
  ]);
  return {
    ...base,
    daily,
    daily_uninstalls: dailyUninstalls,
    daily_active: activeDaily,
  };
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

  // --- Heartbeat: a still-installed client checking in (≤ once/day). Marks
  // the id active in the day/week/month windows so we can report DAU/WAU/MAU.
  if (event === "heartbeat") {
    if (id) {
      await markInstalled(id); // self-heal install set for pre-id clients
      const { week, month } = listScanKeys();
      await kv(["SADD", `active:day:${day}`, id]);
      await kv(["EXPIRE", `active:day:${day}`, TTL_DAY]);
      await kv(["SADD", `active:week:${week}`, id]);
      await kv(["EXPIRE", `active:week:${week}`, TTL_WEEK]);
      await kv(["SADD", `active:month:${month}`, id]);
      await kv(["EXPIRE", `active:month:${month}`, TTL_MONTH]);
    }
    return Response.json({ ok: true, event: "heartbeat" });
  }

  // --- Install ---
  if (id) {
    const isNew = await markInstalled(id);
    if (isNew) await kv(["INCR", `installs:${day}`]);
    return Response.json({ ok: true });
  }

  // Legacy id-less client: keep the old cumulative behaviour so older
  // installs still register (just without de-dup/uninstall awareness).
  await kv(["INCR", "installs:total"]);
  await kv(["INCR", `installs:${day}`]);
  return Response.json({ ok: true });
}
