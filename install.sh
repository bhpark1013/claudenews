#!/bin/bash
# CodeEarn post-install helper
# Sets up the status line wrapper (the plugin system handles hooks/commands, but
# statusLine is a Claude Code global config that plugins can't modify directly).
# Usage: curl -fsSL https://raw.githubusercontent.com/bhpark1013/code-earn/main/install.sh | bash

set -e

HUD_DIR="$HOME/.claude/hud"
HUD_FILE="$HUD_DIR/code-earn-hud.mjs"
SETTINGS="$HOME/.claude/settings.json"
RAW_BASE="https://raw.githubusercontent.com/bhpark1013/code-earn/main"

echo ""
echo "  code-earn — status line wrapper setup"
echo "  --------------------------------------"
echo ""

# Verify plugin is installed
PLUGIN_DIR_PATTERN="$HOME/.claude/plugins"
if [ ! -d "$PLUGIN_DIR_PATTERN" ]; then
  echo "  Warning: Claude Code plugins directory not found."
  echo "  Install the plugin first: /plugin marketplace add bhpark1013/code-earn && /plugin install code-earn"
  echo ""
fi

# Download HUD wrapper
echo "  Installing status line wrapper..."
mkdir -p "$HUD_DIR"
curl -fsSL "$RAW_BASE/plugin/hud/code-earn-hud.mjs" -o "$HUD_FILE"
chmod +x "$HUD_FILE"

# Patch statusLine in settings.json (preserve existing commands, add our wrapper)
if [ -f "$SETTINGS" ]; then
  echo "  Configuring statusLine..."
  python3 - "$SETTINGS" "$HUD_FILE" <<'PY'
import json, sys, shutil

path = sys.argv[1]
hud_path = sys.argv[2]
shutil.copyfile(path, path + ".backup")

with open(path) as f:
    data = json.load(f)

current = data.get("statusLine", {})
current_cmd = current.get("command", "")

# Only patch if not already pointing at our wrapper
if "code-earn-hud" not in current_cmd:
    data["statusLine"] = {"type": "command", "command": f"node {hud_path}"}

with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
fi

echo ""
echo "  Done."
echo ""
echo "  Next:"
echo "    1. If not installed yet, run inside Claude Code:"
echo "         /plugin marketplace add bhpark1013/code-earn"
echo "         /plugin install code-earn@code-earn"
echo "    2. Restart Claude Code."
echo ""
