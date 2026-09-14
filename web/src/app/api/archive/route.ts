import { NextRequest } from "next/server";
import { archiveEnabled, listDays, readDay } from "@/lib/archive";

/**
 * GET /api/archive?date=YYYY-MM-DD   one day
 * GET /api/archive                   the list of captured days
 *
 * Read-only and public: it returns links and headlines the sources already
 * publish. Capturing lives at /api/archive/capture, behind a secret.
 */
export async function GET(request: NextRequest) {
  if (!archiveEnabled) {
    return Response.json({ ok: false, error: "archive_not_configured" }, { status: 503 });
  }
  const date = request.nextUrl.searchParams.get("date");
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ ok: false, error: "bad_date" }, { status: 400 });
    }
    const day = await readDay(date);
    if (!day) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    return Response.json({ ok: true, ...day });
  }
  return Response.json({ ok: true, days: await listDays() });
}
