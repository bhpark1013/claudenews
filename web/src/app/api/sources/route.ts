import { CATALOG } from "@/lib/sources";
import { loadCustomFeeds } from "@/lib/feeds";

// Source catalog the plugin fetches to render its toggle list: the static
// built-in catalog plus the shared registry of user-registered feeds
// (customFeeds). Same response for everyone.
export async function GET() {
  const custom = await loadCustomFeeds();
  return Response.json(
    {
      sources: CATALOG.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        lang: s.lang,
        defaultOn: s.defaultOn,
        defaultOnLangs: s.defaultOnLangs ?? [],
      })),
      customFeeds: custom.map((f) => ({
        id: f.id,
        name: f.name,
        type: "rss",
        lang: f.lang,
        url: f.url,
        custom: true,
        defaultOn: false,
        defaultOnLangs: [],
      })),
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
