---
description: Expand the news item currently shown in the claudenews status line (full summary, HN comments, repo page). Triggers when the user wants more on the current/this news — e.g. "이 뉴스 자세히/더 보여줘", "claudenews 이거 펼쳐줘", "expand this news", "what's this story about". No slash needed; just ask.
argument-hint: "[latest | list]"
allowed-tools: Read, Bash(python3:*), Bash(cat:*)
---

Raw slash-command arguments: `$ARGUMENTS`

Execute the expand script to show the current news item in detail (or a list of recent items):

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/commands/feed.py $ARGUMENTS
```

Display the script output as-is. Do NOT summarize or rewrite — the script returns formatted markdown ready for display.

Behavior:
- No arguments: expand the current news item (title, URL, score, top HN comments if HN)
- `latest`: show the 5 most recent news items as a list
- `list`: alias for `latest`
