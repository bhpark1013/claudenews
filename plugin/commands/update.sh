#!/bin/bash
# claudenews one-step updater.
# Pulls the marketplace repo, unpacks the new version into the plugin
# cache, and refreshes the status-line launcher. Idempotent.

set -e

KM="$HOME/.claude/plugins/known_marketplaces.json"
MP=$(python3 -c "
import json
try:
    d = json.load(open('$KM'))
    print(d.get('claudenews', {}).get('installLocation', ''))
except Exception:
    print('')
" 2>/dev/null)
[ -z "$MP" ] && MP="$HOME/.claude/plugins/marketplaces/claudenews"

if [ ! -d "$MP/.git" ]; then
  echo "  claudenews marketplace not found at $MP"
  echo "  Run: /plugin marketplace add bhpark1013/claudenews"
  exit 1
fi

echo "  Updating claudenews…"
git -C "$MP" pull --ff-only --quiet origin main

VER=$(python3 -c "import json; print(json.load(open('$MP/plugin/.claude-plugin/plugin.json'))['version'])")
DST="$HOME/.claude/plugins/cache/claudenews/claudenews/$VER"
mkdir -p "$DST"
cp -R "$MP/plugin/." "$DST/"

# Re-install the thin launcher only if the status line was already set up.
HUD="$HOME/.claude/hud/claudenews-hud.mjs"
if [ -f "$MP/plugin/hud/launcher.mjs" ] && [ -f "$HUD" ]; then
  cp "$MP/plugin/hud/launcher.mjs" "$HUD"
fi

echo "  Updated to v$VER (cache refreshed, launcher current)."
echo ""
echo "  Next: run /reload-plugins to activate the new hooks & commands."
echo "  (Status line picks up the new version automatically — no"
echo "   /claudenews:setup needed thanks to the launcher.)"
