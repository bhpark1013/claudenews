#!/bin/bash
# CodeEarn uninstaller
# Usage: curl -fsSL https://raw.githubusercontent.com/bhpark1013/claudenews/main/uninstall.sh | bash

set -e

PLUGIN_DIR="$HOME/.claude/plugins/marketplaces/custom/claudenews"
CONFIG_DIR="$HOME/.claudenews"
SETTINGS="$HOME/.claude/settings.json"
HUD_FILE="$HOME/.claude/hud/claudenews-hud.mjs"
FEED_CMD="$HOME/.claude/commands/feed.md"

echo ""
echo "  claudenews uninstaller"
echo "  ---------------------"
echo ""

# Remove plugin + config + command + hud wrapper
echo "  Removing plugin files..."
rm -rf "$PLUGIN_DIR"
rm -rf "$CONFIG_DIR"
rm -f "$HUD_FILE"
rm -f "$FEED_CMD"

# Patch settings.json: remove claudenews hooks and revert statusLine
if [ -f "$SETTINGS" ]; then
  echo "  Cleaning settings.json..."
  python3 - "$SETTINGS" <<'PY'
import json, sys, os, shutil

path = sys.argv[1]
backup_path = path + ".backup"

# Read the install-time backup BEFORE we overwrite it, so we can restore the
# statusLine the user had before claudenews took over.
install_backup_sl = None
if os.path.exists(backup_path):
    try:
        with open(backup_path) as f:
            backup_data = json.load(f)
        candidate = (backup_data or {}).get("statusLine")
        if (
            isinstance(candidate, dict)
            and "claudenews-hud" not in (candidate.get("command") or "")
        ):
            install_backup_sl = candidate
    except Exception:
        pass

shutil.copyfile(path, backup_path)

with open(path) as f:
    data = json.load(f)

def is_code_earn(hook_entry):
    for h in hook_entry.get("hooks", []):
        cmd = h.get("command", "")
        if "claudenews" in cmd or "show-news.py" in cmd or "clear-news.py" in cmd or "show-ad.py" in cmd or "report-session.py" in cmd:
            return True
    return False

hooks = data.get("hooks", {})
for event in ["UserPromptSubmit", "Stop"]:
    if event in hooks:
        hooks[event] = [e for e in hooks[event] if not is_code_earn(e)]
        if not hooks[event]:
            del hooks[event]

# Revert statusLine only if it still points at our wrapper. Prefer the
# pre-install backup; otherwise drop the key so Claude Code falls back to
# its default status line.
sl = data.get("statusLine", {})
if isinstance(sl, dict) and "claudenews-hud" in (sl.get("command") or ""):
    if install_backup_sl is not None:
        data["statusLine"] = install_backup_sl
    else:
        data.pop("statusLine", None)

with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("    Cleaned. Backup saved to settings.json.backup")
PY
fi

echo ""
echo "  Done. Restart Claude Code to apply."
echo ""
