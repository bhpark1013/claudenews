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

CONFIG_DIR = os.path.expanduser("~/.claudenews")
CACHE_FILE = os.path.join(CONFIG_DIR, ".summary-cache.json")
CURRENT_NEWS_FILE = os.path.join(CONFIG_DIR, ".current-news")
LOCK_FILE = os.path.join(CONFIG_DIR, ".summarizer.lock")
STATUS_FILE = os.path.join(CONFIG_DIR, ".summary-status.json")
MAX_CACHE = 500
STATUS_MAX_AGE_SEC = 120

# GitHub serves this exact phrase as og:description whenever a repo has no
# user-set description. Always reject so we don't cache a "create a GitHub
# account" non-summary.
GITHUB_BOILERPLATE_RE = re.compile(
    r"Contribute to .+ development by creating an account on GitHub",
    re.I,
)

GITHUB_REPO_URL_RE = re.compile(
    r"^https?://github\.com/([^/\s]+)/([^/\s#?]+)",
    re.I,
)

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


def is_likely_boilerplate(text):
    """True for empty / GitHub default 'create an account' phrases (any language)."""
    if not text:
        return True
    if GITHUB_BOILERPLATE_RE.search(text):
        return True
    lowered = text.lower()
    if "github" in lowered:
        # Translated variants we've observed in the wild.
        if (
            "계정" in text                    # Korean "account"
            or "アカウント" in text            # Japanese "account"
            or "create an account" in lowered
            or "create a github account" in lowered
        ):
            return True
    return False


# Haiku occasionally refuses to summarize when the raw description is short or
# truncated, and returns an English meta reply instead of an actual summary.
# Reject those so they don't get cached as the "translation".
_META_REFUSAL_PHRASES = (
    "i need the complete",
    "i need more",
    "could you please",
    "could you share",
    "could you provide",
    "please share",
    "please provide",
    "more context",
    "appears to be cut off",
    "appears to be truncated",
    "i cannot summarize",
    "i don't have",
    "i don't see",
    "i do not see",
)


def looks_like_meta_refusal(text):
    if not text:
        return True
    lowered = text.lower()
    return any(p in lowered for p in _META_REFUSAL_PHRASES)


def has_target_language(text, target_lang):
    """Reject outputs that aren't actually in the requested script."""
    if not text:
        return False
    if target_lang in ("en", "es", "fr", "de", "it", "pt", "pl", "tr", "vi", "id"):
        return True  # Latin-based — skip script check
    total = sum(1 for c in text if not c.isspace())
    if not total:
        return False

    def _ratio(predicate):
        return sum(1 for c in text if predicate(c)) / total

    if target_lang == "ko":
        return _ratio(lambda c: "가" <= c <= "힣") >= 0.3
    if target_lang == "ja":
        return _ratio(
            lambda c: ("぀" <= c <= "ゟ")
            or ("゠" <= c <= "ヿ")
            or ("一" <= c <= "鿿")
        ) >= 0.3
    if target_lang == "zh":
        return _ratio(lambda c: "一" <= c <= "鿿") >= 0.3
    if target_lang == "ru":
        return _ratio(lambda c: "Ѐ" <= c <= "ӿ") >= 0.3
    if target_lang == "th":
        return _ratio(lambda c: "฀" <= c <= "๿") >= 0.3
    return True


def is_bad_summary(text, target_lang):
    """Single gate covering every reason we shouldn't trust a summary."""
    return (
        is_likely_boilerplate(text)
        or looks_like_meta_refusal(text)
        or not has_target_language(text, target_lang)
    )


def extract_readme_excerpt(readme):
    """First meaningful paragraph from a README, stripped of markdown noise."""
    paragraph = []
    for line in readme.splitlines():
        s = line.strip()
        if not s:
            if paragraph:
                break
            continue
        if s.startswith(("#", ">", "|", "---", "===")):
            continue
        if re.match(r"^!?\[", s):  # badge / image-only lines
            continue
        if s.startswith("<!--") or s.startswith("<img") or s.startswith("<p align"):
            continue
        paragraph.append(s)
        if sum(len(l) for l in paragraph) > 400:
            break
    text = " ".join(paragraph)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)        # ![alt](url)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)    # [txt](url) -> txt
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)                     # html tags
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) >= 20 else ""


def fetch_github_summary(url):
    """For github.com/<owner>/<repo> URLs: prefer the API description, then README."""
    m = GITHUB_REPO_URL_RE.match(url)
    if not m:
        return None
    owner = m.group(1)
    repo = re.sub(r"\.git$", "", m.group(2))
    # Skip non-repo paths under github.com
    if owner in ("trending", "topics", "marketplace", "search", "settings", "explore"):
        return None
    api = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "claudenews/1.0",
    }
    try:
        req = urllib.request.Request(api, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
    except Exception:
        return None
    desc = (data.get("description") or "").strip()
    if desc and not is_likely_boilerplate(desc):
        return desc
    # description blank or junk -> fall back to README excerpt
    try:
        req = urllib.request.Request(
            f"{api}/readme",
            headers={**headers, "Accept": "application/vnd.github.raw"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            readme = resp.read(50_000).decode("utf-8", errors="replace")
        excerpt = extract_readme_excerpt(readme)
        if excerpt and not is_likely_boilerplate(excerpt):
            return excerpt
    except Exception:
        pass
    return None


def fetch_meta_description(url):
    """Fetch URL and extract best meta description (og:description > twitter > description)."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 claudenews/1.0",
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
            if is_likely_boilerplate(desc):
                continue  # try the next meta tag
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
        if not (10 <= len(out) <= 800):
            return None
        if is_bad_summary(out, target_lang):
            log_background_event(
                f"summarizer rejected bad output ({target_lang}): {out[:80]}"
            )
            return None
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
        if summary and not is_bad_summary(summary, target_lang):
            update_current_news(original_title, summary)
            sys.exit(0)
        # else: stale/bad summary cached previously — fall through to regenerate

    if not acquire_lock_for(key):
        sys.exit(0)

    try:
        write_status(url, "fetching")
        raw_desc = fetch_github_summary(url) or fetch_meta_description(url)
        if not raw_desc or is_likely_boilerplate(raw_desc):
            write_status(url, "error")
            return
        # Too thin to summarize meaningfully — Haiku tends to return a meta
        # refusal instead of a real summary when the source is this short.
        if len(raw_desc.strip()) < 40:
            write_status(url, "error")
            return

        if target_lang == "en":
            summary = raw_desc
        else:
            write_status(url, "translating")
            summary = translate_summary(raw_desc, target_lang)
            if not summary or is_bad_summary(summary, target_lang):
                # Don't cache an English/refusal as a "ko" translation.
                write_status(url, "error")
                return

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
