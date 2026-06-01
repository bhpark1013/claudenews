#!/bin/bash
# claudenews statusLine teardown
# Runs via /claudenews:teardown slash command. Idempotent.

set -e

DST_HUD="$HOME/.claude/hud/claudenews-hud.mjs"
SETTINGS="$HOME/.claude/settings.json"
OMC_HUD="$HOME/.claude/hud/omc-hud.mjs"

rm -f "$DST_HUD"

if [ -f "$SETTINGS" ]; then
  python3 - "$SETTINGS" "$OMC_HUD" <<'PY'
import json, sys, shutil, os
path, fallback = sys.argv[1], sys.argv[2]
shutil.copyfile(path, path + ".backup")
with open(path) as f:
    data = json.load(f)
current = data.get("statusLine", {}).get("command", "")
if "claudenews-hud" in current:
    if os.path.exists(fallback):
        data["statusLine"] = {"type": "command", "command": f"node {fallback}"}
        print(f"  statusLine reverted to OMC HUD")
    else:
        data.pop("statusLine", None)
        print("  statusLine removed (no OMC HUD found)")
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
else:
    print("  statusLine already clean — no change")
PY
fi

# Anonymous uninstall ping — sent BEFORE we delete the config so the
# install id is still available. The server only flips this id from the
# "installed" set to the "uninstalled" set; no other data is sent or stored.
UNINSTALL_INFO=$(python3 -c "
import json, os
p = os.path.expanduser('~/.claudenews/config.json')
d = json.load(open(p)) if os.path.exists(p) else {}
print(d.get('installId') or '')
print(d.get('apiUrl') or 'https://web-olive-three-47.vercel.app')
" 2>/dev/null)
UNINSTALL_ID=$(printf '%s\n' "$UNINSTALL_INFO" | sed -n '1p')
UNINSTALL_API=$(printf '%s\n' "$UNINSTALL_INFO" | sed -n '2p')
if [ -n "$UNINSTALL_ID" ]; then
  curl -s -m 3 "${UNINSTALL_API}/api/ping?id=${UNINSTALL_ID}&event=uninstall" >/dev/null 2>&1 || true
fi

# Clean runtime state
rm -rf "$HOME/.claudenews"

echo ""
echo "  Done. You can now /plugin remove claudenews if you want to fully uninstall."
