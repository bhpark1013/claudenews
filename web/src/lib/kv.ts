// Minimal Upstash/Vercel KV REST helper shared by routes that persist small
// JSON blobs (guides, custom feed registry). Returns null when KV is not
// configured or the call fails, so callers degrade to in-code defaults.
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvConfigured = Boolean(KV_URL && KV_TOKEN);

export async function kv<T = string | null>(cmd: string[]): Promise<T | null> {
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

/**
 * SET a value that is too large for a URL path.
 *
 * kv() encodes every argument into the request path, which is fine for the
 * short values it was written for (a feed id, a counter) but silently fails
 * once the value is kilobytes long -- the daily snapshot is ~10KB and the
 * request never reaches the server. Upstash takes the value as the raw request
 * body on POST, which has no such limit.
 */
export async function kvSet(key: string, value: string): Promise<boolean> {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: value,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
