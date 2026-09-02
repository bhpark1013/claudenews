---
description: Show or change which news sources feed the claudenews status line. Triggers when the user wants to see/list/change/add/remove news sources or feeds — e.g. "claudenews 뉴스 소스/목록 보여줘", "뉴스 소스 바꿔/켜/꺼줘", "show/change my news sources", "manage claudenews feeds". No slash needed; just ask.
argument-hint: "[<id> <id> ...]"
allowed-tools: Bash(bash:*)
---

Show every news source with its on/off state, or toggle sources by id.

- `/claudenews:list` — print the full inline menu (every source id +
  flag + on/off) plus community feeds registered by users. No window.
- `/claudenews:list cnn bbc hn cf-1a2b3c4d5e` — toggle one or more sources by id
- `/claudenews:list add r/<sub>` — add your own feed: a subreddit, or any
  RSS/Atom URL. It is registered in the backend's shared registry (fetched
  server-side once for everyone) and turned on for you; only a URL the
  backend cannot fetch falls back to a client feed fetched on your machine.
- `/claudenews:list rmfeed <id | r/<sub> | url-fragment>` — turn one of your
  feeds off (community feeds are shared, so they are disabled, not deleted)

The inline list **is** the menu — it shows exactly what you can pick
and the exact ids to type. Run it with no args first to see options,
then toggle by id.

Raw slash-command arguments: `$ARGUMENTS`

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/list.sh $ARGUMENTS
```

Report the script output verbatim. If the user asked conversationally, map
their request to a `list.sh` call and run it:
- "show / change / toggle sources" → show the list, then toggle by id.
- "add r/rust" / "follow the rust subreddit" → `list.sh add r/rust`
  (Reddit shorthand is `r/<sub>`).
- "add this feed `<url>`" / any RSS/Atom link → `list.sh add <url>`.
- "remove r/rust" / "drop that feed" → `list.sh rmfeed r/rust` (or by `cf-…` id).
