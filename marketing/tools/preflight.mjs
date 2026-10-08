#!/usr/bin/env node
// Press host check. REQUIRED: model gateway answers a 1-token request; Playwright chromium launches.
// OPTIONAL (warn): mflux-generate, ffmpeg, hyperframes, >= 20 GiB free disk.
// Usage: node marketing/tools/preflight.mjs [--json]   Exit 1 only when a required check fails.
// PRESS_SKIP_BROWSER=1 skips the chromium launch (tests only).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REPO_ROOT } from "./lib/run.mjs";

const GATEWAY_URL =
  process.env.GATEWAY_URL ?? "http://127.0.0.1:18764/v1/messages";
const MODEL = process.env.SOL_MODEL || "claude-gpt-6-sol[1m]";
const MIN_FREE_GIB = 20;
const json = process.argv.includes("--json");

function onPath(bin) {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    try {
      fs.accessSync(path.join(dir, bin), fs.constants.X_OK);
      return path.join(dir, bin);
    } catch {}
  }
  return null;
}

async function gateway() {
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok)
      return {
        ok: false,
        detail: `${GATEWAY_URL} answered ${res.status}: ${(await res.text()).slice(0, 200)}`,
      };
    return { ok: true, detail: `${GATEWAY_URL} answered for ${MODEL}` };
  } catch (err) {
    return {
      ok: false,
      detail: `${GATEWAY_URL}: ${err.cause?.code || err.message}`,
    };
  }
}

async function browser() {
  if (process.env.PRESS_SKIP_BROWSER === "1")
    return { ok: null, detail: "skipped (PRESS_SKIP_BROWSER=1)" };
  try {
    const { chromium } = await import("playwright");
    const b = await chromium.launch();
    await b.close();
    return { ok: true, detail: "chromium launched and closed" };
  } catch (err) {
    return { ok: false, detail: err.message.split("\n")[0] };
  }
}

function binary(bin) {
  const found = onPath(bin);
  return found
    ? { ok: true, detail: found }
    : { ok: false, detail: `${bin} is not on PATH` };
}

function hyperframes() {
  const r = spawnSync("npx", ["--no-install", "hyperframes", "--version"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  return r.status === 0
    ? { ok: true, detail: `hyperframes ${r.stdout.trim()}` }
    : { ok: false, detail: "npx --no-install hyperframes --version failed" };
}

function disk() {
  const s = fs.statfsSync(REPO_ROOT);
  const gib = (s.bavail * s.bsize) / 2 ** 30;
  return {
    ok: gib >= MIN_FREE_GIB,
    detail: `${gib.toFixed(1)} GiB free (want >= ${MIN_FREE_GIB})`,
  };
}

const checks = [
  {
    name: "gateway",
    required: true,
    fix: "node ~/.claude/model-gateway/model-gateway.js ensure",
    ...(await gateway()),
  },
  {
    name: "playwright-chromium",
    required: true,
    fix: "npx playwright install chromium",
    ...(await browser()),
  },
  {
    name: "mflux-generate",
    required: false,
    fix: "uv venv ~/.venvs/mflux && VIRTUAL_ENV=~/.venvs/mflux uv pip install mflux==0.9.6 (then put ~/.venvs/mflux/bin on PATH); without it empty still jobs stay missing",
    ...binary("mflux-generate"),
  },
  {
    name: "ffmpeg",
    required: false,
    fix: "brew install ffmpeg",
    ...binary("ffmpeg"),
  },
  {
    name: "hyperframes",
    required: false,
    fix: "video renders are skipped until `npx --no-install hyperframes --version` works (adding it is a scope request)",
    ...hyperframes(),
  },
  {
    name: "disk",
    required: false,
    fix: "free space: retire merged worktrees (scripts/repo-gc.sh lists stragglers as a dry run)",
    ...disk(),
  },
];
const ok = checks.every((c) => !c.required || c.ok !== false);

if (json) {
  console.log(JSON.stringify({ ok, checks }, null, 2));
} else {
  for (const c of checks) {
    const mark =
      c.ok === true
        ? "ok  "
        : c.ok === null
          ? "skip"
          : c.required
            ? "FAIL"
            : "warn";
    console.log(`[${mark}] ${c.name}: ${c.detail}`);
    if (c.ok === false) console.log(`       fix: ${c.fix}`);
  }
  console.log(ok ? "preflight: ready" : "preflight: a required check failed");
}
process.exit(ok ? 0 : 1);
