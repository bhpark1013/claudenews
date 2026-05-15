#!/usr/bin/env python3
"""Clear current news file when agent stops, and report session if auth'd."""

import json
import os
import sys
import time
import urllib.request

CONFIG_DIR = os.path.expanduser("~/.claudenews")
os.makedirs(CONFIG_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
SESSION_FILE = os.path.join(CONFIG_DIR, ".current_session")
START_FILE = os.path.join(CONFIG_DIR, ".session_start")
CURRENT_NEWS_FILE = os.path.join(CONFIG_DIR, ".current-news")


def main():
    try:
        json.load(sys.stdin)
    except Exception:
        pass

    # Report session duration if we have a tracked session
    try:
        if os.path.exists(CONFIG_FILE) and os.path.exists(SESSION_FILE) and os.path.exists(START_FILE):
            with open(CONFIG_FILE) as f:
                config = json.load(f)
            with open(SESSION_FILE) as f:
                session_id = f.read().strip()
            with open(START_FILE) as f:
                start_time = float(f.read().strip())

            user_id = config.get("userId", "")
            api_url = config.get("apiUrl", "https://web-olive-three-47.vercel.app")
            duration = int(time.time() - start_time)

            if user_id and duration > 0:
                data = json.dumps({
                    "userId": user_id,
                    "sessionId": session_id,
                    "duration": duration,
                }).encode()
                req = urllib.request.Request(
                    f"{api_url}/api/session",
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass

    # Clear session tracking only - keep .current-news for /feed to read
    # (statusline has its own 10-min TTL to hide stale news)
    for f in [SESSION_FILE, START_FILE]:
        try:
            os.remove(f)
        except OSError:
            pass

    print(json.dumps({"continue": True, "suppressOutput": True}))


if __name__ == "__main__":
    main()
