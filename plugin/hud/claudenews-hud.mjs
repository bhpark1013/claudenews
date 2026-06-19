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
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const CONFIG_FILE = join(HOME, ".claudenews/config.json");
const NEWS_FILE = join(HOME, ".claudenews/.current-news");
const NEWS_TTL_SEC = 3600;
// Server-driven usage guides, refreshed into this cache by show-news.py.
// Lets the maintainer change the rotating hints without a client update;
// the HUD falls back to the built-in list below when the cache is absent.
const GUIDES_CACHE = join(HOME, ".claudenews/.guides-cache.json");

// Read the installed plugin version from the cache dir (folder name == ver)
// so the label tracks updates without editing this file every release.
function detectVersion() {
  try {
    // Marketplace-agnostic: scan cache/<marketplace>/claudenews/<ver> and take
    // the newest across ALL marketplaces (matches the launcher), so a stale
    // install under a different marketplace name can't pin the label to an old
    // version.
    const cacheRoot = join(HOME, ".claude/plugins/cache");
    const cmp = (a, b) => {
      const A = a.split(".").map(Number);
      const B = b.split(".").map(Number);
      return B[0] - A[0] || B[1] - A[1] || B[2] - A[2];
    };
    let best = "";
    for (const mp of readdirSync(cacheRoot)) {
      let vers;
      try {
        vers = readdirSync(join(cacheRoot, mp, "claudenews")).filter((v) =>
          /^\d+\.\d+\.\d+/.test(v)
        );
      } catch {
        continue;
      }
      for (const v of vers) if (!best || cmp(v, best) < 0) best = v;
    }
    return best;
  } catch {
    return "";
  }
}

const _VER = detectVersion();
const FEED_LABEL = _VER ? `[claude-news#${_VER}]` : "[claude-news]";

// Rotating usage guides shown at the END of line 1. Always one is shown
// (width permitting); it cycles every ROTATE_MS so users gradually learn
// every command. The pick-sources guide is only in the pool until the
// user has configured sources (then it'd be noise); the rest are evergreen.
const GUIDE_ROTATE_MS = 20000;
// Built-in fallback, used only until the server-driven cache lands. The
// "/claudenews:feed to expand this item" tip was intentionally removed.
const GUIDES_EVERGREEN = [
  "/claudenews:list to see & pick news sources",
  "/claudenews:translate ko to set language",
  "/claudenews:feedback <msg> to send feedback",
  "ask Claude to add r/<sub> as a feed",
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
let navEnabled = false;
// Summary line color (SGR params). Default to a readable light gray instead of
// the faint/dim attribute (\x1b[2m), which many terminals render too low-contrast
// to read. Override via config "summaryColor" (e.g. "37" plain white, "38;5;250"
// lighter gray, "38;5;252" brighter). Validated to digits/semicolons only.
let summaryColor = "38;5;245";
if (existsSync(CONFIG_FILE)) {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    sourcesConfigured = cfg.sourcesConfigured === true;
    navEnabled = cfg.navEnabled === true;
    if (typeof cfg.summaryColor === "string" && /^[0-9;]+$/.test(cfg.summaryColor)) {
      summaryColor = cfg.summaryColor;
    }
    if (typeof cfg.maxStatuslineCols === "number" && cfg.maxStatuslineCols > 20) {
      maxCols = cfg.maxStatuslineCols;
      userOverrodeMaxCols = true;
    }
    const parentCmd = (cfg.parentStatusLine || "").trim();
    if (parentCmd) {
      parentOutput = cachedParentOutput(parentCmd);
    }
  } catch {}
}

// Detect actual terminal column width. Claude Code doesn't pass terminal
// dimensions to statusline commands, so we probe the surrounding
// environment: cmux RPC → tmux display-message → stty via /dev/tty. Each
// channel either works in its environment or fails fast.
if (!userOverrodeMaxCols) {
  const detected = detectTerminalColsCached();
  if (detected && detected > 20) {
    maxCols = detected;
  }
}

// Reserve a small right margin so no rendered row ever reaches the full
// terminal width. Claude Code's status-line renderer lays each row into a
// fixed-width screen buffer and clips a row that fills the last column —
// replacing the final glyph with "…". That looked like a stray ellipsis
// mid-summary (e.g. "효율적으…" with the real next line below). Keeping every
// line strictly narrower than the detected width avoids it, and also absorbs
// the ±1 col our width count can differ from CC's for an ambiguous-width glyph
// like the "↳" summary marker.
maxCols = Math.max(20, maxCols - 2);

// Cache the detected width so the (possibly expensive, e.g. iTerm AppleScript)
// probe runs at most once per TTL instead of on EVERY status-line render. This
// lets refreshInterval go low without paying osascript each frame; a terminal
// resize is reflected within the TTL.
// Stable per-pane cache key. Terminal width is PER-PANE, so the width cache
// must be too: keying by the Claude Code session id (1:1 with a pane,
// terminal-agnostic, always present on stdin) — falling back to the terminal's
// own pane id — stops panes of different widths from clobbering one shared
// cache file every TTL, which made the summary re-wrap to a different line
// count each render (the status bar visibly "flickered" between N and N+1 lines).
function paneCacheKey() {
  try {
    const sid = (JSON.parse(stdinData) || {}).session_id;
    if (sid) return String(sid).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  } catch {}
  const pane = process.env.ITERM_SESSION_ID || process.env.TMUX_PANE || "";
  return pane.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "default";
}

function detectTerminalColsCached() {
  const CACHE = join(HOME, `.claudenews/.cols-cache.${paneCacheKey()}`);
  const TTL_MS = 5000;
  try {
    const raw = JSON.parse(readFileSync(CACHE, "utf-8"));
    if (raw && typeof raw.cols === "number" && Date.now() - raw.ts < TTL_MS) {
      return raw.cols;
    }
  } catch {}
  const cols = detectTerminalCols();
  if (cols && cols > 20) {
    try {
      writeFileSync(CACHE, JSON.stringify({ cols, ts: Date.now() }));
    } catch {}
  }
  return cols;
}

// The upstream statusline (e.g. the OMC HUD) is by far the costliest part of a
// render — ~0.17s vs ~0.03s for the news line — so re-running it on EVERY frame
// is what makes a low refreshInterval expensive. Cache its stdout per-session
// for a short TTL: the news line still re-renders every frame (so key-nav feels
// instant) while the upstream line refreshes only every TTL. Keyed per-session
// because the upstream output is session-specific (model / dir / context); a
// shared file would show one session's HUD in another. Transient failures
// (empty stdout / timeout) are NOT cached so the next frame retries.
function cachedParentOutput(parentCmd) {
  const CACHE = join(HOME, `.claudenews/.parent-cache.${paneCacheKey()}`);
  const TTL_MS = 2000;
  try {
    const raw = JSON.parse(readFileSync(CACHE, "utf-8"));
    if (raw && typeof raw.out === "string" && Date.now() - raw.ts < TTL_MS) {
      return raw.out;
    }
  } catch {}
  const result = spawnSync(parentCmd, [], {
    shell: true,
    input: stdinData,
    encoding: "utf-8",
    timeout: 3000,
  });
  const out = (result.stdout || "").trimEnd();
  if (out) {
    try {
      writeFileSync(CACHE, JSON.stringify({ out, ts: Date.now() }));
    } catch {}
  }
  return out;
}

// Resolve the controlling terminal of the Claude Code process that spawned this
// status line. The status-line child itself usually has no controlling TTY, but
// its parent (Claude Code) does — walk up a few ancestors until one is attached
// to a real terminal device. Returns "/dev/ttysNNN" (or "/dev/pts/N") or null.
function controllingTtyDevice() {
  let pid = process.ppid;
  for (let depth = 0; depth < 6 && pid > 1; depth++) {
    try {
      const r = spawnSync("ps", ["-o", "tty=", "-o", "ppid=", "-p", String(pid)], {
        encoding: "utf-8",
        timeout: 300,
      });
      const parts = (r.stdout || "").trim().split(/\s+/);
      const tty = parts[0] || "";
      const ppid = parseInt(parts[1], 10);
      if (/^(tty|pts)/.test(tty)) return "/dev/" + tty;
      pid = Number.isFinite(ppid) ? ppid : 0;
    } catch {
      break;
    }
  }
  return null;
}

// Read the live window size straight from a tty device. This is the kernel's
// TIOCGWINSZ — the exact column count the terminal renders to — so it's accurate
// for every terminal (iTerm2, Terminal.app, WezTerm, kitty, Ghostty, Alacritty,
// VS Code) and for tmux panes, and never goes stale the way matching on
// ITERM_SESSION_ID can (that env var survives session restoration while the
// session's identity changes underneath it).
function ttyCols(dev) {
  if (!/^\/dev\/[A-Za-z0-9/]+$/.test(dev)) return null;
  try {
    const r = spawnSync("sh", ["-c", `stty size < ${dev} 2>/dev/null`], {
      encoding: "utf-8",
      timeout: 300,
    });
    const n = parseInt((r.stdout || "").trim().split(/\s+/)[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  return null;
}

// Background agents (Claude Code's daemon-spawned sessions, e.g. when attached
// via `claude agents`) have no controlling tty and no TERM_PROGRAM/
// ITERM_SESSION_ID — so neither the tty walk nor the per-terminal probes can
// see the display width. But Claude Code launches each agent's pty-host with
// the display terminal's size baked into argv:
//   claude --bg-pty-host <sock> <cols> <rows> -- ...
// Recover <cols> from the nearest such ancestor. (Set at attach time; a later
// resize isn't reflected until the agent is re-attached — still far better than
// the static fallback.)
function backgroundAgentCols() {
  let pid = process.ppid;
  for (let i = 0; i < 8 && pid > 1; i++) {
    try {
      const r = spawnSync("ps", ["-o", "ppid=", "-o", "command=", "-p", String(pid)], {
        encoding: "utf-8",
        timeout: 300,
      });
      const m = (r.stdout || "").trim().match(/^(\d+)\s+(.*)$/);
      if (!m) break;
      const dims = m[2].match(/--bg-pty-host\s+\S+\s+(\d+)\s+(\d+)/);
      if (dims) {
        const c = parseInt(dims[1], 10);
        if (Number.isFinite(c) && c > 20) return c;
      }
      pid = parseInt(m[1], 10) || 0;
    } catch {
      break;
    }
  }
  return null;
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
  // Primary for non-multiplexed terminals: read the real window size from the
  // controlling tty of the Claude Code process that spawned us. Terminal-agnostic
  // and immune to a stale ITERM_SESSION_ID, so it supersedes the per-terminal
  // probes below (which remain as fallbacks for sandboxes where ps/stty fail).
  const ttyDev = controllingTtyDevice();
  if (ttyDev) {
    const c = ttyCols(ttyDev);
    if (c) return c;
  }
  // No controlling tty (background/daemon agent): recover the display width
  // from the pty-host argv.
  const bgCols = backgroundAgentCols();
  if (bgCols) return bgCols;
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

// Per-session news file: each Claude Code session rotates its own item so
// multiple panes/sessions don't all show the same headline. The status line
// receives the session id on stdin; fall back to the shared global file when
// it's missing (older Claude Code) or that session hasn't rotated yet.
// In nav mode news is global (every session shows the same item), so read the
// shared file directly. Otherwise prefer this session's own rotated item.
let newsFilePath = NEWS_FILE;
if (!navEnabled) {
  let sid = "";
  try {
    sid = (JSON.parse(stdinData) || {}).session_id || "";
  } catch {}
  sid = String(sid).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (sid) {
    const cand = join(HOME, ".claudenews", `.current-news.${sid}`);
    if (existsSync(cand)) newsFilePath = cand;
  }
}

let newsLine = "";
if (existsSync(newsFilePath)) {
  try {
    const raw = JSON.parse(readFileSync(newsFilePath, "utf-8"));
    const age = (Date.now() - raw.timestamp) / 1000;
    if (age < NEWS_TTL_SEC) {
      const title = truncateCols(raw.title || "", maxCols);
      const source = raw.source || "";
      const url = raw.url || "";
      const scoreStr = raw.score ? ` \x1b[33m▲${raw.score}\x1b[0m` : "";
      const commentsStr = raw.comments
        ? ` \x1b[90m💬${raw.comments}\x1b[0m`
        : "";

      // Title is always an OSC 8 hyperlink so a click / ⌘-click opens the
      // article. Terminals without OSC 8 support just render the plain title
      // (the escape is invisible), so this is safe everywhere.
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

      // Rotating usage guide appended to the END of line 1 (server-driven,
      // built-in fallback) — only if it still fits so the line never wraps.
      {
        const evergreen = loadServerGuides() || GUIDES_EVERGREEN;
        let pool = sourcesConfigured
          ? evergreen
          : [GUIDE_PICK_SOURCES, ...evergreen];
        // Key-navigation tips. The activation tip appears ONLY on terminals we
        // can actually drive (never advertise a feature that can't work here)
        // and only while nav is still off; once on, show the shortcut instead.
        if (navEnabled) {
          pool = ["ctrl+shift+←/→ to browse news", ...pool];
        } else if (terminalSupportsNav()) {
          pool = ["/claudenews:nav on — browse news with ctrl+shift+←/→", ...pool];
        }
        const guide =
          pool[Math.floor(Date.now() / GUIDE_ROTATE_MS) % pool.length];
        const HINT = "  " + guide;
        const usedCols = visibleCols(newsLine);
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
            newsLine += `\n\x1b[90m       ↳\x1b[0m \x1b[${summaryColor}m${ln}\x1b[0m`;
          } else {
            newsLine += `\n         \x1b[${summaryColor}m${ln}\x1b[0m`;
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

// ── server-driven guides ────────────────────────────────────────────────────
function loadServerGuides() {
  try {
    const raw = JSON.parse(readFileSync(GUIDES_CACHE, "utf-8"));
    if (raw && Array.isArray(raw.guides)) {
      const cleaned = raw.guides
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => x.trim());
      if (cleaned.length) return cleaned;
    }
  } catch {}
  return null;
}

// Visible column width of a rendered line, ignoring SGR color codes and OSC 8
// hyperlink wrappers.
function visibleCols(line) {
  const visible = line
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\x1b\]8;;[^\x07]*\x07/g, "");
  let c = 0;
  for (const ch of visible) c += charCols(ch.codePointAt(0));
  return c;
}

// Best-effort: is this a terminal whose focused pane's tty the Hammerspoon nav
// tap can resolve (to confirm Claude Code is focused before acting)? Used only
// to decide whether to advertise /claudenews:nav. Conservative — tmux/ssh and
// unknown/unsupported terminals (Ghostty<1.4, Warp, Alacritty, VS Code) ⇒ false
// so we never suggest the feature where it can't work.
function terminalSupportsNav() {
  if (process.env.TMUX) return false; // tmux hides the outer terminal
  const term = process.env.TERM || "";
  if (term.startsWith("screen") || term.startsWith("tmux")) return false;
  const prog = process.env.TERM_PROGRAM || "";
  if (prog === "iTerm.app" || prog === "Apple_Terminal" || prog === "WezTerm") {
    return true;
  }
  if (process.env.KITTY_WINDOW_ID || term.includes("kitty")) return true;
  return false;
}

if (parentOutput) {
  process.stdout.write(parentOutput);
}
if (newsLine) {
  process.stdout.write((parentOutput ? "\n" : "") + newsLine);
}
process.stdout.write("\n");
