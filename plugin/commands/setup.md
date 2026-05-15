---
description: Finalize claudenews setup by wiring the status line wrapper
allowed-tools: Bash(bash:*)
---

Finalize the claudenews plugin setup. This command only needs to run **once after installing the plugin** — it installs the status line wrapper and patches settings.json so news items appear under the existing HUD.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/setup.sh
```

Report the script's output to the user as-is. Remind them to restart Claude Code for the status line change to apply.
