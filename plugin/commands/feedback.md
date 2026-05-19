---
description: Send feedback, a bug report, or a feature request about claudenews to the maintainer. Triggers when the user wants to give claudenews feedback — e.g. "claudenews 피드백 보낼래", "claudenews에 건의/버그 제보할래", "send claudenews feedback", "report a claudenews bug". Confirm the message with the user before sending. No slash needed; just ask.
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
