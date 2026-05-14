#!/usr/bin/env python3
"""Live-updating news viewer. Runs in a separate tmux pane or terminal window.

Controls (news mode):
  ↑/k     move selection up
  ↓/j     move selection down
  Enter/o open selected item in browser
  space   toggle summary for selected item
  r       refresh now
  g       switch to game mode
  q       quit

Controls (game mode):
  ↑↓/jk   move selection
  Enter   launch selected game
  g/ESC   back to news
  q       quit
"""

import json
import os
import locale as _locale
import select
import shutil
import subprocess
import sys
import termios
import time
import tty
import urllib.request
import webbrowser

API_URL = "https://web-olive-three-47.vercel.app/api/news?limit=50"
CONFIG_DIR = os.path.expanduser("~/.code-earn")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
CURRENT_NEWS = os.path.join(CONFIG_DIR, ".current-news")
TRANSLATION_CACHE = os.path.join(CONFIG_DIR, ".translation-cache.json")
SUMMARY_CACHE = os.path.join(CONFIG_DIR, ".summary-cache.json")
SUMMARY_STATUS = os.path.join(CONFIG_DIR, ".summary-status.json")
TRANSLATOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hooks", "translator.py")
SUMMARIZER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hooks", "summarizer.py")
GAMES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "games")
REFRESH_SEC = 30

GAMES = [
    {"name": "2048", "desc": "merge tiles to 2048", "script": "game_2048.py"},
    {"name": "Snake", "desc": "classic snake game", "script": "snake.py"},
]

CSI = "\x1b["
RESET = CSI + "0m"
BOLD = CSI + "1m"
DIM = CSI + "2m"
CYAN = CSI + "36m"
YELLOW = CSI + "33m"
GREEN = CSI + "32m"
GREY = CSI + "90m"
WHITE = CSI + "37m"


def clear():
    sys.stdout.write(CSI + "2J" + CSI + "H")


def term_cols():
    try:
        return shutil.get_terminal_size().columns
    except Exception:
        return 80


def fetch_news():
    try:
        req = urllib.request.Request(API_URL, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e), "items": []}


def current_url():
    if not os.path.exists(CURRENT_NEWS):
        return None
    try:
        with open(CURRENT_NEWS) as f:
            return json.load(f).get("url")
    except Exception:
        return None


def load_translation_cache():
    if not os.path.exists(TRANSLATION_CACHE):
        return {}
    try:
        with open(TRANSLATION_CACHE) as f:
            return json.load(f)
    except Exception:
        return {}


def load_summary_cache():
    if not os.path.exists(SUMMARY_CACHE):
        return {}
    try:
        with open(SUMMARY_CACHE) as f:
            return json.load(f)
    except Exception:
        return {}


def lookup_summary(cache, target_lang, url):
    if not url:
        return None
    entry = cache.get(f"{target_lang}::{url}")
    if entry and entry.get("summary"):
        return entry["summary"]
    return None


def lookup_summary_stage(url):
    """Return current background stage for url ('fetching'|'translating'|'error') or None."""
    if not url or not os.path.exists(SUMMARY_STATUS):
        return None
    try:
        with open(SUMMARY_STATUS) as f:
            statuses = json.load(f)
        entry = statuses.get(url)
        if isinstance(entry, dict):
            return entry.get("stage")
    except Exception:
        pass
    return None


def spawn_summarizer(target_lang, url, original_title):
    if not (url and original_title and os.path.exists(SUMMARIZER)):
        return
    env = os.environ.copy()
    env["CODE_EARN_BACKGROUND_CHILD"] = "1"
    try:
        subprocess.Popen(
            ["python3", SUMMARIZER, target_lang, url, original_title],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            env=env,
        )
    except Exception:
        pass


def detect_lang():
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


def translation_settings():
    translate_enabled = True
    target_lang = None
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE) as f:
                cfg = json.load(f)
            if "translate" in cfg:
                translate_enabled = bool(cfg["translate"])
            target_lang = cfg.get("translateLang")
        except Exception:
            pass
    if not target_lang:
        target_lang = detect_lang()
    if target_lang == "en":
        translate_enabled = False
    return translate_enabled, target_lang


def apply_translations(items, target_lang, cache):
    """Replace each item's title with cached translation if available.
    Does NOT spawn background translators — statusline rotation handles that
    one item at a time to avoid notification spam."""
    for item in items:
        original = item.get("title", "")
        key = f"{target_lang}::{original}"
        entry = cache.get(key)
        if entry and entry.get("translation"):
            item["title"] = entry["translation"]
            item["_original_title"] = original


def truncate(s, n):
    return s if len(s) <= n else s[: n - 1] + "…"


def wrap_text(s, width):
    """Naive word-wrap. Splits on spaces; preserves long tokens."""
    if not s:
        return [""]
    words = s.split()
    lines = []
    cur = ""
    for w in words:
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= width:
            cur += " " + w
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def supports_osc8():
    """Heuristic check for terminals known to render OSC 8 hyperlinks."""
    tp = os.environ.get("TERM_PROGRAM", "")
    term = os.environ.get("TERM", "")
    known = {"iTerm.app", "WezTerm", "vscode", "ghostty"}
    if tp in known:
        return True
    if "kitty" in term or os.environ.get("KITTY_WINDOW_ID"):
        return True
    if os.environ.get("ALACRITTY_SOCKET"):
        return True
    if os.environ.get("WEZTERM_EXECUTABLE"):
        return True
    # Apple Terminal started shipping OSC 8 support; gate by version if needed
    if tp == "Apple_Terminal":
        return True
    return False


def short_url(url):
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        p = urlparse(url)
        host = p.netloc.replace("www.", "")
        path = p.path or ""
        if len(path) > 30:
            path = path[:29] + "…"
        s = host + path
        return s if len(s) < 45 else s[:44] + "…"
    except Exception:
        return url[:40]


def render(data, current, cols, selected_idx=0, summary_state=None):
    clear()
    header = (
        f"{BOLD}{CYAN}  code-earn feed{RESET}  "
        f"{DIM}↑↓/jk select · enter/o open · space summary · r refresh · q quit{RESET}"
    )
    print(header)
    print()

    if not data or data.get("error"):
        err = (data or {}).get("error", "no data")
        print(f"  {YELLOW}error:{RESET} {err}")
        return

    items = list(data.get("items", []) or [])
    if not items:
        print(f"  {DIM}no news available{RESET}")
        return

    translate_enabled, target_lang = translation_settings()
    if translate_enabled:
        cache = load_translation_cache()
        apply_translations(items, target_lang, cache)

    clickable = supports_osc8()
    # Reserve extra room for URL tail when links aren't clickable
    tail_w = 0 if clickable else 46
    title_w = max(20, cols - 40 - tail_w)

    for idx, item in enumerate(items):
        title = truncate(item.get("title", ""), title_w)
        source = item.get("source", "")
        score = item.get("score")
        url = item.get("url", "")
        comments = item.get("comments")

        is_selected = idx == selected_idx
        is_current = url == current
        if is_selected:
            cursor = f"{YELLOW}▶{RESET}"
        elif is_current:
            cursor = f"{GREEN}●{RESET}"
        else:
            cursor = " "

        score_str = f" {YELLOW}▲{score}{RESET}" if score else ""
        comments_str = f" {GREY}💬{comments}{RESET}" if comments else ""

        # OSC 8 hyperlink around title (harmless if unsupported)
        title_color = BOLD + WHITE if is_selected else WHITE
        linked_title = (
            f"\x1b]8;;{url}\x07{title_color}{title}{RESET}\x1b]8;;\x07"
            if url
            else f"{title_color}{title}{RESET}"
        )

        url_tail = ""
        if not clickable and url:
            url_tail = f"  {GREY}{short_url(url)}{RESET}"

        print(f"  {cursor} {CYAN}{source:<15}{RESET} {linked_title}{score_str}{comments_str}{url_tail}")

    if summary_state and 0 <= selected_idx < len(items):
        sel_url = items[selected_idx].get("url", "")
        if sel_url and summary_state.get("url") == sel_url:
            print()
            status = summary_state.get("status")
            text = summary_state.get("text") or ""
            label = f"{CYAN}↳ summary{RESET}"
            if status == "loading":
                stage = summary_state.get("stage")
                stage_msg = {
                    "fetching": "fetching page…",
                    "translating": "translating…",
                }.get(stage, "starting…")
                print(f"  {label} {DIM}{stage_msg}{RESET}")
            elif status == "error":
                print(f"  {label} {YELLOW}(no description available){RESET}")
            elif text:
                wrap_w = max(40, cols - 6)
                for line in wrap_text(text, wrap_w):
                    print(f"  {DIM}{line}{RESET}")

    print()
    footer = (
        f"{DIM}{YELLOW}▶{DIM} selected · {GREEN}●{DIM} in status line{RESET}"
    )
    if not clickable:
        footer += f"  {DIM}· URLs shown on right (cmd+click unsupported){RESET}"
    print(f"  {footer}")


def key_available(timeout):
    r, _, _ = select.select([sys.stdin], [], [], timeout)
    return bool(r)


def read_key():
    """Read one logical key. Arrow keys (ESC [ A/B/C/D) are returned as
    'UP', 'DOWN', 'RIGHT', 'LEFT'. Plain ESC returns 'ESC'. Otherwise the
    raw character is returned.

    Uses os.read on the raw fd so the bytes that follow ESC don't get
    swallowed by Python's stdin buffer (select() can't see those)."""
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
    # Possible CSI escape sequence (ESC [ ...). If the rest didn't arrive
    # in the same read, peek the fd one more time.
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


def fd_key_available(fd, timeout):
    try:
        r, _, _ = select.select([fd], [], [], timeout)
        return bool(r)
    except Exception:
        return False


def items_count(data):
    return len(list((data or {}).get("items", []) or []))


def open_selected(data, idx):
    items = list((data or {}).get("items", []) or [])
    if 0 <= idx < len(items):
        url = items[idx].get("url")
        if url:
            try:
                webbrowser.open(url)
            except Exception:
                pass


SUMMARY_TIMEOUT_SEC = 35


def render_games(selected_idx, cols, msg=""):
    clear()
    header = (
        f"{BOLD}{CYAN}  code-earn games{RESET}  "
        f"{DIM}↑↓/jk select · enter launch · g/esc back · q quit{RESET}"
    )
    print(header)
    print()
    for idx, game in enumerate(GAMES):
        cursor = f"{YELLOW}▶{RESET}" if idx == selected_idx else " "
        name = game.get("name", "")
        desc = game.get("desc", "")
        title_color = BOLD + WHITE if idx == selected_idx else WHITE
        print(f"  {cursor} {title_color}{name:<10}{RESET} {DIM}{desc}{RESET}")
    print()
    if msg:
        print(f"  {DIM}{msg}{RESET}")


def launch_game(idx, fd, old_termios):
    """Restore terminal mode, run the game as a subprocess, then re-enter raw mode."""
    if not (0 <= idx < len(GAMES)):
        return
    script = os.path.join(GAMES_DIR, GAMES[idx]["script"])
    if not os.path.exists(script):
        return
    # Hand the terminal back to the child
    try:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_termios)
    except Exception:
        pass
    sys.stdout.write(CSI + "2J" + CSI + "H")
    sys.stdout.flush()
    try:
        subprocess.call(["python3", script])
    except Exception as exc:
        sys.stdout.write(f"\n  game error: {exc}\n")
    finally:
        try:
            tty.setcbreak(fd)
        except Exception:
            pass


def selected_item(data, idx):
    items = list((data or {}).get("items", []) or [])
    if 0 <= idx < len(items):
        return items[idx]
    return None


def _build_summary_state(item, target_lang, spawn_if_missing):
    url = item.get("url") or ""
    if not url:
        return None
    cache = load_summary_cache()
    cached = lookup_summary(cache, target_lang, url)
    if cached:
        return {"url": url, "status": "ready", "text": cached, "lang": target_lang}
    if spawn_if_missing:
        original = item.get("_original_title") or item.get("title") or ""
        spawn_summarizer(target_lang, url, original)
    return {
        "url": url,
        "status": "loading",
        "text": "",
        "lang": target_lang,
        "started": time.time(),
    }


def toggle_summary(data, idx, summary_state):
    """Space key: toggle summary for the selected item."""
    item = selected_item(data, idx)
    if not item:
        return summary_state
    url = item.get("url") or ""
    if not url:
        return summary_state
    # Toggle off if same URL is already shown
    if summary_state and summary_state.get("url") == url:
        return None
    _, target_lang = translation_settings()
    return _build_summary_state(item, target_lang, spawn_if_missing=True)


def autoload_summary(data, idx, summary_state):
    """Arrow-key navigation: auto-load summary for the new selection."""
    item = selected_item(data, idx)
    if not item:
        return summary_state
    url = item.get("url") or ""
    if not url:
        return summary_state
    # Skip rebuild if we're already on this URL and have content / loading
    if summary_state and summary_state.get("url") == url:
        return summary_state
    _, target_lang = translation_settings()
    return _build_summary_state(item, target_lang, spawn_if_missing=True)


def refresh_summary_state(state):
    if not state or state.get("status") != "loading":
        return state
    cache = load_summary_cache()
    cached = lookup_summary(cache, state.get("lang", "en"), state.get("url", ""))
    if cached:
        state["status"] = "ready"
        state["text"] = cached
        state["stage"] = None
        return state
    stage = lookup_summary_stage(state.get("url", ""))
    if stage == "error":
        state["status"] = "error"
        state["stage"] = None
        return state
    state["stage"] = stage  # 'fetching' | 'translating' | None
    if time.time() - state.get("started", 0) > SUMMARY_TIMEOUT_SEC:
        state["status"] = "error"
    return state


def main():
    # Set stdin to cbreak so we can read single keys without Enter
    fd = sys.stdin.fileno()
    try:
        old = termios.tcgetattr(fd)
        tty.setcbreak(fd)
        interactive = True
    except Exception:
        interactive = False
        old = None

    selected_idx = 0
    summary_state = None
    mode = "news"
    game_idx = 0

    def render_current():
        if mode == "games":
            render_games(game_idx, term_cols())
        else:
            render(data, current_url(), term_cols(), selected_idx, summary_state)

    try:
        data = fetch_news()
        last_fetch = time.time()
        summary_state = autoload_summary(data, selected_idx, summary_state)
        render_current()

        while True:
            # Wait up to REFRESH_SEC for a key, then auto-refresh
            now = time.time()
            remaining = REFRESH_SEC - (now - last_fetch)
            if mode == "news" and remaining <= 0:
                data = fetch_news()
                last_fetch = time.time()
                selected_idx = max(0, min(selected_idx, items_count(data) - 1))
                summary_state = refresh_summary_state(summary_state)
                render_current()
                continue

            wait = min(max(remaining, 0.0), 1.0) if mode == "news" else 1.0

            if interactive and fd_key_available(fd, wait):
                key = read_key()
                if key in ("q", "Q"):
                    break
                if key in ("g", "G"):
                    mode = "games" if mode == "news" else "news"
                    render_current()
                    continue
                if mode == "games":
                    if key == "ESC":
                        mode = "news"
                        render_current()
                        continue
                    if key in ("j", "J", "DOWN"):
                        if GAMES:
                            game_idx = (game_idx + 1) % len(GAMES)
                            render_current()
                        continue
                    if key in ("k", "K", "UP"):
                        if GAMES:
                            game_idx = (game_idx - 1) % len(GAMES)
                            render_current()
                        continue
                    if key in ("\r", "\n"):
                        launch_game(game_idx, fd, old)
                        render_current()
                        continue
                    continue
                # ---- news mode ----
                if key in ("r", "R"):
                    data = fetch_news()
                    last_fetch = time.time()
                    selected_idx = max(0, min(selected_idx, items_count(data) - 1))
                    summary_state = refresh_summary_state(summary_state)
                    render_current()
                    continue
                if key in ("j", "J", "DOWN"):
                    n = items_count(data)
                    if n:
                        selected_idx = (selected_idx + 1) % n
                        summary_state = autoload_summary(data, selected_idx, summary_state)
                        render_current()
                    continue
                if key in ("k", "K", "UP"):
                    n = items_count(data)
                    if n:
                        selected_idx = (selected_idx - 1) % n
                        summary_state = autoload_summary(data, selected_idx, summary_state)
                        render_current()
                    continue
                if key == " ":
                    summary_state = toggle_summary(data, selected_idx, summary_state)
                    render_current()
                    continue
                if key in ("\r", "\n", "o", "O"):
                    open_selected(data, selected_idx)
                    continue
            else:
                if mode == "news":
                    summary_state = refresh_summary_state(summary_state)
                    render_current()
                if not interactive:
                    time.sleep(1)
    finally:
        if interactive and old is not None:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
        print(RESET + "\n  bye")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(RESET + "\n  bye")
