// Public source catalog. Shared by /api/sources (served to the plugin so
// it can show a toggle list) and /api/news (decides what to fetch).
//
// type "builtin"  → handled by a dedicated fetcher (HN firebaseio,
//                    GitHub search API).
// type "rss"      → generic server-side RSS fetch+cache of `url`. These
//                    are PUBLIC catalog feeds (e.g. GeekNews), not a
//                    user's private subscription, so serving them from
//                    the backend carries no privacy cost.
//
// defaultOn       → on for everyone on first run.
// defaultOnLangs  → additionally on when the user's OS language
//                    (detect_lang) is in this list. Used for
//                    language-specific sources like GeekNews (Korean).

export interface SourceDef {
  id: string;
  name: string;
  type: "builtin" | "rss";
  url?: string;
  defaultOn: boolean;
  defaultOnLangs?: string[];
}

export const CATALOG: SourceDef[] = [
  { id: "hn", name: "Hacker News", type: "builtin", defaultOn: true },
  { id: "github", name: "GitHub Trending", type: "builtin", defaultOn: true },
  {
    id: "geeknews",
    name: "GeekNews",
    type: "rss",
    url: "https://news.hada.io/rss/news",
    defaultOn: false,
    defaultOnLangs: ["ko"],
  },
];

export const CATALOG_BY_ID: Record<string, SourceDef> = Object.fromEntries(
  CATALOG.map((s) => [s.id, s])
);
