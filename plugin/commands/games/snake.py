#!/usr/bin/env python3
"""Terminal Snake. Arrow keys / hjkl, p pause, r restart, q quit."""

import os
import random
import select
import shutil
import sys
import termios
import time
import tty

CSI = "\x1b["
RESET = CSI + "0m"
BOLD = CSI + "1m"
DIM = CSI + "2m"
GREEN = CSI + "32m"
BRIGHT_GREEN = CSI + "92m"
RED = CSI + "91m"
CYAN = CSI + "36m"
GREY = CSI + "90m"
CLEAR = CSI + "2J" + CSI + "H"

TICK_SEC = 0.12
BEST_FILE = os.path.expanduser("~/.claudenews/.snake-best")


def grid_size():
    cols, lines = shutil.get_terminal_size((80, 24))
    # Each cell is 2 cols wide for square-ish look; reserve 1 row for header, 1 for footer
    w = max(20, min(60, (cols - 4) // 2))
    h = max(10, min(25, lines - 4))
    return w, h


def load_best():
    try:
        with open(BEST_FILE) as f:
            return int(f.read().strip() or "0")
    except Exception:
        return 0


def save_best(b):
    try:
        os.makedirs(os.path.dirname(BEST_FILE), exist_ok=True)
        with open(BEST_FILE, "w") as f:
            f.write(str(b))
    except Exception:
        pass


def random_food(w, h, snake):
    free = [(x, y) for x in range(w) for y in range(h) if (x, y) not in snake]
    return random.choice(free) if free else None


def render(snake, food, w, h, score, best, msg, paused):
    out = [CLEAR]
    out.append(
        f"  {BOLD}{BRIGHT_GREEN}Snake{RESET}   "
        f"{DIM}↑↓←→/hjkl move · p pause · r restart · q quit{RESET}"
    )
    out.append(f"  score: {BOLD}{score}{RESET}    best: {DIM}{best}{RESET}    "
               f"{('paused' if paused else '')}")
    head = snake[0] if snake else None
    body = set(snake[1:]) if len(snake) > 1 else set()
    top = "  +" + ("--" * w) + "+"
    out.append(top)
    for y in range(h):
        row = "  |"
        for x in range(w):
            if (x, y) == head:
                row += f"{BRIGHT_GREEN}██{RESET}"
            elif (x, y) in body:
                row += f"{GREEN}▓▓{RESET}"
            elif food and (x, y) == food:
                row += f"{RED}◆ {RESET}"
            else:
                row += "  "
        row += "|"
        out.append(row)
    out.append(top)
    if msg:
        out.append(f"  {msg}")
    sys.stdout.write("\n".join(out) + "\n")
    sys.stdout.flush()


def read_key_nb(fd, timeout):
    try:
        r, _, _ = select.select([fd], [], [], timeout)
    except Exception:
        return ""
    if not r:
        return ""
    try:
        chunk = os.read(fd, 8)
    except OSError:
        return ""
    if not chunk:
        return ""
    if chunk[0:1] != b"\x1b":
        return chunk[0:1].decode("utf-8", errors="ignore")
    if len(chunk) < 3:
        try:
            r, _, _ = select.select([fd], [], [], 0.02)
            if r:
                chunk += os.read(fd, 8)
        except OSError:
            pass
    if len(chunk) >= 3 and chunk[0:2] == b"\x1b[":
        code = chunk[2:3].decode("ascii", errors="ignore")
        return {"A": "UP", "B": "DOWN", "C": "RIGHT", "D": "LEFT"}.get(code, "ESC")
    return "ESC"


def opposite(d1, d2):
    return (d1, d2) in {("L", "R"), ("R", "L"), ("U", "D"), ("D", "U")}


def step(snake, direction, food, w, h):
    """Advance one tick. Returns (new_snake, new_food, gained, dead)."""
    hx, hy = snake[0]
    dx, dy = {"L": (-1, 0), "R": (1, 0), "U": (0, -1), "D": (0, 1)}[direction]
    nx, ny = hx + dx, hy + dy
    if nx < 0 or nx >= w or ny < 0 or ny >= h:
        return snake, food, 0, True
    if (nx, ny) in snake[:-1]:  # tail moves out of the way
        return snake, food, 0, True
    new_snake = [(nx, ny)] + list(snake)
    if food and (nx, ny) == food:
        return new_snake, random_food(w, h, new_snake), 10, False
    new_snake.pop()
    return new_snake, food, 0, False


def reset_state(w, h):
    cx, cy = w // 2, h // 2
    snake = [(cx, cy), (cx - 1, cy), (cx - 2, cy)]
    return snake, "R", random_food(w, h, snake)


def main():
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    tty.setcbreak(fd)
    w, h = grid_size()
    snake, direction, food = reset_state(w, h)
    score = 0
    best = load_best()
    paused = False
    msg = ""
    last_tick = time.time()
    try:
        render(snake, food, w, h, score, best, msg, paused)
        while True:
            timeout = max(0.005, TICK_SEC - (time.time() - last_tick))
            key = read_key_nb(fd, timeout)
            dirty = False
            if key:
                if key in ("q", "Q"):
                    break
                if key in ("r", "R"):
                    w, h = grid_size()
                    snake, direction, food = reset_state(w, h)
                    score = 0
                    paused = False
                    msg = ""
                    dirty = True
                elif key in ("p", "P"):
                    paused = not paused
                    dirty = True
                else:
                    new_dir = None
                    if key in ("UP", "k", "K"):
                        new_dir = "U"
                    elif key in ("DOWN", "j", "J"):
                        new_dir = "D"
                    elif key in ("LEFT", "h", "H"):
                        new_dir = "L"
                    elif key in ("RIGHT", "l", "L"):
                        new_dir = "R"
                    if new_dir and not opposite(direction, new_dir):
                        direction = new_dir
            now = time.time()
            if not paused and not msg.startswith("game over") and now - last_tick >= TICK_SEC:
                last_tick = now
                snake, food, gained, dead = step(snake, direction, food, w, h)
                if dead:
                    msg = "game over · r restart · q quit"
                    if score > best:
                        best = score
                        save_best(best)
                else:
                    score += gained
                    if score > best:
                        best = score
                dirty = True
            if dirty:
                render(snake, food, w, h, score, best, msg, paused)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        sys.stdout.write(RESET + "\n  bye\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.stdout.write(RESET + "\n  bye\n")
