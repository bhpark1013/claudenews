---
description: List or toggle news sources (Hacker News, GitHub Trending, GeekNews, …)
argument-hint: "[source-id]"
allowed-tools: Bash(bash:*)
---

Manage which sources feed your status line.

- `/claudenews:list` — show all sources with on/off state
- `/claudenews:list github` — toggle a source on/off (e.g. `hn`, `github`, `geeknews`)

Raw slash-command arguments: `$ARGUMENTS`

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/list.sh $ARGUMENTS
```

Report the script output verbatim.
