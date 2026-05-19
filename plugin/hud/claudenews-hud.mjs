#!/usr/bin/env node
/**
 * claudenews statusline.
 *
 * Renders the current dev-news item from ~/.claudenews/.current-news.
 * Optionally chains an upstream statusline command set in
 * ~/.claudenews/config.json under `parentStatusLine` — its stdout is
 * prepended so users can keep their existing statusline (OMC HUD, git
 * status, custom script, …) above the news block.
 *
 * Self-contained: no hard dependency on any other plugin.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const CONFIG_FILE = join(HOME, ".claudenews/config.json");
const NEWS_FILE = join(HOME, ".claudenews/.current-news");
const NEWS_TTL_SEC = 3600;

// Read the installed plugin version from the cache dir (folder name == ver)
// so the label tracks updates without editing this file every release.
function detectVersion() {
  try {
    const dir = join(HOME, ".claude/plugins/cache/claudenews/claudenews");
    const vers = readdirSync(dir).filter((v) => /^\d+\.\d+\.\d+/.test(v));
    if (!vers.length) return "";
    vers.sort((a, b) => {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
    });
    return vers[0];
  } catch {
    return "";
  }
}

const _VER = detectVersion();
const FEED_LABEL = _VER ? `[claude-news#${_VER}]` : "[claude-news]";

// Rotating usage guides shown at the END of line 1. Always one is shown
// (width permitting); it cycles every ROTATE_MS so users gradually learn
// every command. The source-picker guide is only in the pool until the
// user has configured sources (then it'd be noise); the rest are evergreen.
const GUIDE_ROTATE_MS = 20000;
const GUIDES_EVERGREEN = [
  "/claudenews:feed to expand this item",
  "/claudenews:viewer for a live news pane + games",
  "/claudenews:translate ko to set language",
  "/claudenews:list to change your news sources",
];
const GUIDE_PICK_SOURCES = "/claudenews:list to pick your news sources";

let stdinData = "";
try {
  stdinData = readFileSync(0, "utf-8");
} catch {}

let parentOutput = "";
let maxCols = 120; // safe default — Claude Code's statusline doesn't pass width
let userOverrodeMaxCols = false;
let sourcesConfigured = false;
if (existsSync(CONFIG_FILE)) {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    sourcesConfigured = cfg.sourcesConfigured === true;
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
        `\x1b[1m${FEED_LABEL}\x1b[0m ` +
        `\x1b[36m${source}\x1b[0m ` +
        `\x1b[2m│\x1b[0m ` +
        titleStyled +
        scoreStr +
        commentsStr;

      // Rotating usage guide appended to the END of line 1 — always shows
      // one (cycling over time), but only if it still fits the terminal
      // width (dropped otherwise so the news line is never pushed to wrap).
      {
        const pool = sourcesConfigured
          ? GUIDES_EVERGREEN
          : [GUIDE_PICK_SOURCES, ...GUIDES_EVERGREEN];
        const guide =
          pool[Math.floor(Date.now() / GUIDE_ROTATE_MS) % pool.length];
        const HINT = "  " + guide;
        const visible = newsLine
          .replace(/\x1b\[[0-9;]*m/g, "")
          .replace(/\x1b\]8;;[^\x07]*\x07/g, "");
        let usedCols = 0;
        for (const ch of visible) usedCols += charCols(ch.codePointAt(0));
        let hintCols = 0;
        for (const ch of HINT) hintCols += charCols(ch.codePointAt(0));
        if (usedCols + hintCols <= maxCols) {
          newsLine += `\x1b[2m${HINT}\x1b[0m`;
        }
      }

      const summary = (raw.summary || "").trim();
      if (summary) {
        // "       ↳ " prefix is 9 display cols; continuation lines indent
        // 9 spaces so wrapped text stays aligned under the first line.
        const innerWidth = Math.max(20, maxCols - 9);
        // Summaries are already capped at ~600 chars upstream, so a high
        // line cap means a normal summary is never truncated here — the …
        // only appears for pathologically long text on a very narrow pane.
        const wrapped = wrapCols(summary, innerWidth, 12);
        wrapped.forEach((ln, i) => {
          if (i === 0) {
            newsLine += `\n\x1b[90m       ↳\x1b[0m \x1b[2m${ln}\x1b[0m`;
          } else {
            newsLine += `\n         \x1b[2m${ln}\x1b[0m`;
          }
        });
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

// Wrap text to `width` display cols across at most `maxLines` lines. Char-
// based (not word-based) so CJK summaries wrap cleanly; the final line gets
// a … if the text didn't fit in maxLines.
function wrapCols(s, width, maxLines) {
  if (!s) return [];
  const all = [];
  let cur = "";
  let cols = 0;
  for (const ch of s) {
    const w = charCols(ch.codePointAt(0));
    if (cols + w > width) {
      all.push(cur);
      cur = "";
      cols = 0;
    }
    cur += ch;
    cols += w;
  }
  if (cur) all.push(cur);
  if (all.length <= maxLines) return all;
  const kept = all.slice(0, maxLines);
  kept[maxLines - 1] = kept[maxLines - 1].replace(/.$/u, "") + "…";
  return kept;
}

if (parentOutput) {
  process.stdout.write(parentOutput);
}
if (newsLine) {
  process.stdout.write((parentOutput ? "\n" : "") + newsLine);
}
process.stdout.write("\n");
