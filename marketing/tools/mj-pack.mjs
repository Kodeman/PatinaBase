#!/usr/bin/env node
// Midjourney hand-off pack. Midjourney is a human step (its ToS bans automated access): this writes
// copy-paste prompts for Kody, never drives midjourney.com.
// Usage: node marketing/tools/mj-pack.mjs <runDir>
// Writes mj/prompts.md and mj/jobs.json, and creates mj/inbox/<J>/ for every job.
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT, runPaths, readPlan, validatePlan } from "./lib/run.mjs";

const runDir = process.argv[2] && path.resolve(process.argv[2]);
if (!runDir) {
  console.error("usage: mj-pack.mjs <runDir>");
  process.exit(2);
}

const plan = readPlan(runDir);
const errors = validatePlan(plan);
if (errors.length) {
  console.error(`mj-pack: plan.json is invalid:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

const artDirection = fs.readFileSync(
  path.join(REPO_ROOT, "marketing/canon/art-direction.md"),
  "utf8",
);
const sref = (artDirection.match(/^SREF:[ \t]*(.*)$/m)?.[1] ?? "").trim();
const srefSet = sref !== "" && sref !== "{{SREF}}";
if (!srefSet) {
  console.warn(
    "mj-pack: warning: marketing/canon/art-direction.md SREF is still the placeholder; {{SREF}} left in the prompts.",
  );
}

const paths = runPaths(runDir);
fs.mkdirSync(paths.mj, { recursive: true });
const jobs = plan.jobs.map((job) => {
  const params = srefSet ? job.params.replaceAll("{{SREF}}", sref) : job.params;
  const inbox = path.join(paths.inbox, job.id);
  fs.mkdirSync(inbox, { recursive: true });
  return {
    id: job.id,
    kind: job.kind,
    channel: job.channel,
    pieceIds: job.pieceIds,
    variants: job.variants,
    ...(job.startFrom ? { startFrom: job.startFrom } : {}),
    paste: [job.prompt, params].filter((s) => s && s.trim()).join(" "),
    inbox,
  };
});

const inRepo = (p) =>
  path.relative(REPO_ROOT, p).startsWith("..")
    ? p
    : path.relative(REPO_ROOT, p);
const lines = [
  `# Midjourney pack: ${plan.runId}`,
  "",
  "How to run this pack (by hand; nothing here is automated):",
  "",
  "1. Open https://www.midjourney.com/imagine and sign in.",
  "2. For each still job below, paste its block into the prompt bar as-is (the parameters are part of it).",
  "3. Upscale the variants you would pick (the job says how many it wants).",
  "4. Download each upscaled pick and save it into that job's inbox folder (path under the block).",
  "5. For a video job, open your upscaled pick from its `startFrom` still job, choose Animate, paste the",
  "   video block as the motion prompt, and save the mp4 into the video job's inbox folder.",
  `6. When the folders are filled, run \`node marketing/tools/ingest.mjs ${inRepo(runDir)}\` from the repo root.`,
  "",
];
jobs.forEach((job, i) => {
  lines.push(
    `## ${i + 1}. ${job.id}: ${job.kind}, ${job.channel}, for ${job.pieceIds.join(", ")}`,
    "",
  );
  if (job.kind === "video") {
    lines.push(
      `Image-to-video: open your upscaled pick from ${job.startFrom}, choose Animate, and paste this as the motion prompt:`,
      "",
    );
  } else {
    lines.push(
      `Paste, then upscale ${job.variants} pick${job.variants === 1 ? "" : "s"}:`,
      "",
    );
  }
  lines.push("```text", job.paste, "```", "");
  lines.push(
    `Save ${job.kind === "video" ? "the mp4" : "the upscaled picks"} into: \`${job.inbox}\``,
    "",
  );
});

fs.writeFileSync(path.join(paths.mj, "prompts.md"), lines.join("\n"));
fs.writeFileSync(
  path.join(paths.mj, "jobs.json"),
  JSON.stringify(jobs, null, 2) + "\n",
);
console.log(
  `mj-pack: wrote ${path.join(paths.mj, "prompts.md")} (${jobs.length} jobs) and jobs.json`,
);
