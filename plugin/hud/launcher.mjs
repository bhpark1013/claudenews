#!/usr/bin/env node
/**
 * Thin status-line launcher. setup installs THIS at
 * ~/.claude/hud/claudenews-hud.mjs once; it then locates the newest
 * installed plugin version's real hud and delegates to it. So plugin
 * updates take effect with no /claudenews:setup re-run — the launcher
 * never needs to change.
 *
 * Marketplace-agnostic: scans every cache/<marketplace>/claudenews/<ver>
 * so installs from a renamed/forked marketplace (e.g. claudenews-pr) work
 * too — not just the canonical "claudenews" marketplace.
 *
 * Fails safe: if no cached hud is found it prints a blank line so the
 * status line is never broken.
 */
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const cacheRoot = join(homedir(), ".claude/plugins/cache");

const cmp = (a, b) => {
  const A = a.split(".").map(Number);
  const B = b.split(".").map(Number);
  return B[0] - A[0] || B[1] - A[1] || B[2] - A[2];
};

let target = null;
let best = null;
try {
  for (const mp of readdirSync(cacheRoot)) {
    const pluginBase = join(cacheRoot, mp, "claudenews");
    let vers;
    try {
      vers = readdirSync(pluginBase).filter((v) => /^\d+\.\d+\.\d+/.test(v));
    } catch {
      continue;
    }
    for (const v of vers) {
      const p = join(pluginBase, v, "hud/claudenews-hud.mjs");
      if (existsSync(p) && (best === null || cmp(v, best) < 0)) {
        best = v;
        target = p;
      }
    }
  }
} catch {}

if (target) {
  const r = spawnSync("node", [target], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(r.status ?? 0);
}

process.stdout.write("\n");
