#!/bin/bash
# claudenews statusLine wiring
# Runs via /claudenews:setup slash command. Idempotent.
#
# If the user already has a statusLine command pointing at something else
# (e.g. OMC HUD, a custom script), it is preserved by writing it to
# ~/.claudenews/config.json under `parentStatusLine` so the news HUD can
# chain it instead of replacing it.

set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# Install the thin launcher (not the hud body). The launcher resolves the
# newest installed plugin version's hud at runtime, so future plugin
# updates need no /claudenews:setup re-run.
SRC_HUD="$PLUGIN_ROOT/hud/launcher.mjs"
DST_HUD_DIR="$HOME/.claude/hud"
DST_HUD="$DST_HUD_DIR/claudenews-hud.mjs"
SETTINGS="$HOME/.claude/settings.json"
CONFIG_DIR="$HOME/.claudenews"
CONFIG_FILE="$CONFIG_DIR/config.json"

if [ ! -f "$SRC_HUD" ]; then
  echo "  Error: launcher not found at $SRC_HUD"
  exit 1
fi

mkdir -p "$DST_HUD_DIR" "$CONFIG_DIR"
cp "$SRC_HUD" "$DST_HUD"
chmod +x "$DST_HUD"

if [ -f "$SETTINGS" ]; then
  python3 - "$SETTINGS" "$DST_HUD" "$CONFIG_FILE" <<'PY'
import json, sys, shutil, os

settings_path, hud, config_path = sys.argv[1], sys.argv[2], sys.argv[3]
shutil.copyfile(settings_path, settings_path + ".backup")

with open(settings_path) as f:
    settings = json.load(f)

current = settings.get("statusLine", {}).get("command", "")

if "claudenews-hud" in current:
    print("  statusLine already points at claudenews-hud — no change")
else:
    if current.strip():
        # Preserve the existing statusline command as the parent so the
        # news HUD can chain it.
        cfg = {}
        if os.path.exists(config_path):
            try:
                with open(config_path) as f:
                    cfg = json.load(f) or {}
            except Exception:
                cfg = {}
        cfg["parentStatusLine"] = current.strip()
        with open(config_path, "w") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"  preserved existing statusLine as parentStatusLine in {config_path}")

    settings["statusLine"] = {
        "type": "command",
        "command": f"node {hud}",
        "refreshInterval": 2,
    }
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  statusLine updated: {hud}")
PY
fi

echo ""
echo "  Done. Restart Claude Code for the status line to take effect."
