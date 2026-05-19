#!/bin/bash
# News-source management.
#   list.sh             -> interactive picker in a split pane / new window
#   list.sh <source>    -> quick toggle that one source (no UI)
#   list.sh text        -> plain text list (no UI), for non-TTY contexts
#
# The picker needs a real terminal, but a slash command's stdout is captured
# by Claude Code with no controlling TTY — so (like /claudenews:viewer) we
# launch it in a tmux/cmux/wezterm/kitty/iTerm split or a new Terminal window.
# If none is available we fall back to the plain text list.

set -e
CONFIG_DIR="$HOME/.claudenews"
CONFIG_FILE="$CONFIG_DIR/config.json"
SOURCES_CACHE="$CONFIG_DIR/.sources-cache.json"
mkdir -p "$CONFIG_DIR"
ARG="${1:-}"

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PICKER="$PLUGIN_ROOT/commands/picker.py"

print_text_list() {
  python3 - "$CONFIG_FILE" "$SOURCES_CACHE" <<'PY'
import json, sys, os, subprocess, urllib.request
cfg_path, cache_path = sys.argv[1], sys.argv[2]
DEFAULT_API = "https://web-olive-three-47.vercel.app"
def load(p):
    try:
        with open(p) as f: return json.load(f)
    except Exception: return {}
cfg = load(cfg_path) or {}
api = cfg.get("apiUrl", DEFAULT_API)
catalog = []
try:
    if os.path.exists(cache_path): catalog = json.load(open(cache_path))
except Exception: catalog = []
if not catalog:
    try:
        with urllib.request.urlopen(api + "/api/sources", timeout=4) as r:
            catalog = (json.loads(r.read()) or {}).get("sources") or []
        if catalog: json.dump(catalog, open(cache_path, "w"))
    except Exception: catalog = []
if not catalog:
    catalog = [{"id":"hn","name":"Hacker News","defaultOn":True},
               {"id":"github","name":"GitHub Trending","defaultOn":True}]
def detect_lang():
    if sys.platform == "darwin":
        try:
            o = subprocess.run(["defaults","read","-g","AppleLocale"],
                               capture_output=True, text=True, timeout=2)
            if o.returncode == 0:
                c = o.stdout.strip().split("_")[0].split("-")[0].lower()
                if c and c != "c": return c
        except Exception: pass
    for v in ("LANG","LC_ALL","LC_MESSAGES"):
        val = os.environ.get(v, "")
        if val:
            c = val.split(".")[0].split("_")[0].lower()
            if c and c != "c": return c
    return "en"
sel = cfg.get("sources")
if not isinstance(sel, dict) or not sel:
    lang = detect_lang(); sel = {}
    for s in catalog:
        on = bool(s.get("defaultOn"))
        if not on and lang in (s.get("defaultOnLangs") or []): on = True
        sel[s["id"]] = on
print("  News sources  (/claudenews:list <id> to toggle, no arg = picker):")
for s in catalog:
    i = s["id"]
    mark = "[x]" if sel.get(i) else "[ ]"
    print(f"   {mark} {i:10s} {s.get('name','')}")
print(f"  Config: {cfg_path}")
PY
}

toggle_one() {
  python3 - "$CONFIG_FILE" "$SOURCES_CACHE" "$1" <<'PY'
import json, sys, os, subprocess, urllib.request
cfg_path, cache_path, arg = sys.argv[1], sys.argv[2], sys.argv[3].strip().lower()
DEFAULT_API = "https://web-olive-three-47.vercel.app"
def load(p):
    try:
        with open(p) as f: return json.load(f)
    except Exception: return {}
cfg = load(cfg_path) or {}
api = cfg.get("apiUrl", DEFAULT_API)
catalog = []
try:
    if os.path.exists(cache_path): catalog = json.load(open(cache_path))
except Exception: catalog = []
if not catalog:
    try:
        with urllib.request.urlopen(api + "/api/sources", timeout=4) as r:
            catalog = (json.loads(r.read()) or {}).get("sources") or []
        if catalog: json.dump(catalog, open(cache_path, "w"))
    except Exception: catalog = []
if not catalog:
    catalog = [{"id":"hn","name":"Hacker News","defaultOn":True},
               {"id":"github","name":"GitHub Trending","defaultOn":True}]
def detect_lang():
    if sys.platform == "darwin":
        try:
            o = subprocess.run(["defaults","read","-g","AppleLocale"],
                               capture_output=True, text=True, timeout=2)
            if o.returncode == 0:
                c = o.stdout.strip().split("_")[0].split("-")[0].lower()
                if c and c != "c": return c
        except Exception: pass
    for v in ("LANG","LC_ALL","LC_MESSAGES"):
        val = os.environ.get(v, "")
        if val:
            c = val.split(".")[0].split("_")[0].lower()
            if c and c != "c": return c
    return "en"
ids = [s["id"] for s in catalog]
names = {s["id"]: s.get("name", s["id"]) for s in catalog}
sel = cfg.get("sources")
if not isinstance(sel, dict) or not sel:
    lang = detect_lang(); sel = {}
    for s in catalog:
        on = bool(s.get("defaultOn"))
        if not on and lang in (s.get("defaultOnLangs") or []): on = True
        sel[s["id"]] = on
if arg in ids:
    sel[arg] = not sel.get(arg, False)
    cfg["sources"] = sel
    cfg["sourcesConfigured"] = True
    with open(cfg_path, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False); f.write("\n")
    print(f"  {names[arg]} -> {'ON' if sel[arg] else 'OFF'}")
    enabled = [i for i in ids if sel.get(i)]
    print(f"  Active: {', '.join(enabled) or '(none)'}")
else:
    print(f"  Unknown source: {arg}")
    print(f"  Available: {', '.join(ids)}")
PY
}

# --- explicit text mode ---
if [ "$ARG" = "text" ] || [ "$ARG" = "list" ]; then
  print_text_list
  exit 0
fi

# --- quick single-source toggle (non-interactive) ---
if [ -n "$ARG" ]; then
  toggle_one "$ARG"
  exit 0
fi

# --- no arg: launch the interactive picker in a split / window ---
if [ ! -f "$PICKER" ]; then
  print_text_list
  exit 0
fi

if [ -n "$TMUX" ]; then
  tmux split-window -h -p 40 "python3 '$PICKER'"
  tmux select-pane -L
  echo "  Opened the source picker in a tmux split (↑↓ move · space toggle · enter save · q cancel)"
  exit 0
fi

if [ -n "$CMUX_SOCKET" ] && command -v cmux >/dev/null 2>&1; then
  split_out=$(cmux new-split right 2>&1) || split_out=""
  surface_ref=$(echo "$split_out" | grep -oE 'surface:[0-9]+' | head -1)
  if [ -n "$surface_ref" ]; then
    cmux send --surface "$surface_ref" "python3 '$PICKER'
" >/dev/null 2>&1
    echo "  Opened the source picker in a cmux split (↑↓ move · space toggle · enter save · q cancel)"
    exit 0
  fi
fi

if [ -n "$WEZTERM_PANE" ] && command -v wezterm >/dev/null 2>&1; then
  wezterm cli split-pane --right --percent 40 -- python3 "$PICKER" >/dev/null
  echo "  Opened the source picker in a WezTerm split (↑↓ move · space toggle · enter save · q cancel)"
  exit 0
fi

if [ -n "$KITTY_WINDOW_ID" ] && command -v kitty >/dev/null 2>&1; then
  if kitty @ launch --type=window --location=vsplit --no-response --keep-focus python3 "$PICKER" >/dev/null 2>&1; then
    echo "  Opened the source picker in a Kitty split (↑↓ move · space toggle · enter save · q cancel)"
    exit 0
  fi
fi

if [ "$TERM_PROGRAM" = "iTerm.app" ]; then
  osascript <<EOF >/dev/null
tell application "iTerm"
  tell current session of current window
    set newSession to (split vertically with default profile)
    tell newSession
      write text "python3 '$PICKER'"
    end tell
  end tell
end tell
EOF
  echo "  Opened the source picker in an iTerm2 split (↑↓ move · space toggle · enter save · q cancel)"
  exit 0
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  osascript <<EOF >/dev/null
tell application "Terminal"
  do script "python3 '$PICKER'"
  activate
end tell
EOF
  echo "  Opened the source picker in a new Terminal window (↑↓ move · space toggle · enter save · q cancel)"
  exit 0
fi

# No terminal we can drive — fall back to text + per-id toggle.
print_text_list
echo "  (no splittable terminal detected — use /claudenews:list <id> to toggle)"
