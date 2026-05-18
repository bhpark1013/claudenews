import { CATALOG } from "@/lib/sources";

// Static catalog the plugin fetches to render its source toggle list.
// No request data is read; same response for everyone.
export async function GET() {
  return Response.json(
    {
      sources: CATALOG.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        defaultOn: s.defaultOn,
        defaultOnLangs: s.defaultOnLangs ?? [],
      })),
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
