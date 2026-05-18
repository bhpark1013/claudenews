---
description: Update claudenews in one step (pull marketplace, refresh cache + status-line launcher)
allowed-tools: Bash(bash:*)
---

Update claudenews to the latest version.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/update.sh
```

Report the script output verbatim, then remind the user to run
`/reload-plugins` to activate the updated hooks and commands.
