#!/usr/bin/env python3
"""Interactive news-source picker. Runs in a separate tmux pane / terminal
window (same launch path as the viewer) because a slash command's stdout is
captured by Claude Code and has no controlling TTY.

Controls:
  ↑/k ↓/j   move selection
  space     toggle the highlighted source on/off
  a         toggle ALL on/off
  enter     save and quit
  q / ESC   cancel without saving

The current selection (resolved from config, or first-run defaults derived
from your OS language) is shown pre-checked, so you only flip what you want.
"""

import json
import os
import select
import subprocess
import sys
import termios
import tty
import urllib.request

CONFIG_DIR = os.path.expanduser("~/.claudenews")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
SOURCES_CACHE = os.path.join(CONFIG_DIR, ".sources-cache.json")
DEFAULT_API = "https://web-olive-three-47.vercel.app"

CSI = "\x1b["
RESET = CSI + "0m"
BOLD = CSI + "1m"
DIM = CSI + "2m"
CYAN = CSI + "36m"
YELLOW = CSI + "33m"
GREEN = CSI + "32m"
WHITE = CSI + "37m"


def clear():
    sys.stdout.write(CSI + "2J" + CSI + "H")


def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def detect_lang():
    """Mirror show-news.py / list.sh: macOS AppleLocale first, then env."""
    if sys.platform == "darwin":
        try:
            o = subprocess.run(
                ["defaults", "read", "-g", "AppleLocale"],
                capture_output=True, text=True, timeout=2,
            )
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


def load_catalog(api):
    cat = load_json(SOURCES_CACHE)
    if isinstance(cat, list) and cat:
        return cat
    try:
        with urllib.request.urlopen(api + "/api/sources", timeout=5) as r:
            cat = (json.loads(r.read()) or {}).get("sources") or []
        if cat:
            try:
                with open(SOURCES_CACHE, "w") as f:
                    json.dump(cat, f)
            except Exception:
                pass
            return cat
    except Exception:
        pass
    return [
        {"id": "hn", "name": "Hacker News", "defaultOn": True},
        {"id": "github", "name": "GitHub Trending", "defaultOn": True},
    ]


def resolve_selection(cfg, catalog):
    sel = cfg.get("sources")
    if isinstance(sel, dict) and sel:
        return {s["id"]: bool(sel.get(s["id"], False)) for s in catalog}
    lang = detect_lang()
    out = {}
    for s in catalog:
        on = bool(s.get("defaultOn"))
        if not on and lang in (s.get("defaultOnLangs") or []):
            on = True
        out[s["id"]] = on
    return out


def read_key():
    fd = sys.stdin.fileno()
    try:
        chunk = os.read(fd, 8)
    except OSError:
        return ""
    if not chunk:
        return ""
    if chunk[0:1] != b"\x1b":
        try:
            return chunk[0:1].decode("utf-8", errors="ignore")
        except Exception:
            return ""
    if len(chunk) < 3:
        try:
            r, _, _ = select.select([fd], [], [], 0.05)
            if r:
                chunk += os.read(fd, 8)
        except OSError:
            pass
    if len(chunk) >= 3 and chunk[0:2] == b"\x1b[":
        code = chunk[2:3].decode("ascii", errors="ignore")
        return {"A": "UP", "B": "DOWN", "C": "RIGHT", "D": "LEFT"}.get(code, "ESC")
    return "ESC"


def render(catalog, sel, idx, saved_msg=""):
    clear()
    print(
        f"{BOLD}{CYAN}  claudenews — pick news sources{RESET}  "
        f"{DIM}↑↓/jk move · space toggle · a all · enter save · q cancel{RESET}"
    )
    print()
    for i, s in enumerate(catalog):
        sid = s["id"]
        name = s.get("name", sid)
        on = sel.get(sid, False)
        box = f"{GREEN}[x]{RESET}" if on else f"{DIM}[ ]{RESET}"
        if i == idx:
            cursor = f"{YELLOW}▶{RESET}"
            name_c = f"{BOLD}{WHITE}{name}{RESET}"
        else:
            cursor = " "
            name_c = f"{WHITE}{name}{RESET}" if on else f"{DIM}{name}{RESET}"
        print(f"  {cursor} {box} {DIM}{sid:<10}{RESET} {name_c}")
    print()
    n_on = sum(1 for v in sel.values() if v)
    print(f"  {DIM}{n_on}/{len(catalog)} active{RESET}")
    if saved_msg:
        print(f"\n  {GREEN}{saved_msg}{RESET}")


def save(cfg, sel, catalog):
    cfg["sources"] = {s["id"]: bool(sel.get(s["id"], False)) for s in catalog}
    cfg["sourcesConfigured"] = True
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main():
    cfg = load_json(CONFIG_FILE) or {}
    api = cfg.get("apiUrl", DEFAULT_API)
    catalog = load_catalog(api)
    sel = resolve_selection(cfg, catalog)

    fd = sys.stdin.fileno()
    try:
        old = termios.tcgetattr(fd)
        tty.setcbreak(fd)
    except Exception:
        # No TTY (e.g. piped) — fall back to a plain printout.
        for s in catalog:
            mark = "[x]" if sel.get(s["id"]) else "[ ]"
            print(f"  {mark} {s['id']:<10} {s.get('name', '')}")
        print("\n  (no interactive terminal — run /claudenews:list <id> to toggle)")
        return

    idx = 0
    try:
        render(catalog, sel, idx)
        while True:
            if not select.select([fd], [], [], 1.0)[0]:
                continue
            key = read_key()
            if key in ("q", "Q", "ESC"):
                clear()
                print(f"  {DIM}cancelled — no changes saved{RESET}\n")
                return
            if key in ("j", "J", "DOWN"):
                idx = (idx + 1) % len(catalog)
                render(catalog, sel, idx)
            elif key in ("k", "K", "UP"):
                idx = (idx - 1) % len(catalog)
                render(catalog, sel, idx)
            elif key == " ":
                sid = catalog[idx]["id"]
                sel[sid] = not sel.get(sid, False)
                render(catalog, sel, idx)
            elif key in ("a", "A"):
                all_on = all(sel.get(s["id"]) for s in catalog)
                for s in catalog:
                    sel[s["id"]] = not all_on
                render(catalog, sel, idx)
            elif key in ("\r", "\n"):
                save(cfg, sel, catalog)
                enabled = [s["id"] for s in catalog if sel.get(s["id"])]
                render(
                    catalog, sel, idx,
                    saved_msg=f"saved · active: {', '.join(enabled) or '(none)'}",
                )
                print(f"\n  {DIM}closing…{RESET}")
                return
    finally:
        try:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
        except Exception:
            pass
        sys.stdout.write(RESET + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.stdout.write(RESET + "\n  cancelled\n")
