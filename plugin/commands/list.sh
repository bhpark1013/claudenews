#!/bin/bash
# News-source management (explicit, no windows).
#   list.sh                 -> inline list of every source with on/off state
#   list.sh <id> [<id>...]  -> toggle one or more sources by id
#   list.sh add r/<sub>     -> add your own feed (subreddit, or any RSS/Atom URL)
#   list.sh rmfeed <match>  -> remove one of your own feeds
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
            d = json.loads(r.read()) or {}
            catalog = (d.get("sources") or []) + (d.get("customFeeds") or [])
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
builtin = [s for s in catalog if not s.get("custom")]
custom = [s for s in catalog if s.get("custom")]
for s in builtin:
    i = s["id"]
    mark = "[x]" if sel.get(i) else "[ ]"
    print(f"   {mark} {i:10s} {s.get('name','')}")
if custom:
    on = [s for s in custom if sel.get(s["id"])]
    off = [s for s in custom if not sel.get(s["id"])]
    print("  Community feeds (registered by users, served by the backend):")
    for s in on:
        print(f"   [x] {s['id']:14s} {s.get('name','')}  {s.get('url','')}")
    MAX_OFF = 12
    for s in off[:MAX_OFF]:
        print(f"   [ ] {s['id']:14s} {s.get('name','')}")
    if len(off) > MAX_OFF:
        print(f"       … {len(off) - MAX_OFF} more (see {api}/api/feeds)")
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
            d = json.loads(r.read()) or {}
            catalog = (d.get("sources") or []) + (d.get("customFeeds") or [])
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

# Add your own feed: registered in the backend's shared registry (so it is
# fetched server-side once for everyone and gets a public source id), then
# enabled for this machine. Only if the backend cannot fetch the URL does it
# fall back to a client feed (config.json clientFeeds, fetched locally).
add_feed() {
  python3 - "$CONFIG_FILE" "$SOURCES_CACHE" "$@" <<'PY'
import json, sys, os, urllib.request, urllib.error
cfg_path, cache_path = sys.argv[1], sys.argv[2]
arg = (sys.argv[3] if len(sys.argv) > 3 else "").strip()
name_override = " ".join(sys.argv[4:]).strip()
DEFAULT_API = "https://web-olive-three-47.vercel.app"
try:
    cfg = json.load(open(cfg_path))
    if not isinstance(cfg, dict): cfg = {}
except Exception:
    cfg = {}
api = cfg.get("apiUrl", DEFAULT_API)
low = arg.lower()
url = name = None
if low.startswith("r/") or low.startswith("/r/"):
    sub = arg.split("r/", 1)[1].strip("/")
    if sub:
        url = "https://www.reddit.com/r/%s/.rss" % sub
        name = name_override or ("\U0001F47D r/%s" % sub)
elif low.startswith("http://") or low.startswith("https://"):
    url = arg
    name = name_override or arg.split("//", 1)[1].split("/")[0]
if not url:
    print("  Usage: /claudenews:list add r/<subreddit>   (or a full RSS/Atom URL)")
    print("  e.g.   /claudenews:list add r/rust")
    sys.exit(0)

def save(c):
    with open(cfg_path, "w") as f:
        json.dump(c, f, indent=2, ensure_ascii=False); f.write("\n")

feed, err, unreachable = None, None, False
try:
    body = json.dumps({"url": url, "name": name}).encode()
    req = urllib.request.Request(api + "/api/feeds", data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read()) or {}
    feed = d.get("feed") if d.get("ok") else None
    err = d.get("error")
except urllib.error.HTTPError as e:
    try: d = json.loads(e.read()) or {}
    except Exception: d = {}
    err = d.get("error") or ("http %s" % e.code)
    unreachable = bool(d.get("unreachable"))
except Exception as e:
    err = "backend unreachable (%s)" % e

if feed:
    sel = cfg.get("sources") if isinstance(cfg.get("sources"), dict) else {}
    sel[feed["id"]] = True
    cfg["sources"] = sel
    cfg["sourcesConfigured"] = True
    # Drop a legacy client-side copy of the same feed, if any.
    cf = [f for f in (cfg.get("clientFeeds") or []) if not (isinstance(f, dict) and f.get("url") == url)]
    if cf: cfg["clientFeeds"] = cf
    else: cfg.pop("clientFeeds", None)
    save(cfg)
    try: os.unlink(cache_path)   # refetch the catalog so the new id shows up
    except Exception: pass
    print("  %s your feed on the backend: %s" % ("registered" if d.get("created") else "enabled", feed.get("name")))
    print("    id %s   %s" % (feed["id"], feed.get("url")))
    print("  toggle later with: /claudenews:list %s" % feed["id"])
    sys.exit(0)

if not unreachable and not str(err).startswith("backend unreachable"):
    print("  could not register feed: %s" % err)
    sys.exit(0)

# Backend can't fetch it (or is down): keep the old client-fetched path.
feeds = cfg.get("clientFeeds")
if not isinstance(feeds, list): feeds = []
if any(isinstance(f, dict) and f.get("url") == url for f in feeds):
    print("  already added (client feed): %s" % url); sys.exit(0)
feeds.append({"name": name, "url": url})
cfg["clientFeeds"] = feeds
save(cfg)
print("  backend could not fetch it (%s) — added as a client feed fetched on this machine: %s" % (err, name))
print("    %s" % url)
PY
}

remove_feed() {
  python3 - "$CONFIG_FILE" "$SOURCES_CACHE" "$@" <<'PY'
import json, sys, os
cfg_path, cache_path = sys.argv[1], sys.argv[2]
arg = (sys.argv[3] if len(sys.argv) > 3 else "").strip().lower()
try:
    cfg = json.load(open(cfg_path))
    if not isinstance(cfg, dict): cfg = {}
except Exception:
    cfg = {}
if arg.startswith("r/") or arg.startswith("/r/"):
    arg = "reddit.com/r/%s/" % arg.split("r/", 1)[1].strip("/")
if not arg:
    print("  Usage: /claudenews:list rmfeed <r/sub | cf-id | url-fragment | name>"); sys.exit(0)
try: catalog = json.load(open(cache_path)) if os.path.exists(cache_path) else []
except Exception: catalog = []
sel = cfg.get("sources") if isinstance(cfg.get("sources"), dict) else {}
changed = 0
# Community feeds are shared — "removing" one just turns it off for you.
for s in catalog:
    if not s.get("custom") or not sel.get(s["id"]): continue
    hay = " ".join([s["id"], s.get("url", ""), s.get("name", "")]).lower()
    if arg in hay:
        sel[s["id"]] = False; changed += 1
        print("  turned off: %s (%s)" % (s.get("name", ""), s["id"]))
if changed:
    cfg["sources"] = sel
# Legacy client feeds are private to this machine — delete outright.
feeds = cfg.get("clientFeeds")
if isinstance(feeds, list) and feeds:
    kept = [f for f in feeds if not (isinstance(f, dict) and
            (arg in (f.get("url", "").lower()) or arg in (f.get("name", "").lower())))]
    n = len(feeds) - len(kept)
    if n:
        changed += n
        if kept: cfg["clientFeeds"] = kept
        else: cfg.pop("clientFeeds", None)
        print("  removed %d client feed(s) matching '%s'" % (n, arg))
if not changed:
    print("  no feed matched: %s" % arg); sys.exit(0)
with open(cfg_path, "w") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False); f.write("\n")
PY
}

print_client_feeds() {
  python3 - "$CONFIG_FILE" <<'PY'
import json, sys
try:
    cfg = json.load(open(sys.argv[1]))
except Exception:
    cfg = {}
feeds = (cfg or {}).get("clientFeeds") or []
if isinstance(feeds, list) and feeds:
    print("  Client feeds (backend can't reach these; fetched on this machine):")
    for f in feeds:
        if isinstance(f, dict):
            print("     - %s  %s" % (f.get("name", ""), f.get("url", "")))
print("  Add your own:  /claudenews:list add r/<subreddit>   (or any RSS URL)")
print("  Turn one off:  /claudenews:list rmfeed <id | r/sub | url-fragment>")
PY
}

# Best-effort: warm a freshly added feed so it shows promptly (no-op offline).
warm_feeds() {
  [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "$CLAUDE_PLUGIN_ROOT/hooks/show-news.py" ] || return 0
  local py=python3 c
  for c in /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    [ -x "$c" ] && py="$c" && break
  done
  ( "$py" "$CLAUDE_PLUGIN_ROOT/hooks/show-news.py" --feeds-refresh >/dev/null 2>&1 & ) || true
}

# Dispatch.
case "${1:-}" in
  ""|text|list)
    print_text_list
    print_client_feeds
    ;;
  add)
    shift
    add_feed "$@"
    warm_feeds
    ;;
  rmfeed|remove-feed)
    shift
    remove_feed "$@"
    ;;
  *)
    # One or more ids -> toggle each.
    toggle_ids "$@"
    ;;
esac
