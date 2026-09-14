import { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/site";
import { archiveEnabled, captureDay, today } from "@/lib/archive";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

/** Sources worth retaining. User-registered feeds are per-user, not archived. */
const ARCHIVE_SOURCES = "hn,github";

function authorized(request: NextRequest): boolean {
  // Vercel Cron invokes the path with GET and sends `Authorization: Bearer
  // $CRON_SECRET`, which is why capturing is a GET on its own route rather
  // than a POST on the public one.
  if (CRON_SECRET && request.headers.get("authorization") === `Bearer ${CRON_SECRET}`) {
    return true;
  }
  const admin = request.nextUrl.searchParams.get("admin");
  return Boolean(ADMIN_TOKEN && admin === ADMIN_TOKEN);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!archiveEnabled) {
    return Response.json({ ok: false, error: "archive_not_configured" }, { status: 503 });
  }

  // Read through the public endpoint rather than duplicating the per-source
  // fetching and interleaving that lives there.
  const res = await fetch(`${SITE_URL}/api/news?sources=${ARCHIVE_SOURCES}&limit=50`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return Response.json({ ok: false, error: `news_fetch_${res.status}` }, { status: 502 });
  }
  const { items } = (await res.json()) as { items?: unknown };
  if (!Array.isArray(items) || items.length === 0) {
    // Writing an empty snapshot would be indistinguishable from a quiet news
    // day later, so a failed fetch must not produce one.
    return Response.json({ ok: false, error: "no_items" }, { status: 502 });
  }

  const date = today();
  const { added, total } = await captureDay(date, items);
  return Response.json({ ok: true, date, added, total });
}
