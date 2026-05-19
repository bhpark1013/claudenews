---
description: Show or change which news sources feed the claudenews status line. Triggers when the user wants to see/list/change/add/remove news sources or feeds — e.g. "claudenews 뉴스 소스/목록 보여줘", "뉴스 소스 바꿔/켜/꺼줘", "show/change my news sources", "manage claudenews feeds". No slash needed; just ask.
argument-hint: "[source-id | pick]"
allowed-tools: Bash(bash:*), Read, Edit
---

Manage which sources feed your status line.

- `/claudenews:list` — show all sources inline with on/off state (no window)
- `/claudenews:list github` — quick-toggle one source by id
  (e.g. `hn`, `github`, `geeknews`, `cnn`, `yonhap`, …)
- `/claudenews:list pick` — open a curses picker in a split pane / window
  (opt-in; only if you specifically want a windowed toggler)

Raw slash-command arguments: `$ARGUMENTS`

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/list.sh $ARGUMENTS
```

Report the script output verbatim.

Then, **if the user ran this with no argument or `text`** (the inline
list), invite them to change the selection conversationally — e.g. tell
them they can just say "turn on CNN and BBC, turn off devto" and you will
apply it. When they ask for changes, edit `~/.claudenews/config.json`
directly:

- It is JSON with a `"sources"` object mapping each source id → boolean.
- Set the requested ids true/false; leave the rest unchanged.
- Also set `"sourcesConfigured": true`.
- Use the source ids exactly as shown in the list output.
- After editing, briefly confirm the new active set. The status line
  picks it up on the next refresh; no reload is needed.

For `pick` or a single-id toggle, just report the script output — no
further action.
