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

# Anonymous install ping. We generate a random install id (a UUID — NOT an
# IP, user-agent, or anything tied to identity) and store it locally. It
# only lets the server de-duplicate reinstalls and detect uninstalls; the
# server stores nothing else. Best-effort: offline just skips. The id is
# persisted even when offline so the matching uninstall ping can find it.
INSTALL_INFO=$(python3 -c "
import json, os, uuid
p = os.path.expanduser('~/.claudenews/config.json')
d = json.load(open(p)) if os.path.exists(p) else {}
if not d.get('installId'):
    d['installId'] = str(uuid.uuid4())
api = d.get('apiUrl') or 'https://web-olive-three-47.vercel.app'
pinged = '1' if d.get('pinged') else ''
os.makedirs(os.path.dirname(p), exist_ok=True)
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
print(d['installId']); print(api); print(pinged)
" 2>/dev/null)
INSTALL_ID=$(printf '%s\n' "$INSTALL_INFO" | sed -n '1p')
PING_API=$(printf '%s\n' "$INSTALL_INFO" | sed -n '2p')
PINGED=$(printf '%s\n' "$INSTALL_INFO" | sed -n '3p')
if [ -z "$PINGED" ] && [ -n "$INSTALL_ID" ]; then
  curl -s -m 3 "${PING_API}/api/ping?id=${INSTALL_ID}" >/dev/null 2>&1 || true
  python3 -c "
import json, os
p = os.path.expanduser('~/.claudenews/config.json')
d = json.load(open(p)) if os.path.exists(p) else {}
d['pinged'] = True
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
" 2>/dev/null || true
fi

echo ""
echo "  Done. Restart Claude Code for the status line to take effect."
