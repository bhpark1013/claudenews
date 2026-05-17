#!/usr/bin/env python3
"""Stop hook. Intentionally minimal: we keep ~/.claudenews/.current-news so
/feed can still read the last item, and the status line has its own TTL to
hide stale news. No session tracking, no network calls."""

import json
import sys


def main():
    try:
        json.load(sys.stdin)
    except Exception:
        pass
    print(json.dumps({"continue": True, "suppressOutput": True}))


if __name__ == "__main__":
    main()
