---
description: Open the news item currently shown in the claudenews status line in your web browser. Triggers when the user wants to open/jump to the current news in a browser — e.g. "이 뉴스 브라우저에서 열어줘", "claudenews 바로가기", "지금 뉴스 브라우저로 열어", "open this news in the browser", "take me to this article". No slash needed; just ask.
allowed-tools: Bash(python3:*)
---

Open the currently shown news item in the default web browser.

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/commands/feed.py open
```

Report the script output verbatim. Notes:
- Works on a local desktop terminal (macOS/Windows/Linux with a GUI).
- On a remote/headless terminal (plain SSH, no display) it cannot launch a
  browser, so it prints the link for the user to open manually — relay that link.
