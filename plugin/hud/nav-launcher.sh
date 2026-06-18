#!/bin/bash
# Stable claudenews nav launcher. Installed to ~/.claude/hud/claudenews-nav by
# `/claudenews:nav on`. Resolves the NEWEST installed plugin version at runtime
# and runs show-news.py in --nav mode, so the path the Hammerspoon tap calls
# never changes across plugin updates.
#
# Marketplace-agnostic: scans every cache/<marketplace>/claudenews/<ver> so an
# install from a renamed/forked marketplace (e.g. claudenews-pr) works too —
# not just the canonical "claudenews" marketplace.
#
# Usage: claudenews-nav next|prev
CACHE="$HOME/.claude/plugins/cache"
ver_ge() { # true if $1 >= $2 (semver-ish numeric compare)
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)" = "$1" ]
}
BEST=""; BESTPATH=""
for f in "$CACHE"/*/claudenews/*/hooks/show-news.py; do
  [ -f "$f" ] || continue
  ver="$(basename "$(dirname "$(dirname "$f")")")"
  case "$ver" in [0-9]*.[0-9]*.[0-9]*) ;; *) continue ;; esac
  if [ -z "$BEST" ] || ver_ge "$ver" "$BEST"; then BEST="$ver"; BESTPATH="$f"; fi
done
[ -n "$BESTPATH" ] || exit 0
# Pick a real python3 (this machine's /usr/bin/python3 may be a CLT stub, and
# Hammerspoon's hs.task runs with a minimal PATH).
PY=python3
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  [ -x "$c" ] && PY="$c" && break
done
exec "$PY" "$BESTPATH" --nav "${1:-next}"
