#!/bin/bash
# News-source management (explicit, no windows).
#   list.sh                 -> inline list of every source with on/off state
#   list.sh <id> [<id>...]  -> toggle one or more sources by id
#
# The inline list is the menu: it shows every source id + flag + on/off,
# so you see exactly what you can pick and how. Toggle by id explicitly.
# (You can also just ask Claude in chat — that's a convenience, but the
# explicit list/ids above are the source of truth.)

set -e
CONFIG_DIR="$HOME/.claudenews"
CONFIG_FILE="$CONFIG_DIR/config.json"
SOURCES_CACHE="$CONFIG_DIR/.sources-cache.json"
mkdir -p "$CONFIG_DIR"

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
print("  News sources  —  toggle with: /claudenews:list <id> [<id>...]")
for s in catalog:
    i = s["id"]
    mark = "[x]" if sel.get(i) else "[ ]"
    print(f"   {mark} {i:10s} {s.get('name','')}")
print(f"  Config: {cfg_path}")
PY
}

toggle_ids() {
  python3 - "$CONFIG_FILE" "$SOURCES_CACHE" "$@" <<'PY'
import json, sys, os, subprocess, urllib.request
cfg_path, cache_path = sys.argv[1], sys.argv[2]
args = [a.strip().lower() for a in sys.argv[3:] if a.strip()]
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
known = [a for a in args if a in ids]
unknown = [a for a in args if a not in ids]
for a in known:
    sel[a] = not sel.get(a, False)
if known:
    cfg["sources"] = sel
    cfg["sourcesConfigured"] = True
    with open(cfg_path, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False); f.write("\n")
    for a in known:
        print(f"  {names[a]} -> {'ON' if sel[a] else 'OFF'}")
if unknown:
    print(f"  Unknown: {', '.join(unknown)}")
    print(f"  Available: {', '.join(ids)}")
if known:
    enabled = [i for i in ids if sel.get(i)]
    print(f"  Active: {', '.join(enabled) or '(none)'}")
PY
}

# No args (or explicit text/list) -> show the full inline menu.
if [ "$#" -eq 0 ] || [ "$1" = "text" ] || [ "$1" = "list" ]; then
  print_text_list
  exit 0
fi

# One or more ids -> toggle each.
toggle_ids "$@"
