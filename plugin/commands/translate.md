---
description: Set or toggle claudenews title/summary translation language. Triggers when the user wants to change the news language or turn translation on/off — e.g. "뉴스 언어 한국어로/영어로 바꿔줘", "claudenews 번역 꺼/켜줘", "set news language to ja", "stop translating the news". No slash needed; just ask.
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
