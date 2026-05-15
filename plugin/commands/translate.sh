#!/bin/bash
# Toggle / configure claudenews translation.
# Usage: translate.sh [on|off|<lang-code>]

set -e

CONFIG_DIR="$HOME/.claudenews"
CONFIG_FILE="$CONFIG_DIR/config.json"

mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "{}" > "$CONFIG_FILE"
fi

ARG="${1:-}"

python3 - "$CONFIG_FILE" "$ARG" <<'PY'
import json, sys, os, locale

path, arg = sys.argv[1], sys.argv[2].strip().lower()

with open(path) as f:
    cfg = json.load(f)

current = cfg.get("translate", True)
current_lang = cfg.get("translateLang") or (locale.getdefaultlocale()[0] or "en").split("_")[0].lower()

lang_codes = {"ko", "ja", "zh", "es", "fr", "de", "en", "pt", "ru", "it", "vi", "th", "id", "tr", "pl"}

if arg == "":
    cfg["translate"] = not current
    action = "enabled" if cfg["translate"] else "disabled"
elif arg in ("on", "enable", "true", "1"):
    cfg["translate"] = True
    action = "enabled"
elif arg in ("off", "disable", "false", "0"):
    cfg["translate"] = False
    action = "disabled"
elif arg in lang_codes:
    cfg["translate"] = True
    cfg["translateLang"] = arg
    action = f"enabled (lang={arg})"
else:
    print(f"  Unknown arg: {arg}")
    print(f"  Current: translate={current}, lang={current_lang}")
    sys.exit(0)

with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")

lang = cfg.get("translateLang") or current_lang
print(f"  Translation {action}")
if cfg.get("translate"):
    print(f"  Target language: {lang}")
print(f"  Config: {path}")
PY

# Clear translation cache on disable? No, keep for re-enable. Just clear .current-news so next prompt shows fresh state.
if [ -f "$CONFIG_DIR/.current-news" ]; then
  rm -f "$CONFIG_DIR/.last_open"
fi
