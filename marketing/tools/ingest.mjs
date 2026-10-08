#!/usr/bin/env node
// Collect what Kody saved into mj/inbox/<J>/ and record every job's asset source in mj/assets.json.
// Empty still jobs get a local FLUX placeholder (flux.mjs) unless --no-flux or mflux is missing.
// Usage: node marketing/tools/ingest.mjs <runDir> [--no-flux]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { CHANNELS, runPaths, readPlan, validatePlan } from "./lib/run.mjs";

const ACCEPTED = new Set([".png", ".jpg", ".jpeg", ".webp", ".mp4"]);
const FLUX_LONG_EDGE = 1536;
const FLUX = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "flux.mjs",
);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "no-flux": { type: "boolean", default: false } },
});
const runDir = positionals[0] && path.resolve(positionals[0]);
if (!runDir) {
  console.error("usage: ingest.mjs <runDir> [--no-flux]");
  process.exit(2);
}

const plan = readPlan(runDir);
const errors = validatePlan(plan);
if (errors.length) {
  console.error(`ingest: plan.json is invalid:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

// Channel size scaled to <= 1536 px on the long edge (physical sizes go through their dpi first).
function fluxSize(channelId) {
  const ch = CHANNELS[channelId];
  const [arW, arH] = ch.ar.split(":").map(Number);
  const scale = ch.unit === "in" ? (ch.dpi ?? 300) : 1;
  let w = ch.width * scale;
  let h = ch.height != null ? ch.height * scale : (w * arH) / arW;
  const long = Math.max(w, h);
  if (ch.unit !== "px" || long > FLUX_LONG_EDGE) {
    const k = FLUX_LONG_EDGE / long;
    w *= k;
    h *= k;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

const paths = runPaths(runDir);
let fluxAvailable = !values["no-flux"];
const assets = {};
for (const job of plan.jobs) {
  const inbox = path.join(paths.inbox, job.id);
  const files = fs.existsSync(inbox)
    ? fs
        .readdirSync(inbox)
        .filter((n) => ACCEPTED.has(path.extname(n).toLowerCase()))
        .sort()
        .map((n) => path.join(inbox, n))
    : [];
  if (files.length) {
    assets[job.id] = { source: "midjourney", files };
    continue;
  }
  if (job.kind !== "still" || !fluxAvailable) {
    assets[job.id] = { source: "missing", files: [] };
    continue;
  }
  const out = path.join(paths.flux, job.id, `${job.id}.png`);
  const { width, height } = fluxSize(job.channel);
  const child = spawnSync(
    process.execPath,
    [
      FLUX,
      "--prompt",
      job.fluxPrompt || job.prompt,
      "--out",
      out,
      "--width",
      String(width),
      "--height",
      String(height),
    ],
    { stdio: "inherit" },
  );
  if (child.status === 0 && fs.existsSync(out)) {
    assets[job.id] = { source: "flux-placeholder", files: [out] };
  } else {
    if (child.status === 3)
      fluxAvailable = false; // mflux not installed: stop trying for later jobs
    else
      console.warn(
        `ingest: flux failed for ${job.id} (exit ${child.status}); recorded as missing`,
      );
    assets[job.id] = { source: "missing", files: [] };
  }
}

fs.mkdirSync(paths.mj, { recursive: true });
fs.writeFileSync(
  path.join(paths.mj, "assets.json"),
  JSON.stringify(assets, null, 2) + "\n",
);
for (const [id, a] of Object.entries(assets))
  console.log(`${id}: ${a.source} (${a.files.length} file(s))`);
