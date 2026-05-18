#!/bin/bash
# List / toggle news sources.
# Usage: list.sh            -> show all sources + on/off
#        list.sh <source>   -> toggle that source

set -e
CONFIG_DIR="$HOME/.claudenews"
CONFIG_FILE="$CONFIG_DIR/config.json"
SOURCES_CACHE="$CONFIG_DIR/.sources-cache.json"
mkdir -p "$CONFIG_DIR"
ARG="${1:-}"

python3 - "$CONFIG_FILE" "$SOURCES_CACHE" "$ARG" <<'PY'
import json, sys, os, subprocess, urllib.request

cfg_path, cache_path, arg = sys.argv[1], sys.argv[2], sys.argv[3].strip().lower()
DEFAULT_API = "https://web-olive-three-47.vercel.app"

def load(p):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return {}

cfg = load(cfg_path) or {}
api = cfg.get("apiUrl", DEFAULT_API)

catalog = []
try:
    if os.path.exists(cache_path):
        catalog = json.load(open(cache_path))
except Exception:
    catalog = []
if not catalog:
    try:
        with urllib.request.urlopen(api + "/api/sources", timeout=4) as r:
            catalog = (json.loads(r.read()) or {}).get("sources") or []
        if catalog:
            json.dump(catalog, open(cache_path, "w"))
    except Exception:
        catalog = []
if not catalog:
    catalog = [
        {"id": "hn", "name": "Hacker News", "defaultOn": True},
        {"id": "github", "name": "GitHub Trending", "defaultOn": True},
    ]

def detect_lang():
    if sys.platform == "darwin":
        try:
            o = subprocess.run(["defaults", "read", "-g", "AppleLocale"],
                               capture_output=True, text=True, timeout=2)
            if o.returncode == 0:
                c = o.stdout.strip().split("_")[0].split("-")[0].lower()
                if c and c != "c":
                    return c
        except Exception:
            pass
    for v in ("LANG", "LC_ALL", "LC_MESSAGES"):
        val = os.environ.get(v, "")
        if val:
            c = val.split(".")[0].split("_")[0].lower()
            if c and c != "c":
                return c
    return "en"

ids = [s["id"] for s in catalog]
names = {s["id"]: s.get("name", s["id"]) for s in catalog}

sel = cfg.get("sources")
if not isinstance(sel, dict) or not sel:
    lang = detect_lang()
    sel = {}
    for s in catalog:
        on = bool(s.get("defaultOn"))
        if not on and lang in (s.get("defaultOnLangs") or []):
            on = True
        sel[s["id"]] = on

if arg and arg in ids:
    sel[arg] = not sel.get(arg, False)
    cfg["sources"] = sel
    cfg["sourcesConfigured"] = True
    with open(cfg_path, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  {names[arg]} -> {'ON' if sel[arg] else 'OFF'}")
    enabled = [i for i in ids if sel.get(i)]
    print(f"  Active: {', '.join(enabled) or '(none)'}")
elif arg:
    print(f"  Unknown source: {arg}")
    print(f"  Available: {', '.join(ids)}")
else:
    print("  News sources  (/claudenews:list <id> to toggle):")
    for s in catalog:
        i = s["id"]
        mark = "[x]" if sel.get(i) else "[ ]"
        print(f"   {mark} {i:10s} {names.get(i, '')}")
    print(f"  Config: {cfg_path}")
PY
