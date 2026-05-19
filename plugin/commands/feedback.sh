#!/bin/bash
# Submit user feedback to the claudenews backend.
# Usage: feedback.sh <your feedback text...>
#
# Privacy: only the message you type + plugin version are sent. No IP,
# user agent, machine info, or identifier is collected or stored.

set -e
CONFIG_DIR="$HOME/.claudenews"
CONFIG_FILE="$CONFIG_DIR/config.json"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

MSG="$*"
MSG="$(printf '%s' "$MSG" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

if [ -z "$MSG" ]; then
  echo "  Usage: /claudenews:feedback <your feedback>"
  echo "  e.g.   /claudenews:feedback the Japanese summaries are great, add more JP sources"
  echo "  Only your message + plugin version are sent — no identifiers."
  exit 0
fi

python3 - "$CONFIG_FILE" "$PLUGIN_ROOT" "$MSG" <<'PY'
import json, sys, os, urllib.request

cfg_path, plugin_root, msg = sys.argv[1], sys.argv[2], sys.argv[3]
DEFAULT_API = "https://web-olive-three-47.vercel.app"

def load(p):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return {}

cfg = load(cfg_path) or {}
api = cfg.get("apiUrl", DEFAULT_API)

version = ""
try:
    pj = os.path.join(plugin_root, ".claude-plugin", "plugin.json")
    version = (load(pj) or {}).get("version", "")
except Exception:
    pass

msg = msg.strip()[:1000]
if not msg:
    print("  Nothing to send (empty feedback).")
    sys.exit(0)

payload = json.dumps({"message": msg, "version": version}).encode("utf-8")
req = urllib.request.Request(
    api + "/api/feedback",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=8) as r:
        ok = (json.loads(r.read()) or {}).get("ok") is True
    if ok:
        print("  ✓ Feedback sent — thank you!")
        print(f"  \"{msg[:120]}{'…' if len(msg) > 120 else ''}\"")
    else:
        print("  Feedback endpoint responded but did not confirm. Try again later.")
except Exception as e:
    print(f"  Could not reach the feedback endpoint ({e.__class__.__name__}).")
    print("  Your feedback was NOT sent. Check your connection and retry.")
PY
