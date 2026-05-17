# claudenews — DevFeed for Claude Code

> Don't stare at the spinner. Read dev news in your status line while Claude is thinking.

A Claude Code plugin that surfaces **Hacker News** and **GitHub Trending** in the
status line during agent wait time — auto-translated into your OS language,
with short summaries that fade in as Claude fetches them in the background.

```
[OMC#4.13] | 5h:3% | session:5m | ctx:24%
[feed] HackerNews │ Rust 2.0 compiler is 10x faster than GCC   ▲847  💬234
       ↳ The Rust team released Rust 2.0 with a rewritten compiler frontend that…
```

Korean / Japanese / Chinese users see translated titles automatically — no
configuration needed:

```
[feed] HackerNews │ Rust 2.0 컴파일러가 GCC보다 10배 빠름   ▲847  💬234
       ↳ Rust 팀이 새 컴파일러 프론트엔드를 적용한 Rust 2.0을 출시했습니다…
```

## Install (30 seconds)

Inside Claude Code:

```
/plugin marketplace add bhpark1013/claudenews
/plugin install claudenews@claudenews
/reload-plugins
/claudenews:setup
```

`/reload-plugins` activates the hooks and slash commands without a full
restart. Then restart Claude Code once so the status line takes effect —
the next time the agent thinks, a news item rotates in.

## Why you might want this

- **No API key.** Translation and summary use your existing Claude Code session
  (Haiku, background-priced). No OpenAI key, no separate billing.
- **Auto-detects your OS language.** macOS `AppleLocale`, then `$LANG`,
  then Python locale. Korean, Japanese, Chinese, Spanish, etc. all work without
  configuration. English users get titles untranslated.
- **Coexists with your existing status line.** OMC HUD, git status, custom
  scripts — point at them via `parentStatusLine` in `~/.claudenews/config.json`
  and claudenews appends underneath rather than replacing.
- **Auto-fits your terminal width.** Detects cmux → tmux → iTerm2 → stty so
  titles & summaries truncate to the actual column count, not a static 120.
- **GitHub repo summaries are accurate.** When a GitHub repo's description is
  empty, claudenews falls back to the README's first paragraph via the GitHub
  API instead of showing "Contribute to … by creating an account on GitHub".
- **Built-in viewer with games.** `/claudenews:viewer` opens a live news pane
  with arrow-key navigation, summary toggling, and 2048 / snake for the
  really long agent waits.

## Commands

| Command | What it does |
|---|---|
| `/claudenews:setup` | Wire the status line wrapper (run once after install) |
| `/claudenews:feed` | Expand the current news item (HN comments, repo page, etc.) |
| `/claudenews:feed latest` | Show the 5 most recent news items |
| `/claudenews:viewer` | Open a live news viewer in a side pane (incl. games) |
| `/claudenews:translate ko` | Force a target language (`ko`, `ja`, `zh`, `es`, …) |
| `/claudenews:translate off` | Disable translation |
| `/claudenews:teardown` | Remove status line wiring (run before `/plugin remove`) |

## Sources

- Hacker News top 50
- GitHub trending repos (popular, created in the last 7 days)
- More planned: Product Hunt, Reddit r/programming, AI newsletters

## Privacy

- No prompts, no code, no keystrokes collected
- News is fetched on prompt submit, rate-limited to 30s per session
- Translation/summary uses your local Claude Code session — content never
  leaves your machine except to fetch the article meta description and the
  GitHub API for repo summaries
- All caches live under `~/.claudenews/`

## Uninstall

```
/claudenews:teardown
/plugin remove claudenews
```

`teardown` restores whatever status line you had before install (from the
backup created at setup time) and removes `~/.claudenews/`.

## Development

```bash
cd web
npm install
npm run dev
```

Backend is a single stateless Next.js 16 route on Vercel. `/api/news`
interleaves HN top stories and GitHub Trending, cached 5min in-memory
per function instance. No database, no accounts, no tracking.

## License

MIT
