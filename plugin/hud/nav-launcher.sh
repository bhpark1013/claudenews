#!/bin/bash
# Stable claudenews nav launcher. Installed to ~/.claude/hud/claudenews-nav by
# `/claudenews:nav on`. Resolves the NEWEST installed plugin version at runtime
# and runs show-news.py in --nav mode, so the path the Hammerspoon tap calls
# never changes across plugin updates.
#
# Usage: claudenews-nav next|prev
BASE="$HOME/.claude/plugins/cache/claudenews/claudenews"
DIR="$(ls -1 "$BASE" 2>/dev/null \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+' \
  | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
[ -n "$DIR" ] || exit 0
# Pick a real python3 (this machine's /usr/bin/python3 may be a CLT stub, and
# Hammerspoon's hs.task runs with a minimal PATH).
PY=python3
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  [ -x "$c" ] && PY="$c" && break
done
exec "$PY" "$BASE/$DIR/hooks/show-news.py" --nav "${1:-next}"
