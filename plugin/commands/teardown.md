---
description: Remove claudenews status line wiring (does not uninstall the plugin itself)
allowed-tools: Bash(bash:*)
---

Roll back the status line wiring that `/claudenews:setup` created. Use this before `/plugin remove claudenews` for a clean uninstall.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/teardown.sh
```

Report the script's output. Remind them to restart Claude Code for the status line revert to apply.
