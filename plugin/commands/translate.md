---
description: Toggle news title auto-translation (uses your Claude Code session, no API key)
argument-hint: "[on | off | ko | ja | en | ...]"
allowed-tools: Bash(bash:*)
---

Control news title translation.

- `/claudenews:translate` — toggle on/off
- `/claudenews:translate on` — enable
- `/claudenews:translate off` — disable
- `/claudenews:translate ko` (or `ja`, `zh`, `es`, etc.) — enable + set target language

Raw slash-command arguments: `$ARGUMENTS`

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/translate.sh $ARGUMENTS
```

Report the script output verbatim.
