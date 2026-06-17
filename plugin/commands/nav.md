---
description: Enable or disable claudenews key navigation — step the status-line news to the previous/next item with cmd+ctrl+←/→. Opt-in; installs a small Hammerspoon key tap only when turned on. Triggers when the user wants to browse/scroll news with arrow keys, e.g. "claudenews 키로 뉴스 넘기기 켜줘", "방향키로 뉴스 이동 활성화", "enable claudenews key nav", "turn off news arrow keys".
argument-hint: "[on | off | status]"
allowed-tools: Bash(bash:*)
---

Enable, disable, or check claudenews key navigation.

- `/claudenews:nav on` — make news global + install the Hammerspoon key tap (cmd+ctrl+←/→)
- `/claudenews:nav off` — disable and remove the wiring (per-session rotation resumes)
- `/claudenews:nav status` — show current state

Raw slash-command arguments: `$ARGUMENTS`

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/nav.sh $ARGUMENTS
```

Report the script output verbatim. If Hammerspoon is not installed, walk the user through the printed install + Accessibility-permission steps.
