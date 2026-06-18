#!/bin/bash
# Enable/disable claudenews key navigation (ctrl+shift+←/→ to step news).
# Usage: nav.sh [on|off|status]
#
# Only when ON does the feature install anything: a stable nav launcher and a
# Hammerspoon snippet wired into ~/.hammerspoon/init.lua. OFF removes the wiring
# and flips the flag back; per-session rotation resumes.

set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
CONFIG_DIR="$HOME/.claudenews"
CONFIG_FILE="$CONFIG_DIR/config.json"
HUD_DIR="$HOME/.claude/hud"
NAV_LAUNCHER="$HUD_DIR/claudenews-nav"
LUA_SRC="$PLUGIN_ROOT/hammerspoon/claudenews-nav.lua"
LUA_DST="$CONFIG_DIR/claudenews-nav.lua"
HS_INIT="$HOME/.hammerspoon/init.lua"

mkdir -p "$CONFIG_DIR" "$HUD_DIR"
[ -f "$CONFIG_FILE" ] || echo "{}" > "$CONFIG_FILE"

ACTION="${1:-status}"

set_flag() { # $1 = true|false
  python3 - "$CONFIG_FILE" "$1" <<'PY'
import json, sys
path, val = sys.argv[1], sys.argv[2] == "true"
try:
    cfg = json.load(open(path))
except Exception:
    cfg = {}
if not isinstance(cfg, dict):
    cfg = {}
cfg["navEnabled"] = val
json.dump(cfg, open(path, "w"), indent=2, ensure_ascii=False)
open(path, "a").write("\n")
PY
}

# Idempotently add/remove the dofile block in ~/.hammerspoon/init.lua.
manage_init() { # $1 = add|remove
  python3 - "$HS_INIT" "$LUA_DST" "$1" <<'PY'
import os, sys
init_path, lua_dst, action = sys.argv[1], sys.argv[2], sys.argv[3]
BEGIN = "-- >>> claudenews-nav >>>"
END = "-- <<< claudenews-nav <<<"
block = (
    f"{BEGIN}\n"
    f'dofile("{lua_dst}")\n'
    f"{END}\n"
)
os.makedirs(os.path.dirname(init_path), exist_ok=True)
text = ""
if os.path.exists(init_path):
    text = open(init_path).read()
# strip any existing managed block first
import re
text = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", "", text, flags=re.S)
if action == "add":
    if text and not text.endswith("\n"):
        text += "\n"
    text += block
open(init_path, "w").write(text)
PY
}

hammerspoon_installed() {
  [ -d "/Applications/Hammerspoon.app" ] || command -v hs >/dev/null 2>&1
}

case "$ACTION" in
  on)
    set_flag true
    cp "$LUA_SRC" "$LUA_DST"
    cp "$PLUGIN_ROOT/hud/nav-launcher.sh" "$NAV_LAUNCHER"
    chmod +x "$NAV_LAUNCHER"
    manage_init add
    echo "✅ claudenews key navigation ENABLED."
    echo ""
    echo "  • News is now GLOBAL: every Claude Code session shows the same item."
    echo "  • Key: ctrl+shift+←  (previous)   ctrl+shift+→  (next)"
    echo "  • Works in: iTerm2, Apple Terminal, WezTerm, kitty (others: key untouched)."
    echo ""
    if hammerspoon_installed; then
      # Auto-reload so the key tap starts immediately — no manual step.
      open -g hammerspoon://reload >/dev/null 2>&1 || true
      echo "  ✅ Hammerspoon reloaded — the key tap is starting."
      echo ""
      echo "  First time only: macOS will ask to allow Accessibility. Click"
      echo "  \"Open System Settings\" and toggle Hammerspoon ON. If no prompt appears:"
      echo "      open \"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility\""
    else
      echo "  ⚠️  Hammerspoon is NOT installed — it captures the key. Install + grant permission:"
      echo "      brew install --cask hammerspoon"
      echo "      open -a Hammerspoon          # then System Settings → Privacy → Accessibility → enable Hammerspoon"
      echo "      open -g hammerspoon://reload  # after enabling"
    fi
    echo ""
    echo "  Wired into: $HS_INIT"
    echo "  Disable anytime with:  /claudenews:nav off"
    ;;
  off)
    set_flag false
    manage_init remove
    rm -f "$NAV_LAUNCHER" "$LUA_DST"
    echo "✅ claudenews key navigation DISABLED. Per-session rotation resumes."
    echo "  Reload Hammerspoon to drop the key tap:  open -g hammerspoon://reload"
    ;;
  status)
    ENABLED=$(python3 -c "import json;print(json.load(open('$CONFIG_FILE')).get('navEnabled',False))" 2>/dev/null || echo "False")
    echo "claudenews key navigation: $([ "$ENABLED" = "True" ] && echo ON || echo OFF)"
    echo "  nav launcher : $([ -x "$NAV_LAUNCHER" ] && echo "installed ($NAV_LAUNCHER)" || echo "not installed")"
    echo "  hammerspoon  : $(hammerspoon_installed && echo "installed" || echo "NOT installed")"
    echo "  init.lua wire: $([ -f "$HS_INIT" ] && grep -q 'claudenews-nav' "$HS_INIT" && echo "present" || echo "absent")"
    echo ""
    echo "  Enable:  /claudenews:nav on    Disable:  /claudenews:nav off"
    ;;
  *)
    echo "Usage: /claudenews:nav [on|off|status]"
    ;;
esac
