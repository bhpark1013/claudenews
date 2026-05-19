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

// Per-language native dev communities. Each `defaultOnLangs` entry auto-
// enables that one feed for users whose OS language matches (same pattern
// as GeekNews for Korean) — at most one extra feed on by default so a
// non-English user isn't flooded. The rest are opt-in via /claudenews:list.
export const CATALOG: SourceDef[] = [
  { id: "hn", name: "🌐 Hacker News", type: "builtin", defaultOn: true },
  { id: "github", name: "🌐 GitHub Trending", type: "builtin", defaultOn: true },

  // Korean
  {
    id: "geeknews",
    name: "🇰🇷 GeekNews",
    type: "rss",
    url: "https://news.hada.io/rss/news",
    defaultOn: false,
    defaultOnLangs: ["ko"],
  },

  // Japanese — Qiita is the de-facto default; Zenn / Hatena are opt-in.
  {
    id: "qiita",
    name: "🇯🇵 Qiita 人気",
    type: "rss",
    url: "https://qiita.com/popular-items/feed",
    defaultOn: false,
    defaultOnLangs: ["ja"],
  },
  {
    id: "zenn",
    name: "🇯🇵 Zenn",
    type: "rss",
    url: "https://zenn.dev/feed",
    defaultOn: false,
  },
  {
    id: "hatena-it",
    name: "🇯🇵 はてブ テクノロジー",
    type: "rss",
    url: "https://b.hatena.ne.jp/hotentry/it.rss",
    defaultOn: false,
  },

  // Chinese — V2EX (community), InfoQ 中文 (opt-in).
  {
    id: "v2ex",
    name: "🇨🇳 V2EX",
    type: "rss",
    url: "https://www.v2ex.com/index.xml",
    defaultOn: false,
    defaultOnLangs: ["zh"],
  },
  {
    id: "infoq-cn",
    name: "🇨🇳 InfoQ 中文",
    type: "rss",
    url: "https://www.infoq.cn/feed",
    defaultOn: false,
  },

  // Russian — Habr daily best.
  {
    id: "habr",
    name: "🇷🇺 Habr",
    type: "rss",
    url: "https://habr.com/ru/rss/articles/top/?fl=ru",
    defaultOn: false,
    defaultOnLangs: ["ru"],
  },

  // French — Le Journal du hacker (HN-style FR community).
  {
    id: "jdh",
    name: "🇫🇷 Journal du hacker",
    type: "rss",
    url: "https://www.journalduhacker.net/rss",
    defaultOn: false,
    defaultOnLangs: ["fr"],
  },

  // German — heise Developer.
  {
    id: "heise-dev",
    name: "🇩🇪 heise Developer",
    type: "rss",
    url: "https://www.heise.de/developer/feed.xml",
    defaultOn: false,
    defaultOnLangs: ["de"],
  },

  // Portuguese (Brazil) — TabNews (HN-style BR community).
  {
    id: "tabnews",
    name: "🇧🇷 TabNews",
    type: "rss",
    url: "https://www.tabnews.com.br/recentes/rss",
    defaultOn: false,
    defaultOnLangs: ["pt"],
  },

  // Global English communities — opt-in (HN/GitHub already cover the
  // default English experience; these are for users who want more).
  {
    id: "lobsters",
    name: "🌐 Lobsters",
    type: "rss",
    url: "https://lobste.rs/rss",
    defaultOn: false,
  },
  {
    id: "devto",
    name: "🌐 DEV Community",
    type: "rss",
    url: "https://dev.to/feed",
    defaultOn: false,
  },
];

export const CATALOG_BY_ID: Record<string, SourceDef> = Object.fromEntries(
  CATALOG.map((s) => [s.id, s])
);
