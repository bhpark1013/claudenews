#!/usr/bin/env python3
"""Expand current news item or list recent items."""

import json
import os
import sys
import urllib.request

CONFIG_DIR = os.path.expanduser("~/.claudenews")
CURRENT_NEWS_FILE = os.path.join(CONFIG_DIR, ".current-news")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
DEFAULT_API = "https://web-olive-three-47.vercel.app"


def load_api_url():
    try:
        with open(CONFIG_FILE) as f:
            return json.load(f).get("apiUrl", DEFAULT_API)
    except Exception:
        return DEFAULT_API


def fetch_hn_item(hn_id):
    try:
        url = f"https://hacker-news.firebaseio.com/v0/item/{hn_id}.json"
        with urllib.request.urlopen(url, timeout=4) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def fetch_hn_comments(item, limit=3):
    comments = []
    kids = (item or {}).get("kids", [])[:limit]
    for kid_id in kids:
        try:
            url = f"https://hacker-news.firebaseio.com/v0/item/{kid_id}.json"
            with urllib.request.urlopen(url, timeout=3) as resp:
                data = json.loads(resp.read())
                if data.get("text") and not data.get("dead") and not data.get("deleted"):
                    comments.append(data)
        except Exception:
            continue
    return comments


def strip_html(text):
    import re
    text = re.sub(r"<p>", "\n\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&#x27;", "'").replace("&quot;", '"')
    text = text.replace("&amp;", "&").replace("&gt;", ">").replace("&lt;", "<")
    return text.strip()


def expand_current():
    if not os.path.exists(CURRENT_NEWS_FILE):
        print("No current news item. Send a prompt to Claude Code to trigger one.")
        return

    with open(CURRENT_NEWS_FILE) as f:
        news = json.load(f)

    title = news.get("title", "")
    url = news.get("url", "")
    source = news.get("source", "")
    score = news.get("score")
    comments = news.get("comments")

    print(f"## {title}")
    print()
    meta = [f"**{source}**"]
    if score:
        meta.append(f"▲ {score}")
    if comments:
        meta.append(f"💬 {comments}")
    print(" · ".join(meta))
    print()
    print(f"[{url}]({url})")
    print()

    if source == "HackerNews":
        hn_id_str = news.get("id", "").replace("hn-", "")
        if hn_id_str.isdigit():
            hn_id = int(hn_id_str)
            item = fetch_hn_item(hn_id)
            discussion_url = f"https://news.ycombinator.com/item?id={hn_id}"
            print(f"[HN discussion →]({discussion_url})")
            print()
            top_comments = fetch_hn_comments(item, limit=3)
            if top_comments:
                print("### Top Comments")
                print()
                for c in top_comments:
                    author = c.get("by", "?")
                    text = strip_html(c.get("text", ""))
                    if len(text) > 400:
                        text = text[:400] + "…"
                    print(f"**{author}**: {text}")
                    print()

    elif source == "GitHub Trending":
        print("_GitHub repo — click the link above to browse._")


def list_latest():
    api_url = load_api_url()
    try:
        with urllib.request.urlopen(f"{api_url}/api/news?limit=10", timeout=4) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"Failed to fetch: {e}")
        return

    items = data.get("items", [])[:5]
    if not items:
        print("No news items available.")
        return

    print("## Recent Dev News\n")
    for i, item in enumerate(items, 1):
        title = item.get("title", "")[:90]
        url = item.get("url", "")
        source = item.get("source", "")
        score = item.get("score")
        meta = f"{source}"
        if score:
            meta += f" ▲{score}"
        print(f"{i}. [{title}]({url}) — _{meta}_")
    print()


def main():
    args = sys.argv[1:]
    if not args:
        expand_current()
    elif args[0] in ("latest", "list"):
        list_latest()
    else:
        expand_current()


if __name__ == "__main__":
    main()
