#!/usr/bin/env node
/**
 * code-earn statusline.
 *
 * Renders the current dev-news item from ~/.code-earn/.current-news.
 * Optionally chains an upstream statusline command set in
 * ~/.code-earn/config.json under `parentStatusLine` — its stdout is
 * prepended so users can keep their existing statusline (OMC HUD, git
 * status, custom script, …) above the news block.
 *
 * Self-contained: no hard dependency on any other plugin.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const CONFIG_FILE = join(HOME, ".code-earn/config.json");
const NEWS_FILE = join(HOME, ".code-earn/.current-news");
const NEWS_TTL_SEC = 3600;

let stdinData = "";
try {
  stdinData = readFileSync(0, "utf-8");
} catch {}

let parentOutput = "";
let maxCols = 120; // safe default — Claude Code's statusline doesn't pass width
let userOverrodeMaxCols = false;
if (existsSync(CONFIG_FILE)) {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    if (typeof cfg.maxStatuslineCols === "number" && cfg.maxStatuslineCols > 20) {
      maxCols = cfg.maxStatuslineCols;
      userOverrodeMaxCols = true;
    }
    const parentCmd = (cfg.parentStatusLine || "").trim();
    if (parentCmd) {
      const result = spawnSync(parentCmd, [], {
        shell: true,
        input: stdinData,
        encoding: "utf-8",
        timeout: 3000,
      });
      parentOutput = (result.stdout || "").trimEnd();
    }
  } catch {}
}

// Detect actual terminal column width. Claude Code doesn't pass terminal
// dimensions to statusline commands, so we probe the surrounding
// environment: cmux RPC → tmux display-message → stty via /dev/tty. Each
// channel either works in its environment or fails fast.
if (!userOverrodeMaxCols) {
  const detected = detectTerminalCols();
  if (detected && detected > 20) {
    maxCols = detected;
  }
}

function detectTerminalCols() {
  if (process.env.CMUX_SOCKET && process.env.CMUX_WORKSPACE_ID) {
    try {
      const r = spawnSync(
        "cmux",
        ["rpc", "pane.list", JSON.stringify({ workspace_id: process.env.CMUX_WORKSPACE_ID })],
        { encoding: "utf-8", timeout: 500 }
      );
      if (r.stdout) {
        const data = JSON.parse(r.stdout);
        const focused = (data.panes || []).find((p) => p.focused) || (data.panes || [])[0];
        if (focused && typeof focused.columns === "number") return focused.columns;
      }
    } catch {}
  }
  // Only query tmux when actually running inside one — otherwise tmux would
  // report some unrelated session's width.
  if (process.env.TMUX) {
    try {
      const r = spawnSync("tmux", ["display-message", "-p", "#{client_width}"], {
        encoding: "utf-8",
        timeout: 300,
      });
      const n = parseInt((r.stdout || "").trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}
  }
  // iTerm2 on macOS: AppleScript exposes the live column count per session.
  // Match by ITERM_SESSION_ID's UUID suffix so multi-window users don't get
  // a sibling window's width.
  if (process.env.TERM_PROGRAM === "iTerm.app") {
    const sid = process.env.ITERM_SESSION_ID || "";
    const m = sid.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i);
    const uuid = m ? m[0] : "";
    const script = uuid
      ? `tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if (unique id of s) is "${uuid}" then return columns of s
      end repeat
    end repeat
  end repeat
end tell`
      : 'tell application "iTerm2" to tell current session of current window to return columns';
    try {
      const r = spawnSync("osascript", ["-e", script], {
        encoding: "utf-8",
        timeout: 500,
      });
      const n = parseInt((r.stdout || "").trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}
  }
  // Last-resort: statusline children usually have no controlling TTY, but
  // when they do this is the most accurate source. Cheap to try.
  try {
    const r = spawnSync("sh", ["-c", "stty size < /dev/tty 2>/dev/null"], {
      encoding: "utf-8",
      timeout: 200,
    });
    const parts = (r.stdout || "").trim().split(/\s+/);
    const n = parseInt(parts[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  return null;
}

let newsLine = "";
if (existsSync(NEWS_FILE)) {
  try {
    const raw = JSON.parse(readFileSync(NEWS_FILE, "utf-8"));
    const age = (Date.now() - raw.timestamp) / 1000;
    if (age < NEWS_TTL_SEC) {
      const title = truncateCols(raw.title || "", maxCols);
      const source = raw.source || "";
      const url = raw.url || "";
      const scoreStr = raw.score ? ` \x1b[33m▲${raw.score}\x1b[0m` : "";
      const commentsStr = raw.comments
        ? ` \x1b[90m💬${raw.comments}\x1b[0m`
        : "";

      const titleStyled = url
        ? `\x1b]8;;${url}\x07\x1b[37;4m${title}\x1b[0m\x1b]8;;\x07`
        : `\x1b[37m${title}\x1b[0m`;

      newsLine =
        `\x1b[90m[feed]\x1b[0m ` +
        `\x1b[36m${source}\x1b[0m ` +
        `\x1b[2m│\x1b[0m ` +
        titleStyled +
        scoreStr +
        commentsStr;

      const summary = (raw.summary || "").trim();
      if (summary) {
        // 8 cols for the "       ↳ " prefix
        const summaryText = truncateCols(summary, Math.max(20, maxCols - 8));
        newsLine += `\n\x1b[90m       ↳\x1b[0m \x1b[2m${summaryText}\x1b[0m`;
      }
    }
  } catch {}
}

// Display width of a code point: CJK / fullwidth = 2, ASCII = 1.
// Conservative for unknown — prefer overcounting so we don't overflow.
function charCols(cp) {
  if (cp < 0x20) return 0;
  if (cp >= 0x1100 && (
    cp <= 0x115f ||
    cp === 0x2329 || cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
  )) return 2;
  return 1;
}

function truncateCols(s, maxCols) {
  if (!s) return "";
  let cols = 0;
  let out = "";
  for (const ch of s) {
    const w = charCols(ch.codePointAt(0));
    if (cols + w > maxCols - 1) return out + "…";
    out += ch;
    cols += w;
  }
  return out;
}

if (parentOutput) {
  process.stdout.write(parentOutput);
}
if (newsLine) {
  process.stdout.write((parentOutput ? "\n" : "") + newsLine);
}
process.stdout.write("\n");
