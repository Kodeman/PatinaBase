#!/usr/bin/env node
// Keep a run's binaries (RUN_BINARY_PATHS) out of git: archive them to a private R2 bucket, record
// each file's sha256 in <run>/archive.json (committed), fetch them back, and file approved finals
// into the Middle West OneDrive folder that the OneDrive sync client mirrors on this Mac.
// Usage: node marketing/tools/archive.mjs <push|fetch|status|prune|file> <runDir> [args]
//   push   <run>                  upload new or changed binaries; rewrite archive.json
//   fetch  <run> [--only out,approved]   download what is missing locally; verify sha256
//   status <run>                  local vs archived counts
//   prune  <run> [--yes]          delete local mj/inbox, flux and compose once archived (dry run without --yes)
//   file   <run> <P01> [P02 ...]  copy approved/<P>/ into $PATINA_PRESS_ONEDRIVE/<runId>/<P>/
// Env: PRESS_R2_BUCKET (default patina-marketing), PRESS_WRANGLER (wrangler binary),
//      PATINA_PRESS_ONEDRIVE (local Press folder), PATINA_PRESS_ONEDRIVE_URL (its SharePoint web URL).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { REPO_ROOT, RUN_BINARY_PATHS, appendLedger } from "./lib/run.mjs";

const BUCKET = process.env.PRESS_R2_BUCKET || "patina-marketing";
const WRANGLER =
  process.env.PRESS_WRANGLER ||
  path.join(REPO_ROOT, "node_modules/.bin/wrangler");
const ONEDRIVE_PRESS =
  process.env.PATINA_PRESS_ONEDRIVE ||
  path.join(
    os.homedir(),
    "Library/CloudStorage/OneDrive-MiddleWest/FILES/1-Projects/Patina/08 - Marketing & Launch/Press",
  );
const ONEDRIVE_URL =
  process.env.PATINA_PRESS_ONEDRIVE_URL ||
  "https://middleweststudio-my.sharepoint.com/personal/kody_middlewest_studio/Documents/FILES/1-Projects/Patina/08 - Marketing & Launch/Press";
// Local, safe to delete once archived; out/ and approved/ always stay.
const PRUNABLE = ["mj/inbox", "flux", "compose"];
const TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});
const [cmd, runArg, ...rest] = positionals;
if (!["push", "fetch", "status", "prune", "file"].includes(cmd) || !runArg) {
  console.error(
    "usage: archive.mjs <push|fetch|status|prune|file> <runDir> [--only out,approved] [--yes] [P01 ...]",
  );
  process.exit(2);
}
const runDir = path.resolve(runArg);
if (!fs.existsSync(runDir)) {
  console.error(`archive: no run at ${runDir}`);
  process.exit(2);
}
const runId = path.basename(runDir);
const manifestPath = path.join(runDir, "archive.json");

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function walk(abs, rel, out) {
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (st.isFile()) {
    if (path.basename(abs) !== ".DS_Store") out.push(rel);
    return;
  }
  for (const name of fs.readdirSync(abs).sort())
    walk(path.join(abs, name), `${rel}/${name}`, out);
}

// Every binary under the run, as POSIX paths relative to the run dir.
function localFiles() {
  const out = [];
  for (const p of RUN_BINARY_PATHS) walk(path.join(runDir, p), p, out);
  return out;
}

function readManifest() {
  if (!fs.existsSync(manifestPath))
    return { version: 1, bucket: BUCKET, prefix: `runs/${runId}/`, files: {} };
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function writeManifest(m) {
  const files = Object.fromEntries(
    Object.entries(m.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ ...m, files }, null, 2) + "\n",
  );
}

function wrangler(args) {
  const r = spawnSync(WRANGLER, args, { encoding: "utf8", cwd: REPO_ROOT });
  if (r.status !== 0) {
    const why = (r.stderr || r.stdout || r.error?.message || "")
      .trim()
      .split("\n")
      .slice(-3)
      .join(" ");
    throw new Error(`wrangler ${args.slice(0, 3).join(" ")} failed: ${why}`);
  }
}

function push() {
  const m = readManifest();
  let uploaded = 0;
  let unchanged = 0;
  for (const rel of localFiles()) {
    const abs = path.join(runDir, rel);
    const hash = sha256(abs);
    if (m.files[rel]?.sha256 === hash) {
      unchanged++;
      continue;
    }
    const contentType =
      TYPES[path.extname(rel).toLowerCase()] || "application/octet-stream";
    wrangler([
      "r2",
      "object",
      "put",
      `${m.bucket}/${m.prefix}${rel}`,
      "--file",
      abs,
      "--content-type",
      contentType,
      "--remote",
    ]);
    m.files[rel] = { sha256: hash, bytes: fs.statSync(abs).size, contentType };
    // Written after every upload so a failed push keeps what already landed.
    writeManifest(m);
    uploaded++;
  }
  writeManifest(m);
  console.log(
    `archive push ${runId}: ${uploaded} uploaded, ${unchanged} unchanged -> r2://${m.bucket}/${m.prefix}`,
  );
}

function fetchRun() {
  const m = readManifest();
  const only = values.only
    ? values.only.split(",").map((s) => s.trim().replace(/\/$/, ""))
    : null;
  let fetched = 0;
  let present = 0;
  for (const [rel, entry] of Object.entries(m.files)) {
    if (only && !only.some((p) => rel === p || rel.startsWith(`${p}/`)))
      continue;
    const abs = path.join(runDir, rel);
    if (fs.existsSync(abs) && sha256(abs) === entry.sha256) {
      present++;
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.part`;
    wrangler([
      "r2",
      "object",
      "get",
      `${m.bucket}/${m.prefix}${rel}`,
      "--file",
      tmp,
      "--remote",
    ]);
    if (sha256(tmp) !== entry.sha256) {
      fs.rmSync(tmp, { force: true });
      throw new Error(`archive fetch: sha256 mismatch for ${rel}`);
    }
    fs.renameSync(tmp, abs);
    fetched++;
  }
  console.log(
    `archive fetch ${runId}: ${fetched} fetched, ${present} already present`,
  );
}

// Classify every local and archived file.
function survey() {
  const m = readManifest();
  const local = new Set(localFiles());
  const s = { archived: [], notArchived: [], changed: [], missingLocally: [] };
  for (const rel of local) {
    const entry = m.files[rel];
    if (!entry) s.notArchived.push(rel);
    else if (entry.sha256 === sha256(path.join(runDir, rel)))
      s.archived.push(rel);
    else s.changed.push(rel);
  }
  for (const rel of Object.keys(m.files))
    if (!local.has(rel)) s.missingLocally.push(rel);
  return s;
}

function status() {
  const s = survey();
  console.log(
    `archive status ${runId}: ${s.archived.length} archived, ${s.notArchived.length} not archived, ` +
      `${s.changed.length} changed since archive, ${s.missingLocally.length} archived but not local`,
  );
  for (const rel of [...s.notArchived, ...s.changed])
    console.log(`  push needed: ${rel}`);
}

function prune() {
  const s = survey();
  const prunable = (rel) => PRUNABLE.some((p) => rel.startsWith(`${p}/`));
  const blocking = [...s.notArchived, ...s.changed].filter(prunable);
  if (blocking.length) {
    console.error(
      `archive prune ${runId}: refused, ${blocking.length} file(s) not archived yet; run push first`,
    );
    process.exit(1);
  }
  const doomed = s.archived.filter(prunable);
  const bytes = doomed.reduce(
    (n, rel) => n + fs.statSync(path.join(runDir, rel)).size,
    0,
  );
  const mb = (bytes / 1048576).toFixed(1);
  if (!values.yes) {
    console.log(
      `archive prune ${runId}: would delete ${doomed.length} archived file(s), ${mb} MB (dry run; pass --yes)`,
    );
    return;
  }
  for (const p of PRUNABLE)
    fs.rmSync(path.join(runDir, p), { recursive: true, force: true });
  console.log(
    `archive prune ${runId}: deleted ${doomed.length} archived file(s), ${mb} MB`,
  );
}

function fileToOneDrive(pieces) {
  if (!pieces.length) {
    console.error("archive file: name at least one piece, e.g. P01");
    process.exit(2);
  }
  // The parent folder must already exist: it proves the sync client is mirroring the right drive.
  if (!fs.existsSync(path.dirname(ONEDRIVE_PRESS))) {
    console.error(
      `archive file: skipped, OneDrive folder not found at ${path.dirname(ONEDRIVE_PRESS)} (is the OneDrive sync client running?)`,
    );
    process.exit(3);
  }
  for (const piece of pieces) {
    const src = path.join(runDir, "approved", piece);
    if (!fs.existsSync(src)) {
      console.error(`archive file: ${piece} is not approved (no ${src})`);
      process.exit(1);
    }
    const dest = path.join(ONEDRIVE_PRESS, runId, piece);
    fs.mkdirSync(dest, { recursive: true });
    const names = fs
      .readdirSync(src)
      .filter(
        (n) => n !== ".DS_Store" && fs.statSync(path.join(src, n)).isFile(),
      );
    for (const name of names)
      fs.copyFileSync(path.join(src, name), path.join(dest, name));
    const url = `${ONEDRIVE_URL}/${runId}/${piece}`
      .split("/")
      .map((seg, i) => (i < 3 ? seg : encodeURIComponent(seg)))
      .join("/");
    appendLedger(runDir, { stage: "onedrive", piece, files: names, url });
    console.log(
      `archive file ${runId} ${piece}: ${names.length} file(s) -> ${dest}`,
    );
  }
}

try {
  if (cmd === "push") push();
  else if (cmd === "fetch") fetchRun();
  else if (cmd === "status") status();
  else if (cmd === "prune") prune();
  else fileToOneDrive(rest);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
