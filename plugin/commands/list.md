---
description: Pick news sources interactively, or quick-toggle one by id
argument-hint: "[source-id | text]"
allowed-tools: Bash(bash:*)
---

Manage which sources feed your status line.

- `/claudenews:list` — open an **interactive picker** in a split pane / new
  window: ↑↓ move, space toggle, `a` all, enter save, q cancel. Your current
  selection is pre-checked.
- `/claudenews:list github` — quick-toggle one source by id, no UI
  (e.g. `hn`, `github`, `geeknews`, `qiita`, `habr`, …)
- `/claudenews:list text` — plain text list, no UI

Raw slash-command arguments: `$ARGUMENTS`

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/list.sh $ARGUMENTS
```

Report the script output verbatim. The picker runs in its own pane/window;
the user interacts with it there and it writes the config on save.
