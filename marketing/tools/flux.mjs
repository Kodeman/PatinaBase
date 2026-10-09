#!/usr/bin/env node
// Local FLUX placeholder still via mflux (schnell). Placeholders only: Midjourney stays the real source.
// Usage: node marketing/tools/flux.mjs --prompt <text> --out <png> --width <n> --height <n> [--steps 4]
// Exit 3 when mflux-generate is not installed.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const MFLUX_INSTALL =
  "uv venv ~/.venvs/mflux && VIRTUAL_ENV=~/.venvs/mflux uv pip install mflux==0.9.6, then put ~/.venvs/mflux/bin on PATH";

const { values } = parseArgs({
  options: {
    prompt: { type: "string" },
    out: { type: "string" },
    width: { type: "string" },
    height: { type: "string" },
    steps: { type: "string", default: "4" },
  },
});

// mflux needs dimensions in multiples of 16.
const round16 = (n) => Math.max(16, Math.round(Number(n) / 16) * 16);
const width = round16(values.width);
const height = round16(values.height);
if (
  !values.prompt ||
  !values.out ||
  !Number.isFinite(width) ||
  !Number.isFinite(height)
) {
  console.error(
    "usage: flux.mjs --prompt <text> --out <png> --width <n> --height <n> [--steps 4]",
  );
  process.exit(2);
}

const out = resolve(values.out);
mkdirSync(dirname(out), { recursive: true });
const args = [
  "--model",
  "schnell",
  "--prompt",
  values.prompt,
  "--steps",
  String(values.steps),
  "--width",
  String(width),
  "--height",
  String(height),
  "--output",
  out,
];
const child = spawnSync("mflux-generate", args, { stdio: "inherit" });
if (child.error && child.error.code === "ENOENT") {
  console.error(`flux: mflux-generate is not installed. Fix: ${MFLUX_INSTALL}`);
  process.exit(3);
}
if (child.error) {
  console.error(`flux: ${child.error.message}`);
  process.exit(1);
}
process.exit(child.status ?? 1);
