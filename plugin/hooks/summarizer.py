#!/usr/bin/env python3
"""Background summarizer. Fetches article meta description, translates, updates .current-news.

Usage: summarizer.py <target_lang> <url> <original_title>
"""

import json
import os
import re
import sys
import time
import urllib.request

from background_claude import (
    atomic_write_json,
    log_background_event,
    looks_like_error_output,
    run_background_prompt,
    summarize_process_error,
)

CONFIG_DIR = os.path.expanduser("~/.code-earn")
CACHE_FILE = os.path.join(CONFIG_DIR, ".summary-cache.json")
CURRENT_NEWS_FILE = os.path.join(CONFIG_DIR, ".current-news")
LOCK_FILE = os.path.join(CONFIG_DIR, ".summarizer.lock")
STATUS_FILE = os.path.join(CONFIG_DIR, ".summary-status.json")
MAX_CACHE = 500
STATUS_MAX_AGE_SEC = 120

# Meta tags we'll look for, in priority order
META_PATTERNS = [
    re.compile(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:description["\']', re.I),
    re.compile(r'<meta[^>]+name=["\']twitter:description["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']', re.I),
]


def load_cache():
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_cache(cache):
    if len(cache) > MAX_CACHE:
        items = sorted(cache.items(), key=lambda kv: kv[1].get("ts", 0), reverse=True)
        cache = dict(items[:MAX_CACHE])
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f, ensure_ascii=False)
    except Exception:
        pass


def fetch_meta_description(url):
    """Fetch URL and extract best meta description (og:description > twitter > description)."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 code-earn/1.0",
        })
        with urllib.request.urlopen(req, timeout=5) as resp:
            ctype = resp.headers.get("Content-Type", "")
            if "html" not in ctype.lower():
                return None
            raw = resp.read(300_000)  # cap at 300KB
        html = raw.decode("utf-8", errors="replace")
    except Exception:
        return None

    for pat in META_PATTERNS:
        m = pat.search(html)
        if m:
            desc = m.group(1).strip()
            # HTML entity decode
            desc = (desc
                    .replace("&amp;", "&")
                    .replace("&quot;", '"')
                    .replace("&#x27;", "'")
                    .replace("&#39;", "'")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&nbsp;", " "))
            # Collapse whitespace
            desc = re.sub(r"\s+", " ", desc)
            if 20 <= len(desc) <= 500:
                return desc
    return None


def translate_summary(text, target_lang):
    lang_name = {
        "ko": "Korean", "ja": "Japanese", "zh": "Chinese",
        "es": "Spanish", "fr": "French", "de": "German",
    }.get(target_lang, target_lang)

    prompt = (
        f"Summarize the following article description in exactly three short sentences in {lang_name}. "
        f"Keep technical terms in English. Output ONLY the summary as plain sentences separated by spaces, "
        f"no prefix, no quotes, no bullet points:\n\n{text}"
    )
    try:
        result = run_background_prompt(prompt, task_name="summary", timeout=30)
        if result.returncode != 0:
            log_background_event(
                f"summarizer Claude call failed ({target_lang}): {summarize_process_error(result)}"
            )
            return None
        out = (result.stdout or "").strip().strip('"').strip("'")
        if looks_like_error_output(out):
            log_background_event(
                f"summarizer rejected error-looking output ({target_lang}): {out[:80]}"
            )
            return None
        if 10 <= len(out) <= 800:
            return out
    except Exception as exc:
        log_background_event(f"summarizer exception ({target_lang}): {exc}")
    return None


def update_current_news(original_title, summary):
    if not os.path.exists(CURRENT_NEWS_FILE):
        return
    try:
        with open(CURRENT_NEWS_FILE) as f:
            data = json.load(f)
    except Exception:
        return
    # Match on original_title OR current title (in case translator already ran)
    if data.get("original_title") == original_title or data.get("title") == original_title:
        data["summary"] = summary
        try:
            atomic_write_json(CURRENT_NEWS_FILE, data)
        except Exception:
            pass


def acquire_lock_for(key):
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        locks = {}
        if os.path.exists(LOCK_FILE):
            try:
                with open(LOCK_FILE) as f:
                    locks = json.load(f)
            except Exception:
                locks = {}
        now = time.time()
        locks = {k: v for k, v in locks.items() if now - v < 120}
        if key in locks:
            return False
        locks[key] = now
        with open(LOCK_FILE, "w") as f:
            json.dump(locks, f)
        return True
    except Exception:
        return True


def release_lock_for(key):
    try:
        if not os.path.exists(LOCK_FILE):
            return
        with open(LOCK_FILE) as f:
            locks = json.load(f)
        locks.pop(key, None)
        with open(LOCK_FILE, "w") as f:
            json.dump(locks, f)
    except Exception:
        pass


def write_status(url, stage):
    """Publish a per-URL progress stage so the viewer can render it.

    stage ∈ {fetching, translating, error, done}. 'done' clears the entry.
    """
    if not url:
        return
    try:
        statuses = {}
        if os.path.exists(STATUS_FILE):
            try:
                with open(STATUS_FILE) as f:
                    statuses = json.load(f)
            except Exception:
                statuses = {}
        now = time.time()
        # Drop stale entries so the file doesn't grow forever
        statuses = {
            k: v for k, v in statuses.items()
            if isinstance(v, dict) and now - v.get("ts", 0) < STATUS_MAX_AGE_SEC
        }
        if stage == "done":
            statuses.pop(url, None)
        else:
            statuses[url] = {"stage": stage, "ts": now}
        with open(STATUS_FILE, "w") as f:
            json.dump(statuses, f)
    except Exception:
        pass


def main():
    if len(sys.argv) < 4:
        sys.exit(0)
    target_lang = sys.argv[1]
    url = sys.argv[2]
    original_title = sys.argv[3]

    if not url or not original_title:
        sys.exit(0)

    os.makedirs(CONFIG_DIR, exist_ok=True)

    key = f"{target_lang}::{url}"
    cache = load_cache()
    if key in cache:
        summary = cache[key].get("summary")
        if summary:
            update_current_news(original_title, summary)
        sys.exit(0)

    if not acquire_lock_for(key):
        sys.exit(0)

    try:
        write_status(url, "fetching")
        raw_desc = fetch_meta_description(url)
        if not raw_desc:
            write_status(url, "error")
            return

        if target_lang == "en":
            summary = raw_desc
        else:
            write_status(url, "translating")
            summary = translate_summary(raw_desc, target_lang) or raw_desc

        # Trim summary to something reasonable
        if len(summary) > 600:
            summary = summary[:599] + "…"

        cache = load_cache()
        cache[key] = {"summary": summary, "ts": int(time.time())}
        save_cache(cache)
        update_current_news(original_title, summary)
        write_status(url, "done")
    finally:
        release_lock_for(key)


if __name__ == "__main__":
    main()
