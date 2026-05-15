#!/usr/bin/env python3
"""Terminal 2048. Arrow keys / hjkl to move, r to restart, q to quit."""

import os
import random
import select
import sys
import termios
import tty

CSI = "\x1b["
RESET = CSI + "0m"
BOLD = CSI + "1m"
DIM = CSI + "2m"
CLEAR = CSI + "2J" + CSI + "H"

TILE_COLORS = {
    0: CSI + "90m",
    2: CSI + "37m",
    4: CSI + "97m",
    8: CSI + "33m",
    16: CSI + "93m",
    32: CSI + "31m",
    64: CSI + "91m",
    128: CSI + "32m",
    256: CSI + "92m",
    512: CSI + "36m",
    1024: CSI + "96m",
    2048: CSI + "35m",
    4096: CSI + "95m",
}

SIZE = 4


def new_board():
    b = [[0] * SIZE for _ in range(SIZE)]
    spawn(b)
    spawn(b)
    return b


def spawn(b):
    empties = [(r, c) for r in range(SIZE) for c in range(SIZE) if b[r][c] == 0]
    if not empties:
        return False
    r, c = random.choice(empties)
    b[r][c] = 4 if random.random() < 0.1 else 2
    return True


def compress_left(row):
    """Slide non-zero entries left, then merge equal adjacent (left to right),
    then slide again. Returns (new_row, gained_score)."""
    nz = [v for v in row if v != 0]
    out = []
    gained = 0
    i = 0
    while i < len(nz):
        if i + 1 < len(nz) and nz[i] == nz[i + 1]:
            merged = nz[i] * 2
            out.append(merged)
            gained += merged
            i += 2
        else:
            out.append(nz[i])
            i += 1
    out += [0] * (SIZE - len(out))
    return out, gained


def move(b, direction):
    """direction in {'L','R','U','D'}. Returns (new_board, gained, changed)."""
    rows = [list(r) for r in b]
    if direction == "R":
        rows = [list(reversed(r)) for r in rows]
    elif direction == "U":
        rows = [list(col) for col in zip(*rows)]  # transpose
    elif direction == "D":
        rows = [list(reversed(col)) for col in zip(*rows)]

    gained = 0
    new_rows = []
    for r in rows:
        nr, g = compress_left(r)
        gained += g
        new_rows.append(nr)

    if direction == "R":
        new_rows = [list(reversed(r)) for r in new_rows]
    elif direction == "U":
        new_rows = [list(col) for col in zip(*new_rows)]
    elif direction == "D":
        # Inverse of (transpose -> reverse each row): un-reverse, then un-transpose.
        new_rows = [list(reversed(r)) for r in new_rows]
        new_rows = [list(col) for col in zip(*new_rows)]

    changed = new_rows != b
    return new_rows, gained, changed


def has_moves(b):
    for r in range(SIZE):
        for c in range(SIZE):
            if b[r][c] == 0:
                return True
            if c + 1 < SIZE and b[r][c] == b[r][c + 1]:
                return True
            if r + 1 < SIZE and b[r][c] == b[r + 1][c]:
                return True
    return False


def render(b, score, best, msg=""):
    out = [CLEAR]
    out.append(f"  {BOLD}2048{RESET}   {DIM}↑↓←→/hjkl move · r restart · q quit{RESET}")
    out.append("")
    out.append(f"  score: {BOLD}{score}{RESET}    best: {DIM}{best}{RESET}")
    out.append("")
    border = "  +" + ("------+" * SIZE)
    for r in range(SIZE):
        out.append(border)
        line = "  |"
        for c in range(SIZE):
            v = b[r][c]
            color = TILE_COLORS.get(v, CSI + "37m")
            cell = "" if v == 0 else str(v)
            line += f"{color}{cell:^6}{RESET}|"
        out.append(line)
    out.append(border)
    if msg:
        out.append("")
        out.append(f"  {msg}")
    sys.stdout.write("\n".join(out) + "\n")
    sys.stdout.flush()


def read_key(fd):
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
            r, _, _ = select.select([fd], [], [], 0.05)
            if r:
                chunk += os.read(fd, 8)
        except OSError:
            pass
    if len(chunk) >= 3 and chunk[0:2] == b"\x1b[":
        code = chunk[2:3].decode("ascii", errors="ignore")
        return {"A": "UP", "B": "DOWN", "C": "RIGHT", "D": "LEFT"}.get(code, "ESC")
    return "ESC"


BEST_FILE = os.path.expanduser("~/.claudenews/.2048-best")


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


def main():
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    tty.setcbreak(fd)
    board = new_board()
    score = 0
    best = load_best()
    msg = ""
    try:
        render(board, score, best, msg)
        while True:
            key = read_key(fd)
            if key in ("q", "Q"):
                break
            if key in ("r", "R"):
                board = new_board()
                score = 0
                msg = "restarted"
                render(board, score, best, msg)
                continue
            direction = None
            if key in ("UP", "k", "K"):
                direction = "U"
            elif key in ("DOWN", "j", "J"):
                direction = "D"
            elif key in ("LEFT", "h", "H"):
                direction = "L"
            elif key in ("RIGHT", "l", "L"):
                direction = "R"
            if not direction:
                continue
            board, gained, changed = move(board, direction)
            if changed:
                score += gained
                if score > best:
                    best = score
                    save_best(best)
                spawn(board)
                if not has_moves(board):
                    msg = "game over · r restart · q quit"
                else:
                    msg = ""
            render(board, score, best, msg)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        sys.stdout.write(RESET + "\n  bye\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.stdout.write(RESET + "\n  bye\n")
