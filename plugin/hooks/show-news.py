#!/usr/bin/env python3
"""Fetch a dev news item and write it to .current-news for the statusline to pick up."""

import json
import locale as _locale
import os
import subprocess
import sys
import time
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
TRANSLATOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "translator.py")
SUMMARIZER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "summarizer.py")

DEFAULT_API = "https://web-olive-three-47.vercel.app"
RATE_LIMIT_SEC = 30  # Reuse the current news item for 30s instead of re-fetching on every prompt


def log(msg):
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def load_config():
    if not os.path.exists(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE) as f:
            return json.load(f)
    except Exception:
        return None


def is_rate_limited():
    if not os.path.exists(LAST_OPEN_FILE):
        return False
    try:
        with open(LAST_OPEN_FILE) as f:
            last = float(f.read().strip())
        return (time.time() - last) < RATE_LIMIT_SEC
    except Exception:
        return False


def save_timestamp():
    with open(LAST_OPEN_FILE, "w") as f:
        f.write(str(time.time()))


def fetch_news(api_url):
    try:
        # Fetch a deeper pool so we can prefer items whose summary is already
        # cached (= instant render) and still have plenty of fresh items to
        # warm the cache for next time.
        url = f"{api_url}/api/news?limit=20"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log(f"fetch error: {e}")
        return None


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
                capture_output=True, text=True, timeout=2,
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
        with open(TRANSLATION_CACHE) as f:
            cache = json.load(f)
        return cache.get(f"{target_lang}::{title}", {}).get("translation")
    except Exception:
        return None


def launch_translator(title, target_lang):
    """Spawn translator as background process. Non-blocking."""
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


def cached_summary(url, target_lang):
    if not os.path.exists(SUMMARY_CACHE):
        return None
    try:
        with open(SUMMARY_CACHE) as f:
            cache = json.load(f)
        summary = cache.get(f"{target_lang}::{url}", {}).get("summary")
        if summary and _is_github_boilerplate(summary):
            return None  # treat as a cache miss so it gets regenerated
        return summary
    except Exception:
        return None


def launch_summarizer(url, title, target_lang):
    try:
        subprocess.Popen(
            ["python3", SUMMARIZER, target_lang, url, title],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            env=build_background_env(),
            start_new_session=True,
        )
    except Exception as e:
        log(f"summarizer launch failed: {e}")


def main():
    if os.environ.get(BACKGROUND_CHILD_ENV) == "1":
        pass_through()
        return

    log("news hook invoked")

    # Read stdin and check if user is invoking a slash command or meta action
    # If so, skip news rotation to avoid changing state they're inspecting
    stdin_data = {}
    try:
        stdin_data = json.load(sys.stdin)
    except Exception:
        pass

    prompt = (stdin_data.get("prompt") or "").strip()
    if prompt.startswith("/feed") or prompt.startswith("/news"):
        log("skipping: user invoked feed command")
        pass_through()
        return

    config = load_config()
    # Config is optional for news (no auth required)
    enabled = True
    api_url = DEFAULT_API
    if config:
        enabled = config.get("newsEnabled", True)
        api_url = config.get("apiUrl", DEFAULT_API)

    if not enabled:
        log("news disabled")
        pass_through()
        return

    if is_rate_limited():
        log("rate limited, keeping existing news")
        pass_through()
        return

    save_timestamp()

    response = fetch_news(api_url)
    items = (response or {}).get("items") or []
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
    prev_url = ""
    if os.path.exists(CURRENT_NEWS_FILE):
        try:
            with open(CURRENT_NEWS_FILE) as f:
                prev_url = (json.load(f) or {}).get("url", "") or ""
        except Exception:
            prev_url = ""

    cached_candidates = [
        it for it in items
        if isinstance(it, dict) and it.get("url") and cached_summary(it["url"], summary_lang)
    ]
    rotatable = [it for it in cached_candidates if it.get("url") != prev_url] or cached_candidates
    pick = None
    if rotatable:
        pick = random.choice(rotatable)
        log(f"picked cached-summary item: {pick.get('title','')[:50]}")
    if not pick:
        pick = api_pick or (items[0] if items else None)
    if not pick:
        log("no news received")
        pass_through()
        return

    original_title = pick.get("title", "")
    log(f"showing news: {original_title[:50]}")
    url = pick.get("url", "")

    display_title = original_title
    if translate_enabled:
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

    atomic_write_json(CURRENT_NEWS_FILE, record)

    # Launch background translation if enabled and not yet cached
    if translate_enabled and display_title == original_title:
        launch_translator(original_title, target_lang)
        log(f"launched translator for {target_lang}")

    # Launch summarizer if URL present and no cached summary yet
    if url and not summary:
        launch_summarizer(url, original_title, summary_lang)
        log(f"launched summarizer ({summary_lang})")

    # Pre-warm cache: launch summarizers for up to PREWARM_MAX uncached
    # candidates so the next prompt is more likely to hit a cached pick.
    # Capped to avoid spawning a Claude subprocess per item when limit=20.
    PREWARM_MAX = 5
    prewarmed = 0
    for item in items:
        if prewarmed >= PREWARM_MAX:
            break
        if not isinstance(item, dict):
            continue
        item_url = item.get("url", "")
        item_title = item.get("title", "")
        if not item_url or item_url == url:
            continue
        if cached_summary(item_url, summary_lang):
            continue
        launch_summarizer(item_url, item_title, summary_lang)
        prewarmed += 1
    if prewarmed:
        log(f"pre-warmed {prewarmed} summarizers ({summary_lang})")

    pass_through()


if __name__ == "__main__":
    main()
