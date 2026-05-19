---
description: Send feedback about claudenews to the maintainer
argument-hint: "<your feedback>"
allowed-tools: Bash(bash:*)
---

Submit feedback, a bug report, or a feature request for claudenews.

- `/claudenews:feedback <message>` — send your message

Privacy: only the message you type and the plugin version are sent.
No IP, user agent, machine info, or identifier is collected or stored.

Raw slash-command arguments: `$ARGUMENTS`

```bash
bash ${CLAUDE_PLUGIN_ROOT}/commands/feedback.sh $ARGUMENTS
```

Report the script output verbatim.
