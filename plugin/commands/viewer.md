---
description: Open the live claudenews viewer pane (browse all news, arrow-key nav, summaries, mini-games) in a split/terminal. Triggers when the user wants a full news view or the viewer — e.g. "claudenews 뷰어 열어줘", "뉴스 전체/패널로 보여줘", "open the news viewer", "show all the news". No slash needed; just ask.
allowed-tools: Bash(bash:*)
---

Open a live-updating news viewer so you can browse recent dev news while Claude Code is working. The viewer runs in a separate pane or window and does not interrupt the current session.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/viewer.sh
```

Report the script's output as-is.
