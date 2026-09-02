#!/usr/bin/env python3
"""Fetch a dev news item and write it to .current-news for the statusline to pick up."""

import glob
import json
import locale as _locale
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

from background_claude import (
    BACKGROUND_CHILD_ENV,
    atomic_write_json,
    build_background_env,
)

CONFIG_DIR = os.path.expanduser("~/.claudenews")
os.makedirs(CONFIG_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
LAST_OPEN_FILE = os.path.join(CONFIG_DIR, ".last_open")
CURRENT_NEWS_FILE = os.path.join(CONFIG_DIR, ".current-news")
LOG_FILE = os.path.join(CONFIG_DIR, "hook.log")
TRANSLATION_CACHE = os.path.join(CONFIG_DIR, ".translation-cache.json")
SUMMARY_CACHE = os.path.join(CONFIG_DIR, ".summary-cache.json")
SOURCES_CACHE = os.path.join(CONFIG_DIR, ".sources-cache.json")
GUIDES_CACHE = os.path.join(CONFIG_DIR, ".guides-cache.json")
RECENT_FILE = os.path.join(CONFIG_DIR, ".recent")
# Opt-in key-driven navigation (config.navEnabled). An ordered candidate list
# + a global cursor let ctrl+shift+←/→ step prev/next; a short pin keeps a manual
# pick from being clobbered by auto-rotation.
NEWS_LIST_FILE = os.path.join(CONFIG_DIR, ".news-list.json")
NAV_STATE_FILE = os.path.join(CONFIG_DIR, ".nav-state.json")
NAV_PIN_SEC = 300
SOURCES_TTL_SEC = 3600
GUIDES_TTL_SEC = 3600
# Global ring buffer (shared across ALL sessions): don't re-show a URL until
# this many other picks have passed. Kept global on purpose so concurrent
# sessions deprioritize each other's recently-shown items and diverge.
RECENT_MAX = 24
# Per-session .current-news.<sid> / .last_open.<sid> older than this are pruned
# each run so abandoned sessions don't leave files lying around.
SESSION_STALE_SEC = 6 * 3600
# A per-session file touched within this window counts as a LIVE session whose
# on-screen item other sessions must avoid (matches the HUD's NEWS_TTL — past
# it the item is hidden anyway, so there's nothing left to collide with).
SESSION_LIVE_SEC = 3600
TRANSLATOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "translator.py")
SUMMARIZER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "summarizer.py")

DEFAULT_API = "https://web-olive-three-47.vercel.app"
RATE_LIMIT_SEC = 30  # Reuse the current news item for 30s instead of re-fetching on every prompt


def _plugin_version():
    """This plugin's version, read from .../<ver>/plugin/.claude-plugin/plugin.json."""
    try:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(root, ".claude-plugin", "plugin.json"), encoding="utf-8") as f:
            return str((json.load(f) or {}).get("version", "")).strip()
    except Exception:
        return ""


PLUGIN_VERSION = _plugin_version()


def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def load_config():
    if not os.path.exists(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def is_rate_limited(last_open_file=LAST_OPEN_FILE):
    if not os.path.exists(last_open_file):
        return False
    try:
        with open(last_open_file, encoding="utf-8") as f:
            last = float(f.read().strip())
        return (time.time() - last) < RATE_LIMIT_SEC
    except Exception:
        return False


def save_timestamp(last_open_file=LAST_OPEN_FILE):
    with open(last_open_file, "w", encoding="utf-8") as f:
        f.write(str(time.time()))


def _sanitize_sid(sid):
    """Make a session id safe to use as a filename suffix."""
    return re.sub(r"[^A-Za-z0-9_-]", "", str(sid or ""))[:64]


def session_files(session_id):
    """Per-session (.current-news, .last_open) paths so each Claude Code
    session rotates its own item. Falls back to the shared global files when
    no session id is available (older Claude Code / no payload)."""
    if session_id:
        return (
            os.path.join(CONFIG_DIR, f".current-news.{session_id}"),
            os.path.join(CONFIG_DIR, f".last_open.{session_id}"),
        )
    return CURRENT_NEWS_FILE, LAST_OPEN_FILE


def prune_stale_session_files():
    """Remove per-session files from sessions that haven't rotated in a while
    so they don't accumulate. The shared global files have no suffix and are
    never matched; temp files (.tmp.<pid>) are skipped."""
    now = time.time()
    for pat in (".current-news.*", ".last_open.*"):
        for p in glob.glob(os.path.join(CONFIG_DIR, pat)):
            if ".tmp." in p:
                continue
            try:
                if now - os.path.getmtime(p) > SESSION_STALE_SEC:
                    os.remove(p)
            except Exception:
                pass


def other_session_urls(self_file):
    """URLs currently shown by OTHER live sessions, so a rotating session can
    avoid them and two panes never display the same headline. "Live" = the
    per-session file was touched within SESSION_LIVE_SEC; stale ones are
    ignored (and pruned separately). The shared global file (no suffix) isn't
    matched by the glob, so it never constrains a session's pick."""
    urls = set()
    now = time.time()
    for p in glob.glob(os.path.join(CONFIG_DIR, ".current-news.*")):
        if ".tmp." in p or p == self_file:
            continue
        try:
            if now - os.path.getmtime(p) > SESSION_LIVE_SEC:
                continue
            with open(p, encoding="utf-8") as f:
                u = (json.load(f) or {}).get("url", "") or ""
            if u:
                urls.add(u)
        except Exception:
            pass
    return urls


def maybe_heartbeat(config, api_url):
    """Tell the server this install is still active, at most once per UTC day.

    Fire-and-forget in a detached process so the status line never blocks on
    the network. We persist a random installId (generating one if this client
    predates id-aware versions) and the last heartbeat date. The server only
    records the anonymous id in day/week/month activity sets — nothing else.
    """
    try:
        today = time.strftime("%Y-%m-%d", time.gmtime())
        cfg = config if isinstance(config, dict) else {}
        if cfg.get("lastHeartbeat") == today:
            return
        # Read-modify-write from disk so we never clobber other settings.
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                disk = json.load(f)
        except Exception:
            disk = {}
        if not isinstance(disk, dict):
            disk = {}
        install_id = disk.get("installId") or cfg.get("installId")
        if not install_id:
            import uuid
            install_id = str(uuid.uuid4())
        disk["installId"] = install_id
        disk["lastHeartbeat"] = today
        atomic_write_json(CONFIG_FILE, disk)
        url = f"{api_url}/api/ping?id={install_id}&event=heartbeat"
        if PLUGIN_VERSION:
            from urllib.parse import quote
            url += "&v=" + quote(PLUGIN_VERSION)
        subprocess.Popen(
            ["curl", "-s", "-m", "3", url],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as e:
        log(f"heartbeat failed: {e}")


def load_recent():
    """URLs of the most recently shown items (newest first)."""
    try:
        with open(RECENT_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def remember_recent(url):
    """Push url onto the recent ring buffer (dedup, capped at RECENT_MAX)."""
    if not url:
        return
    try:
        prior = [u for u in load_recent() if u != url]
        atomic_write_json(RECENT_FILE, [url] + prior[: RECENT_MAX - 1])
    except Exception:
        pass


def fetch_news(api_url, sources=None):
    try:
        # Fetch a deeper pool so we can prefer items whose summary is already
        # cached (= instant render) and still have plenty of fresh items to
        # warm the cache for next time.
        url = f"{api_url}/api/news?limit=60"
        if sources:
            url += "&sources=" + ",".join(sources)
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log(f"fetch error: {e}")
        return None


def refresh_guides_cache(api_url):
    """Refresh the server-driven status-line guides (~1h TTL). Best-effort and
    TTL-gated; the HUD falls back to its built-in guides when the cache is
    absent or stale, so this never blocks or breaks the status line."""
    try:
        if os.path.exists(GUIDES_CACHE):
            age = time.time() - os.path.getmtime(GUIDES_CACHE)
            if age < GUIDES_TTL_SEC:
                return
    except Exception:
        pass
    try:
        req = urllib.request.Request(f"{api_url}/api/guides", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            guides = (json.loads(resp.read()) or {}).get("guides")
        if isinstance(guides, list) and guides:
            with open(GUIDES_CACHE, "w", encoding="utf-8") as f:
                json.dump(
                    {"guides": guides, "timestamp": int(time.time() * 1000)},
                    f, ensure_ascii=False,
                )
    except Exception as e:
        log(f"guides fetch error: {e}")


def fetch_sources_catalog(api_url):
    """Get the source catalog (cached locally ~1h). Falls back to a stale
    cache, then to the always-on builtins, so news never breaks."""
    try:
        if os.path.exists(SOURCES_CACHE):
            age = time.time() - os.path.getmtime(SOURCES_CACHE)
            if age < SOURCES_TTL_SEC:
                with open(SOURCES_CACHE, encoding="utf-8") as f:
                    return json.load(f)
    except Exception:
        pass
    try:
        req = urllib.request.Request(f"{api_url}/api/sources", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read()) or {}
            # Built-in catalog + the shared registry of user-registered feeds
            # (custom: True). Both are toggled by id the same way.
            catalog = (data.get("sources") or []) + (data.get("customFeeds") or [])
        if catalog:
            try:
                with open(SOURCES_CACHE, "w", encoding="utf-8") as f:
                    json.dump(catalog, f)
            except Exception:
                pass
            return catalog
    except Exception as e:
        log(f"sources fetch error: {e}")
    try:
        with open(SOURCES_CACHE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return [
            {"id": "hn", "defaultOn": True},
            {"id": "github", "defaultOn": True},
        ]


def _save_sources_selection(chosen):
    try:
        cfg = {}
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, encoding="utf-8") as f:
                cfg = json.load(f) or {}
        cfg["sources"] = chosen
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except Exception:
        pass


def resolve_sources(config, catalog):
    """Return the list of enabled source ids. User's saved selection wins;
    on first run, compute defaults = defaultOn OR OS-language match, and
    persist so /claudenews:list can edit it later."""
    sel = (config or {}).get("sources")
    if isinstance(sel, dict) and sel:
        ids = [s["id"] for s in catalog if sel.get(s["id"], False)]
        return ids or [s["id"] for s in catalog if s.get("defaultOn")]
    lang = detect_lang()
    chosen = {}
    for s in catalog:
        on = bool(s.get("defaultOn"))
        if not on and lang in (s.get("defaultOnLangs") or []):
            on = True
        chosen[s["id"]] = on
    _save_sources_selection(chosen)
    return [sid for sid, on in chosen.items() if on]


def pass_through():
    print(json.dumps({"continue": True, "suppressOutput": True}))


def detect_lang():
    """Return 2-letter language code from the OS display-language setting.

    macOS: $LANG is usually en_US.UTF-8 even when the UI runs in another
    language, so read AppleLocale directly. Linux/other: fall back to env
    vars and Python's locale module.
    """
    if sys.platform == "darwin":
        try:
            out = subprocess.run(
                ["defaults", "read", "-g", "AppleLocale"],
                capture_output=True, text=True, encoding="utf-8", timeout=2,
            )
            if out.returncode == 0:
                code = out.stdout.strip().split("_")[0].split("-")[0].lower()
                if code and code != "c":
                    return code
        except Exception:
            pass

    for var in ("LANG", "LC_ALL", "LC_MESSAGES"):
        val = os.environ.get(var, "")
        if val:
            code = val.split(".")[0].split("_")[0].lower()
            if code and code != "c":
                return code
    try:
        loc = _locale.getdefaultlocale()[0]
        if loc:
            return loc.split("_")[0].lower()
    except Exception:
        pass
    return "en"


def translation_settings(config):
    translate_enabled = True
    target_lang = None
    if config:
        if "translate" in config:
            translate_enabled = bool(config["translate"])
        target_lang = config.get("translateLang")
    if not target_lang:
        target_lang = detect_lang()
    # Skip if target is English (no translation needed)
    if target_lang == "en":
        translate_enabled = False
    return translate_enabled, target_lang


def cached_translation(title, target_lang):
    if not os.path.exists(TRANSLATION_CACHE):
        return None
    try:
        with open(TRANSLATION_CACHE, encoding="utf-8") as f:
            cache = json.load(f)
        return cache.get(f"{target_lang}::{title}", {}).get("translation")
    except Exception:
        return None


def launch_translator(title, target_lang):
    """Spawn translator as background process. Non-blocking. Duplicate spawns for
    a title already in flight are cheap and self-limiting: translator.py acquires
    a self-releasing per-title lock and exits BEFORE the model call if another is
    already running, then frees the lock on completion so retries aren't blocked."""
    try:
        subprocess.Popen(
            ["python3", TRANSLATOR, target_lang, title],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            env=build_background_env(),
            start_new_session=True,
        )
    except Exception as e:
        log(f"translator launch failed: {e}")


def _is_github_boilerplate(text):
    """Guard against stale 'create an account on GitHub' summaries that may
    still sit in an old cache file. The summarizer no longer writes these,
    but a pre-existing cache entry shouldn't reach the status line."""
    if not text:
        return False
    import re as _re
    if _re.search(
        r"Contribute to .+ development by creating an account on GitHub",
        text, _re.I,
    ):
        return True
    low = text.lower()
    if "github" in low and (
        "계정" in text or "アカウント" in text or "create an account" in low
    ):
        return True
    return False


_SUMMARY_CACHE_MEMO = None


def _load_summary_cache():
    """Load the summary cache once per process. show-news is short-lived and
    the cache file is only written by the background summarizers it spawns
    (which run after this process exits), so reading it once is safe and
    avoids re-reading a ~200KB file dozens of times when scanning a 60-item
    pool for cached candidates."""
    global _SUMMARY_CACHE_MEMO
    if _SUMMARY_CACHE_MEMO is None:
        try:
            with open(SUMMARY_CACHE, encoding="utf-8") as f:
                _SUMMARY_CACHE_MEMO = json.load(f)
        except Exception:
            _SUMMARY_CACHE_MEMO = {}
    return _SUMMARY_CACHE_MEMO if isinstance(_SUMMARY_CACHE_MEMO, dict) else {}


def cached_summary(url, target_lang):
    entry = _load_summary_cache().get(f"{target_lang}::{url}")
    summary = entry.get("summary") if isinstance(entry, dict) else None
    if summary and _is_github_boilerplate(summary):
        return None  # treat as a cache miss so it gets regenerated
    return summary


def launch_summarizer(url, title, target_lang, raw_text=""):
    # Duplicate spawns are cheap and self-limiting: summarizer.py holds a
    # self-releasing per-url lock and exits early if one is already in flight.
    # raw_text (optional) is feed-provided body for sources whose pages can't be
    # scraped (Reddit/Mastodon/…) — summarizer.py uses it when the URL yields no
    # description. Passed as argv (list form → no shell, safe for any content).
    args = ["python3", SUMMARIZER, target_lang, url, title]
    if raw_text:
        args.append(raw_text)
    try:
        subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            env=build_background_env(),
            start_new_session=True,
        )
    except Exception as e:
        log(f"summarizer launch failed: {e}")


def prewarm_translations(items, target_lang, budget=5):
    """Translate up to `budget` not-yet-cached titles from the list in the
    background. Without this only the picked/landed item is translated, so
    navigating shows many untranslated titles. Titles are cheap and cached
    permanently, so this fills the whole list over a few invocations. Deduped by
    cached_translation + translator.py's self-releasing per-title lock, so once
    the list is translated later calls spawn nothing."""
    warmed = 0
    for it in items:
        if warmed >= budget:
            break
        if not isinstance(it, dict):
            continue
        t = it.get("title") or ""
        if not t or it.get("lang") == target_lang:
            continue
        if cached_translation(t, target_lang):
            continue
        launch_translator(t, target_lang)
        warmed += 1
    if warmed:
        log(f"pre-warmed {warmed} translators ({target_lang})")
    return warmed


def nav_enabled(config):
    return bool((config or {}).get("navEnabled"))


# ── client-fetched feed sources ──────────────────────────────────────────────
# News reaches one shared pool through two interchangeable TRANSPORTS:
#   • server   — selected catalog ids sent to the API, fetched server-side
#   • client   — RSS/Atom URLs fetched directly from THIS machine
# Both yield the same item shape and flow through rotation / nav / translation /
# summary identically — nothing downstream knows or cares which transport a item
# came from. Client feeds exist for any feed the server can't reach: e.g. Reddit
# 403s its .json and the server's datacenter IP, but www.reddit.com/r/<sub>/.rss
# works from a normal machine with a browser UA. There is NO source-specific
# code — Reddit/Mastodon/Bluesky/etc. are just URLs in the clientFeeds list:
#   config: "clientFeeds": [
#     {"name": "👽 r/programming", "url": "https://www.reddit.com/r/programming/.rss"},
#     {"name": "🐘 #rust", "url": "https://mastodon.social/tags/rust.rss", "lang": "en"}
#   ]
CLIENTFEEDS_CACHE_FILE = os.path.join(CONFIG_DIR, ".clientfeeds-cache.json")
CLIENTFEEDS_TTL_SEC = 900       # refetch a client feed at most every 15 min
CLIENTFEED_PER_SOURCE = 12      # cap items kept per feed
# Drop feed entries older than this. Reddit's default /.rss (hot) puts pinned
# mod posts FIRST, and pinned megathreads can be months old — without an age
# gate they enter rotation looking like news. Dateless entries pass (no info).
CLIENTFEED_MAX_AGE_DAYS = 14
# Reddit rate-limits UNAUTHENTICATED requests per IP regardless of path — the
# /.rss endpoint gets the same tiny quota as everything else (measured 2026-09:
# 1 request per ~30s window; x-ratelimit-remaining hits 0 after ONE fetch).
# Two subreddit feeds fetched back-to-back therefore always 429 the second.
# So: space requests to the same host, and on 429 honour x-ratelimit-reset
# once. Safe to sleep here — this runs in the detached --feeds-refresh
# process, never in the 5s status-line hook.
CLIENTFEED_SAME_HOST_GAP_SEC = 35
CLIENTFEED_429_RETRY_MAX_SEC = 90
# In-flight marker so concurrent sessions don't each spawn a refresh (each
# would burn the same per-IP quota). Stale after this many seconds.
CLIENTFEEDS_LOCK_FILE = os.path.join(CONFIG_DIR, ".clientfeeds-refresh.lock")
CLIENTFEEDS_LOCK_STALE_SEC = 600
# A browser UA: required by Reddit, harmless for any other feed.
CLIENTFEED_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def parse_feed(xml_text):
    """Parse RSS 2.0 or Atom into [{'title','link'}]. Namespace-agnostic: matches
    on the local tag name so one parser handles every feed flavor."""
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []

    def lname(tag):
        return tag.rsplit("}", 1)[-1].lower()

    out = []
    for el in root.iter():
        if lname(el.tag) not in ("item", "entry"):
            continue
        title, link, bodies, published = None, None, {}, None
        for child in el:
            lt = lname(child.tag)
            if lt == "title" and child.text and not title:
                title = child.text.strip()
            elif lt in ("published", "updated", "pubdate", "date") and child.text and not published:
                published = child.text.strip()
            elif lt == "link":
                href = child.get("href")            # Atom: <link href="..."/>
                if href:
                    if link is None or child.get("rel") in (None, "alternate"):
                        link = href
                elif child.text and not link:        # RSS: <link>text</link>
                    link = child.text.strip()
            elif lt in ("content", "encoded", "description", "summary") and child.text:
                # Feed-provided body. Reddit/Mastodon/etc. carry the post text
                # here, which is the only summarizable source for feeds whose
                # pages block scraping. Prefer full content over a short summary.
                bodies.setdefault(lt, child.text)
        if title and link:
            body = (
                bodies.get("content") or bodies.get("encoded")
                or bodies.get("description") or bodies.get("summary") or ""
            )
            out.append({"title": title, "link": link, "body": body, "published": published})
    return out


def _feed_entry_age_days(published):
    """Best-effort age in days from an RSS/Atom date string; None if unparsable."""
    if not published:
        return None
    from datetime import datetime, timezone
    dt = None
    try:  # ISO 8601 (Atom: 2025-12-18T13:45:29+00:00)
        dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
    except Exception:
        try:  # RFC 822 (RSS: Thu, 18 Dec 2025 13:45:29 GMT)
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(published)
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).total_seconds() / 86400


def _strip_html(s):
    import html as _html
    if not s:
        return ""
    t = re.sub(r"<[^>]+>", " ", _html.unescape(s))
    return re.sub(r"\s+", " ", t).strip()


def _feed_host(url):
    try:
        from urllib.parse import urlsplit
        return (urlsplit(url).hostname or "").lower()
    except Exception:
        return ""


def _fetch_feed_xml(url, name):
    """One feed fetch with a single 429-aware retry. Returns xml text or None."""
    def _get():
        req = urllib.request.Request(
            url, headers={"User-Agent": CLIENTFEED_UA, "Accept": "*/*"}
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            return resp.read(1_000_000).decode("utf-8", "replace")
    try:
        return _get()
    except urllib.error.HTTPError as e:
        if e.code != 429:
            log(f"client feed fetch failed ({name}): {e}")
            return None
        try:
            wait = float((e.headers or {}).get("x-ratelimit-reset") or 0) + 2
        except Exception:
            wait = 0
        wait = max(5.0, min(wait, CLIENTFEED_429_RETRY_MAX_SEC))
        log(f"client feed 429 ({name}); retrying in {wait:.0f}s")
        time.sleep(wait)
        try:
            return _get()
        except Exception as e2:
            log(f"client feed fetch failed after retry ({name}): {e2}")
            return None
    except Exception as e:
        log(f"client feed fetch failed ({name}): {e}")
        return None


def fetch_client_feeds(feeds, prev_items=None):
    """Fetch each client feed URL directly and map entries to news items.
    Source-agnostic; best-effort. A failing feed keeps its previously cached
    items (prev_items) so a transient 429 doesn't blank that source."""
    out, seen = [], set()
    last_hit = {}   # host -> monotonic time of the last request to it
    failed = []
    for f in feeds:
        if not isinstance(f, dict):
            continue
        url = (f.get("url") or "").strip()
        if not url:
            continue
        name = (f.get("name") or "").strip() or url
        lang = (f.get("lang") or "en").strip() or "en"
        host = _feed_host(url)
        if host in last_hit:
            gap = CLIENTFEED_SAME_HOST_GAP_SEC - (time.monotonic() - last_hit[host])
            if gap > 0:
                time.sleep(gap)
        last_hit[host] = time.monotonic()
        xml = _fetch_feed_xml(url, name)
        if xml is None:
            failed.append(name)
            continue
        n = 0
        for entry in parse_feed(xml):
            if n >= CLIENTFEED_PER_SOURCE:
                break
            if entry["link"] in seen:
                continue
            age = _feed_entry_age_days(entry.get("published"))
            if age is not None and age > CLIENTFEED_MAX_AGE_DAYS:
                continue  # stale (e.g. an old pinned post surfaced by hot-order feeds)
            seen.add(entry["link"])
            out.append({
                "title": entry["title"], "url": entry["link"],
                "source": name, "lang": lang, "clientfeed": True,
                "feed_text": _strip_html(entry.get("body", ""))[:1500],
            })
            n += 1
    if failed and prev_items:
        kept = [
            it for it in prev_items
            if isinstance(it, dict) and it.get("source") in failed
            and it.get("url") not in seen
        ]
        if kept:
            log(f"client feeds: kept {len(kept)} cached item(s) for failed {failed}")
            out.extend(kept)
    return out


def load_clientfeeds_cache():
    try:
        with open(CLIENTFEEDS_CACHE_FILE, encoding="utf-8") as f:
            d = json.load(f) or {}
        return (d.get("items") or [], int(d.get("ts", 0)))
    except Exception:
        return [], 0


def _acquire_clientfeeds_lock():
    """True if this process may refresh; False if another refresh is in flight."""
    try:
        st = os.stat(CLIENTFEEDS_LOCK_FILE)
        if time.time() - st.st_mtime < CLIENTFEEDS_LOCK_STALE_SEC:
            return False
        os.unlink(CLIENTFEEDS_LOCK_FILE)   # stale (crashed refresh)
    except FileNotFoundError:
        pass
    except Exception:
        return False
    try:
        fd = os.open(CLIENTFEEDS_LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        return True
    except Exception:
        return False


def _release_clientfeeds_lock():
    try:
        os.unlink(CLIENTFEEDS_LOCK_FILE)
    except Exception:
        pass


def refresh_clientfeeds_cache(feeds):
    if not _acquire_clientfeeds_lock():
        log("client feeds refresh skipped: another refresh in flight")
        return []
    try:
        prev_items, _ = load_clientfeeds_cache()
        items = fetch_client_feeds(feeds, prev_items)
    finally:
        _release_clientfeeds_lock()
    if items:
        atomic_write_json(
            CLIENTFEEDS_CACHE_FILE, {"items": items, "ts": int(time.time() * 1000)}
        )
        log(f"client feeds refreshed: {len(items)} items from {len(feeds)} feed(s)")
        # Summarize feed-provided body in the background. These sources' pages
        # usually block scraping (Reddit 403s), but the RSS carries the post
        # text, so feed_text is the summary source. Short bodies (link posts,
        # boilerplate) fall under the summarizer's min-length gate and are
        # skipped there. Capped per run; cached_summary dedupes across runs.
        try:
            tr_enabled, target_lang = translation_settings(load_config())
            slang = target_lang if tr_enabled else "en"
            CF_SUMMARIZE_PER_RUN = 6
            done = 0
            for it in items:
                if done >= CF_SUMMARIZE_PER_RUN:
                    break
                ft = it.get("feed_text") or ""
                if len(ft) >= 40 and not cached_summary(it["url"], slang):
                    launch_summarizer(it["url"], it["title"], slang, raw_text=ft)
                    done += 1
        except Exception as e:
            log(f"client feed summarize error: {e}")
    return items


FEEDS_MIGRATE_MARKER = os.path.join(CONFIG_DIR, ".feeds-migrate.ts")
FEEDS_MIGRATE_RETRY_SEC = 6 * 3600


def register_feed(api_url, url, name="", lang=""):
    """Register a feed in the server's shared registry. Returns (feed, error)
    where feed = {id,name,url,lang} on success; error carries 'unreachable'
    when the backend cannot fetch that URL (keep it as a client feed)."""
    body = json.dumps({"url": url, "name": name, "lang": lang}).encode()
    req = urllib.request.Request(
        f"{api_url}/api/feeds", data=body, method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read()) or {}
        if data.get("ok") and data.get("feed"):
            return data["feed"], None
        return None, data.get("error") or "register failed"
    except urllib.error.HTTPError as e:
        try:
            data = json.loads(e.read()) or {}
        except Exception:
            data = {}
        err = data.get("error") or f"http {e.code}"
        if data.get("unreachable"):
            # Origin status travels along: 429 = the backend got rate-limited
            # by the feed host (Reddit: ~1 req/30s/IP), i.e. retryable.
            err = "rate-limited" if data.get("status") == 429 else "unreachable"
        return None, err
    except Exception as e:
        return None, f"network: {e}"


def migrate_client_feeds(api_url):
    """One-shot (retried at most every FEEDS_MIGRATE_RETRY_SEC): move legacy
    config['clientFeeds'] into the server registry and enable the resulting
    source ids. Feeds the backend can't reach stay as client feeds (fetched
    locally), everything else is dropped from clientFeeds."""
    cfg = load_config() or {}
    feeds = cfg.get("clientFeeds")
    if not isinstance(feeds, list) or not feeds:
        return
    try:
        with open(FEEDS_MIGRATE_MARKER, "w") as f:
            f.write(str(int(time.time())))
    except Exception:
        pass
    keep, sel = [], cfg.get("sources") if isinstance(cfg.get("sources"), dict) else {}
    migrated = 0
    last_hit = {}   # host -> monotonic time the backend last probed it
    for f in feeds:
        if not isinstance(f, dict) or not f.get("url"):
            continue
        # The backend probes the URL at registration, so two feeds on the same
        # rate-limited host (Reddit) must be spaced like client fetches are.
        host = _feed_host(f["url"])
        gap = CLIENTFEED_SAME_HOST_GAP_SEC - (time.monotonic() - last_hit.get(host, -1e9))
        if gap > 0:
            time.sleep(gap)
        last_hit[host] = time.monotonic()
        feed, err = register_feed(api_url, f["url"], f.get("name") or "", f.get("lang") or "")
        if err == "rate-limited":
            time.sleep(CLIENTFEED_SAME_HOST_GAP_SEC)
            last_hit[host] = time.monotonic()
            feed, err = register_feed(api_url, f["url"], f.get("name") or "", f.get("lang") or "")
        if feed:
            sel[feed["id"]] = True
            migrated += 1
            log(f"feed migrated to server: {feed['name']} -> {feed['id']}")
        else:
            keep.append(f)
            log(f"feed kept client-side ({err}): {f.get('name') or f['url']}")
            if str(err).startswith("network"):
                # Backend down: keep the rest too and try again later.
                keep.extend(x for x in feeds if x is not f and x not in keep)
                break
    if not migrated:
        return
    cfg = load_config() or {}
    cfg["sources"] = {**(cfg.get("sources") or {}), **sel}
    cfg["sourcesConfigured"] = True
    if keep:
        cfg["clientFeeds"] = keep
    else:
        cfg.pop("clientFeeds", None)
    try:
        atomic_write_json(CONFIG_FILE, cfg)
    except Exception as e:
        log(f"feed migration: config write failed: {e}")
        return
    try:
        os.unlink(SOURCES_CACHE)   # pick up the new ids on the next catalog fetch
    except Exception:
        pass
    log(f"feed migration done: {migrated} moved, {len(keep)} kept client-side")


def _spawn_feeds_migration():
    try:
        st = os.stat(FEEDS_MIGRATE_MARKER)
        if time.time() - st.st_mtime < FEEDS_MIGRATE_RETRY_SEC:
            return
    except Exception:
        pass
    try:
        subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "--migrate-feeds"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as e:
        log(f"feed migration spawn failed: {e}")


def _spawn_clientfeeds_refresh():
    """Refresh client feeds in a DETACHED process so the 5s news hook never
    blocks on their network fetch."""
    try:
        subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "--feeds-refresh"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as e:
        log(f"client feeds refresh spawn failed: {e}")


def merge_client_feeds(items, config):
    """Prepend cached client-feed items to the pool and kick off a background
    refresh when the cache is stale. No-op unless config['clientFeeds'] is set."""
    feeds = (config or {}).get("clientFeeds") or []
    if not isinstance(feeds, list) or not feeds:
        return items
    c_items, c_ts = load_clientfeeds_cache()
    if c_items:
        have = {it.get("url") for it in items if isinstance(it, dict)}
        items = [it for it in c_items if it.get("url") not in have] + items
    if time.time() * 1000 - c_ts > CLIENTFEEDS_TTL_SEC * 1000:
        _spawn_clientfeeds_refresh()
    return items


def save_news_list(items):
    """Persist the ordered candidate list so --nav can step through it."""
    slim = [
        {k: it.get(k) for k in ("title", "url", "source", "score", "comments",
                                "lang", "feed_text", "custom")}
        for it in items
        if isinstance(it, dict) and it.get("url")
    ]
    atomic_write_json(NEWS_LIST_FILE, {"items": slim, "ts": int(time.time() * 1000)})
    return slim


def load_news_list():
    try:
        with open(NEWS_LIST_FILE, encoding="utf-8") as f:
            data = json.load(f) or {}
        items = data.get("items")
        return items if isinstance(items, list) else []
    except Exception:
        return []


def load_nav_state():
    try:
        with open(NAV_STATE_FILE, encoding="utf-8") as f:
            s = json.load(f) or {}
        return int(s.get("index", 0)), float(s.get("pinnedUntil", 0))
    except Exception:
        return 0, 0.0


def save_nav_state(index, pinned_until):
    atomic_write_json(
        NAV_STATE_FILE, {"index": int(index), "pinnedUntil": float(pinned_until)}
    )


def build_record(item, translate_enabled, target_lang):
    """Build a .current-news record for one list item using ONLY cached
    translation + summary (no network, no spawns) so nav feels instant."""
    summary_lang = target_lang if translate_enabled else "en"
    original_title = item.get("title", "") or ""
    url = item.get("url", "") or ""
    display_title = original_title
    if translate_enabled and item.get("lang") != target_lang:
        cached = cached_translation(original_title, target_lang)
        if cached:
            display_title = cached
    record = {
        "title": display_title,
        "url": url,
        "source": item.get("source", "") or "",
        "score": item.get("score"),
        "comments": item.get("comments"),
        "timestamp": int(time.time() * 1000),
        "original_title": original_title,
    }
    summary = cached_summary(url, summary_lang) if url else None
    if summary:
        record["summary"] = summary
    return record


def do_nav(direction):
    """--nav next|prev: step the global cursor over the cached list, write the
    shared .current-news, and pin it so auto-rotation won't immediately undo it."""
    config = load_config()
    items = load_news_list()
    if not items:
        log("nav: no cached list yet")
        return
    index, _pinned = load_nav_state()
    step = -1 if direction == "prev" else 1
    index = (index + step) % len(items)
    translate_enabled, target_lang = translation_settings(config)
    item = items[index]
    record = build_record(item, translate_enabled, target_lang)
    atomic_write_json(CURRENT_NEWS_FILE, record)
    save_nav_state(index, time.time() + NAV_PIN_SEC)

    # Lazy backfill: if this item isn't summarized/translated yet, spawn the
    # background workers. They rewrite .current-news when done (matched by
    # original_title), so the description/translation fills in on the next
    # status-line refresh instead of staying blank.
    url = item.get("url", "") or ""
    original_title = item.get("title", "") or ""
    summary_lang = target_lang if translate_enabled else "en"
    if url and not cached_summary(url, summary_lang):
        launch_summarizer(url, original_title, summary_lang,
                          raw_text=item.get("feed_text") or "")
    if (translate_enabled and item.get("lang") != target_lang
            and not cached_translation(original_title, target_lang)):
        launch_translator(original_title, target_lang)

    # Look-ahead: warm the next items in the travel direction so flipping stays
    # instant instead of each item starting its translation only once landed on.
    # Titles are cheap (translate 6 ahead); summaries are heavier (2 ahead).
    # translator.py / summarizer.py each hold a self-releasing per-item lock, so
    # duplicate spawns (on-landing + fast repeat presses) exit cheaply.
    for off in range(1, 7):
        nxt = items[(index + step * off) % len(items)]
        if not isinstance(nxt, dict):
            continue
        n_title = nxt.get("title") or ""
        n_url = nxt.get("url") or ""
        if (translate_enabled and nxt.get("lang") != target_lang
                and n_title and not cached_translation(n_title, target_lang)):
            launch_translator(n_title, target_lang)
        if off <= 2 and n_url and not cached_summary(n_url, summary_lang):
            launch_summarizer(n_url, n_title, summary_lang,
                              raw_text=nxt.get("feed_text") or "")
    log(f"nav {direction} -> [{index}/{len(items)}] {record.get('title', '')[:40]}")


def main():
    if os.environ.get(BACKGROUND_CHILD_ENV) == "1":
        pass_through()
        return

    log("news hook invoked")

    # Read the hook payload for its session_id so each Claude Code session
    # rotates its own news item — different panes show different headlines.
    payload = {}
    try:
        payload = json.load(sys.stdin) or {}
    except Exception:
        payload = {}
    session_id = _sanitize_sid(
        payload.get("session_id") if isinstance(payload, dict) else ""
    )
    cur_news_file, last_open_file = session_files(session_id)
    prune_stale_session_files()

    config = load_config()
    # Config is optional for news (no auth required)
    enabled = True
    api_url = DEFAULT_API
    if config:
        enabled = config.get("newsEnabled", True)
        api_url = config.get("apiUrl", DEFAULT_API)

    # Opt-in key navigation makes news GLOBAL: every session reads the shared
    # .current-news so ctrl+shift+←/→ moves all panes together. When off, the
    # per-session rotation below is left exactly as it was.
    global_mode = nav_enabled(config)
    if global_mode:
        cur_news_file, last_open_file = CURRENT_NEWS_FILE, LAST_OPEN_FILE

    # Daily active-user heartbeat. Runs before the news enabled/rate-limit
    # gates so a still-installed client counts as active even with news off;
    # it self-throttles to once per UTC day and never blocks (detached).
    maybe_heartbeat(config, api_url)
    refresh_guides_cache(api_url)

    if not enabled:
        log("news disabled")
        pass_through()
        return

    if is_rate_limited(last_open_file):
        log("rate limited, keeping existing news")
        pass_through()
        return

    save_timestamp(last_open_file)

    # Legacy client-fetched feeds move into the server's shared registry
    # (detached; the hook never waits on it). Whatever the backend can't
    # reach stays client-fetched via merge_client_feeds below.
    if (config or {}).get("clientFeeds"):
        _spawn_feeds_migration()

    catalog = fetch_sources_catalog(api_url)
    selected = resolve_sources(config, catalog)
    response = fetch_news(api_url, selected)
    items = (response or {}).get("items") or []
    # Merge in client-fetched feed items (pulled directly from this machine) so
    # they rotate/nav alongside server sources. No-op unless clientFeeds is set.
    items = merge_client_feeds(items, config)
    api_pick = (response or {}).get("pick")
    if not api_pick and not items:
        log("no news received")
        pass_through()
        return

    translate_enabled, target_lang = translation_settings(config)
    summary_lang = target_lang if translate_enabled else "en"

    # Prefer an item whose summary is already cached so the statusline
    # renders the summary line instantly. Pick *randomly* among cached
    # candidates so consecutive prompts rotate through different items
    # instead of locking onto the first cached one in API order. Avoid
    # re-picking the URL that was just shown.
    import random

    # Global (nav) mode: persist the ordered list for --nav and, if the user
    # navigated by hand recently, keep their pinned pick instead of rotating.
    saved_list = None
    if global_mode:
        saved_list = save_news_list(items)
        # Fill the whole list's translations in the background — BEFORE the pin
        # check, so chatting while the nav is pinned (i.e. right after the user
        # started browsing) still warms the cache. Otherwise flipping to any
        # not-yet-landed item shows it untranslated until its on-landing spawn.
        if translate_enabled:
            prewarm_translations(saved_list, target_lang)
        _idx, pinned_until = load_nav_state()
        if time.time() < pinned_until:
            log("nav pinned — keeping current item, skipping rotation")
            pass_through()
            return

    prev_url = ""
    if os.path.exists(cur_news_file):
        try:
            with open(cur_news_file, encoding="utf-8") as f:
                prev_url = (json.load(f) or {}).get("url", "") or ""
        except Exception:
            prev_url = ""

    # Avoid re-showing anything from the last RECENT_MAX picks (not just the
    # immediately previous one) so a small pool can't ping-pong between a
    # couple of items.
    recent = set(load_recent())
    recent.add(prev_url)
    # Hard non-overlap across concurrently-open sessions: exclude whatever each
    # OTHER live session is currently showing so two panes never collide on the
    # same headline. Degrades gracefully (see the rotatable fallback below) when
    # the candidate pool is smaller than the number of open sessions.
    if not global_mode:
        # Cross-session non-overlap only applies to per-session mode; global
        # (nav) mode intentionally shows the same item in every session.
        recent |= other_session_urls(cur_news_file)

    def _not_recent(lst):
        return [it for it in lst if it.get("url") not in recent]

    # Eligible for rotation = has a cached summary (instant full render) OR is a
    # feed item (server-registered custom feed or legacy client feed). Those
    # sources (e.g. Reddit) never get a scrapable summary, but should still
    # rotate into the status line (title-only) instead of being nav-only.
    cached_candidates = [
        it for it in items
        if isinstance(it, dict) and it.get("url")
        and (cached_summary(it["url"], summary_lang)
             or it.get("clientfeed") or it.get("custom"))
    ]
    # Prefer cached-summary items not shown recently; degrade gracefully so we
    # still end up with something when everything's been seen.
    rotatable = (
        _not_recent(cached_candidates)
        or [it for it in cached_candidates if it.get("url") != prev_url]
        or cached_candidates
    )
    pick = None
    if rotatable:
        pick = random.choice(rotatable)
        log(f"picked cached-summary item: {pick.get('title','')[:50]}")
    if not pick:
        # No cached summary yet: prefer a fresh (not-recent) item, else fall
        # back to the server's pick / first item.
        fresh = _not_recent(
            [it for it in items if isinstance(it, dict) and it.get("url")]
        )
        pick = (random.choice(fresh) if fresh else None) or api_pick or (
            items[0] if items else None
        )
    if not pick:
        log("no news received")
        pass_through()
        return

    original_title = pick.get("title", "")
    log(f"showing news: {original_title[:50]}")
    url = pick.get("url", "")
    remember_recent(url)

    # Skip title translation when the source is already in the target language
    # (e.g. GeekNews/Yonhap titles when target is ko) — no point spending a
    # Claude call to "translate" Korean into Korean. Summaries are unaffected:
    # summary_lang stays the target so a Korean article still gets a Korean
    # summary (that's generation, not translation).
    pick_lang = pick.get("lang")
    title_needs_translation = translate_enabled and pick_lang != target_lang

    display_title = original_title
    if title_needs_translation:
        cached = cached_translation(original_title, target_lang)
        if cached:
            display_title = cached
            log(f"using cached translation ({target_lang})")

    # Cached summary check (keyed by url + summary_lang)
    summary = cached_summary(url, summary_lang) if url else None

    # Write news item to file for statusline to render
    record = {
        "title": display_title,
        "url": url,
        "source": pick.get("source", ""),
        "score": pick.get("score"),
        "comments": pick.get("comments"),
        "timestamp": int(time.time() * 1000),
    }
    if summary:
        record["summary"] = summary
    # Always keep original_title so background workers (translator/summarizer)
    # can match the record back even when the title has already been swapped
    # in from a cached translation.
    record["original_title"] = original_title

    # Write this session's file (what its own status line renders) and mirror
    # it to the shared global file so /claudenews:feed (which has no session
    # context) can still expand the most-recently-rotated item.
    atomic_write_json(cur_news_file, record)
    if cur_news_file != CURRENT_NEWS_FILE:
        try:
            atomic_write_json(CURRENT_NEWS_FILE, record)
        except Exception:
            pass

    # Keep the nav cursor pointed at whatever auto-rotation just chose, so the
    # next ctrl+shift+→ steps forward from here. Unpinned (pinnedUntil=0).
    if global_mode and saved_list is not None:
        try:
            idx = next(i for i, it in enumerate(saved_list) if it.get("url") == url)
        except StopIteration:
            idx = 0
        save_nav_state(idx, 0)

    # Launch background translation if needed and not yet cached
    if title_needs_translation and display_title == original_title:
        launch_translator(original_title, target_lang)
        log(f"launched translator for {target_lang}")

    # Launch summarizer if URL present and no cached summary yet
    if url and not summary:
        launch_summarizer(url, original_title, summary_lang,
                          raw_text=pick.get("feed_text") or "")
        log(f"launched summarizer ({summary_lang})")

    # Pre-warm cache so rotation has enough cached-summary items to draw from
    # WITHOUT re-summarizing forever. Summaries are cached permanently
    # (.summary-cache.json), so this is a one-time warm-up, not a steady drip:
    # once the current pool already holds TARGET_CACHED summaries we spawn
    # nothing. Each run tops up at most PREWARM_PER_RUN new items — a hard cap
    # on Claude subprocesses, which matters now that every session rotates
    # independently (more rotations = more potential spawns).
    TARGET_CACHED = RECENT_MAX + 6  # ~30: a little over the rotation buffer
    PREWARM_PER_RUN = 4
    already_cached = sum(
        1 for it in items
        if isinstance(it, dict) and it.get("url")
        and cached_summary(it["url"], summary_lang)
    )
    budget = min(PREWARM_PER_RUN, max(0, TARGET_CACHED - already_cached))
    prewarmed = 0
    for item in items:
        if prewarmed >= budget:
            break
        if not isinstance(item, dict):
            continue
        item_url = item.get("url", "")
        item_title = item.get("title", "")
        if not item_url or item_url == url:
            continue
        if cached_summary(item_url, summary_lang):
            continue
        launch_summarizer(item_url, item_title, summary_lang,
                          raw_text=item.get("feed_text") or "")
        prewarmed += 1
    if prewarmed:
        log(
            f"pre-warmed {prewarmed}/{budget} summarizers "
            f"({already_cached}/{TARGET_CACHED} cached, {summary_lang})"
        )

    # Pre-warm TRANSLATIONS for the list (non-nav mode; nav mode already did this
    # before the pin check). Previously only the picked item was translated, so
    # rotating/navigating showed many untranslated titles until each was landed
    # on. Cheap and cached permanently — a one-time fill over a few rotations.
    if translate_enabled and not global_mode:
        prewarm_translations(items, target_lang)

    pass_through()


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--feeds-refresh":
        try:
            _cfg = load_config()
            refresh_clientfeeds_cache((_cfg or {}).get("clientFeeds") or [])
        except Exception as e:
            log(f"client feeds refresh error: {e}")
        sys.exit(0)
    if len(sys.argv) >= 2 and sys.argv[1] == "--migrate-feeds":
        try:
            _cfg = load_config() or {}
            migrate_client_feeds(_cfg.get("apiUrl", DEFAULT_API))
        except Exception as e:
            log(f"feed migration error: {e}")
        sys.exit(0)
    if len(sys.argv) >= 2 and sys.argv[1] == "--nav":
        _direction = sys.argv[2] if len(sys.argv) >= 3 else "next"
        try:
            do_nav("prev" if _direction == "prev" else "next")
        except Exception as e:
            log(f"nav error: {e}")
        sys.exit(0)
    main()
