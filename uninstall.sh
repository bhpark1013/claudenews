#!/bin/bash
# CodeEarn uninstaller
# Usage: curl -fsSL https://raw.githubusercontent.com/bhpark1013/code-earn/main/uninstall.sh | bash

set -e

PLUGIN_DIR="$HOME/.claude/plugins/marketplaces/custom/code-earn"
CONFIG_DIR="$HOME/.code-earn"
SETTINGS="$HOME/.claude/settings.json"
HUD_FILE="$HOME/.claude/hud/code-earn-hud.mjs"
FEED_CMD="$HOME/.claude/commands/feed.md"

echo ""
echo "  code-earn uninstaller"
echo "  ---------------------"
echo ""

# Remove plugin + config + command + hud wrapper
echo "  Removing plugin files..."
rm -rf "$PLUGIN_DIR"
rm -rf "$CONFIG_DIR"
rm -f "$HUD_FILE"
rm -f "$FEED_CMD"

# Patch settings.json: remove code-earn hooks and revert statusLine
if [ -f "$SETTINGS" ]; then
  echo "  Cleaning settings.json..."
  python3 - "$SETTINGS" <<'PY'
import json, sys, os, shutil

path = sys.argv[1]
shutil.copyfile(path, path + ".backup")

with open(path) as f:
    data = json.load(f)

def is_code_earn(hook_entry):
    for h in hook_entry.get("hooks", []):
        cmd = h.get("command", "")
        if "code-earn" in cmd or "show-news.py" in cmd or "clear-news.py" in cmd or "show-ad.py" in cmd or "report-session.py" in cmd:
            return True
    return False

hooks = data.get("hooks", {})
for event in ["UserPromptSubmit", "Stop"]:
    if event in hooks:
        hooks[event] = [e for e in hooks[event] if not is_code_earn(e)]
        if not hooks[event]:
            del hooks[event]

# Revert statusLine if it points to code-earn wrapper
sl = data.get("statusLine", {})
if "code-earn-hud" in sl.get("command", ""):
    sl["command"] = "node /Users/park/.claude/hud/omc-hud.mjs"
    data["statusLine"] = sl

with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("    Cleaned. Backup saved to settings.json.backup")
PY
fi

echo ""
echo "  Done. Restart Claude Code to apply."
echo ""
