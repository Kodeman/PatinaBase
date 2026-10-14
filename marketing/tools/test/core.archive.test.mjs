import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.join(here, "..");
const SAMPLE = path.join(here, "fixtures", "run-sample");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// The sample run plus a few binaries in every archived location.
function copyRun() {
  const runDir = path.join(tmp("press-archive-"), "2026-10-08-sample");
  fs.cpSync(SAMPLE, runDir, { recursive: true });
  for (const rel of [
    "out/P01/P01.png",
    "compose/P01/index.html",
    "approved/P01/P01.png",
  ]) {
    fs.mkdirSync(path.dirname(path.join(runDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(runDir, rel), `bytes of ${rel}`);
  }
  fs.writeFileSync(path.join(runDir, "board.html"), "<html>board</html>");
  return runDir;
}

// A fake wrangler: `r2 object put|get <bucket>/<key> --file <f>` against a directory; logs argv.
function fakeWrangler() {
  const dir = tmp("press-r2-");
  const store = path.join(dir, "store");
  const log = path.join(dir, "calls.jsonl");
  const bin = path.join(dir, "wrangler");
  fs.writeFileSync(
    bin,
    `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n');
const obj = path.join(${JSON.stringify(store)}, a[3]);
const file = a[a.indexOf('--file') + 1];
if (a[2] === 'put') { fs.mkdirSync(path.dirname(obj), { recursive: true }); fs.copyFileSync(file, obj); }
else if (a[2] === 'get') { if (!fs.existsSync(obj)) { console.error('not found'); process.exit(1); } fs.copyFileSync(obj, file); }
`,
    { mode: 0o755 },
  );
  const calls = () =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l))
      : [];
  return { bin, store, calls };
}

function archive(args, env = {}) {
  return spawnSync(
    process.execPath,
    [path.join(TOOLS, "archive.mjs"), ...args],
    {
      encoding: "utf8",
      env: { ...process.env, PRESS_R2_BUCKET: "test-bucket", ...env },
    },
  );
}

test("push archives every binary under runs/<runId>/ and writes archive.json", () => {
  const runDir = copyRun();
  const r2 = fakeWrangler();
  const r = archive(["push", runDir], { PRESS_WRANGLER: r2.bin });
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(
    fs.readFileSync(path.join(runDir, "archive.json"), "utf8"),
  );
  assert.equal(m.prefix, "runs/2026-10-08-sample/");
  assert.deepEqual(Object.keys(m.files).sort(), [
    "approved/P01/P01.png",
    "board.html",
    "compose/P01/index.html",
    "mj/inbox/J01/sample.png",
    "out/P01/P01.png",
  ]);
  assert.equal(m.files["out/P01/P01.png"].contentType, "image/png");
  // Record files never leave git.
  assert.ok(
    !Object.keys(m.files).some(
      (k) => k.startsWith("copy/") || k === "plan.json",
    ),
  );
  assert.ok(
    fs.existsSync(
      path.join(r2.store, "test-bucket/runs/2026-10-08-sample/out/P01/P01.png"),
    ),
  );
});

test("a second push uploads nothing; a changed file uploads alone", () => {
  const runDir = copyRun();
  const r2 = fakeWrangler();
  archive(["push", runDir], { PRESS_WRANGLER: r2.bin });
  const first = r2.calls().length;
  const again = archive(["push", runDir], { PRESS_WRANGLER: r2.bin });
  assert.match(again.stdout, /0 uploaded/);
  assert.equal(r2.calls().length, first);
  fs.writeFileSync(path.join(runDir, "board.html"), "<html>board v2</html>");
  const changed = archive(["push", runDir], { PRESS_WRANGLER: r2.bin });
  assert.match(changed.stdout, /1 uploaded/);
  assert.equal(
    r2.calls().at(-1)[3],
    "test-bucket/runs/2026-10-08-sample/board.html",
  );
});

test("fetch restores missing files and verifies sha256; --only limits it", () => {
  const runDir = copyRun();
  const r2 = fakeWrangler();
  archive(["push", runDir], { PRESS_WRANGLER: r2.bin });
  fs.rmSync(path.join(runDir, "out"), { recursive: true });
  fs.rmSync(path.join(runDir, "board.html"));
  const only = archive(["fetch", runDir, "--only", "out"], {
    PRESS_WRANGLER: r2.bin,
  });
  assert.equal(only.status, 0, only.stderr);
  assert.match(only.stdout, /1 fetched/);
  assert.ok(fs.existsSync(path.join(runDir, "out/P01/P01.png")));
  assert.ok(!fs.existsSync(path.join(runDir, "board.html")));
  // A corrupted object is refused and leaves no partial file behind.
  fs.writeFileSync(
    path.join(r2.store, "test-bucket/runs/2026-10-08-sample/board.html"),
    "tampered",
  );
  const bad = archive(["fetch", runDir], { PRESS_WRANGLER: r2.bin });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /sha256 mismatch for board\.html/);
  assert.ok(!fs.existsSync(path.join(runDir, "board.html")));
  assert.ok(!fs.existsSync(path.join(runDir, "board.html.part")));
});

test("status reports unarchived and changed files", () => {
  const runDir = copyRun();
  const r2 = fakeWrangler();
  const before = archive(["status", runDir]);
  assert.match(before.stdout, /0 archived, 5 not archived/);
  archive(["push", runDir], { PRESS_WRANGLER: r2.bin });
  fs.writeFileSync(path.join(runDir, "out/P01/P01.png"), "new pixels");
  const after = archive(["status", runDir]);
  assert.match(
    after.stdout,
    /4 archived, 0 not archived, 1 changed since archive/,
  );
  assert.match(after.stdout, /push needed: out\/P01\/P01\.png/);
});

test("prune refuses before push, dry-runs without --yes, keeps out/ and approved/", () => {
  const runDir = copyRun();
  const r2 = fakeWrangler();
  assert.equal(archive(["prune", runDir, "--yes"]).status, 1);
  archive(["push", runDir], { PRESS_WRANGLER: r2.bin });
  const dry = archive(["prune", runDir]);
  assert.match(dry.stdout, /would delete 2 archived file\(s\)/);
  assert.ok(fs.existsSync(path.join(runDir, "compose")));
  const real = archive(["prune", runDir, "--yes"]);
  assert.equal(real.status, 0, real.stderr);
  assert.ok(!fs.existsSync(path.join(runDir, "compose")));
  assert.ok(!fs.existsSync(path.join(runDir, "mj/inbox")));
  assert.ok(fs.existsSync(path.join(runDir, "out/P01/P01.png")));
  assert.ok(fs.existsSync(path.join(runDir, "approved/P01/P01.png")));
  assert.ok(fs.existsSync(path.join(runDir, "plan.json")));
});

test("file copies approved pieces into the OneDrive Press folder and records the link", () => {
  const runDir = copyRun();
  const parent = tmp("press-onedrive-");
  const press = path.join(parent, "Press");
  const env = {
    PATINA_PRESS_ONEDRIVE: press,
    PATINA_PRESS_ONEDRIVE_URL:
      "https://example.sharepoint.com/Documents/08 - Marketing & Launch/Press",
  };
  const r = archive(["file", runDir, "P01"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    fs.readFileSync(path.join(press, "2026-10-08-sample/P01/P01.png"), "utf8"),
    "bytes of approved/P01/P01.png",
  );
  const ledger = JSON.parse(
    fs.readFileSync(path.join(runDir, "ledger.json"), "utf8"),
  );
  const entry = ledger.at(-1);
  assert.equal(entry.stage, "onedrive");
  assert.equal(entry.piece, "P01");
  assert.equal(
    entry.url,
    "https://example.sharepoint.com/Documents/08%20-%20Marketing%20%26%20Launch/Press/2026-10-08-sample/P01",
  );
  // An unapproved piece is refused; a missing OneDrive root skips with exit 3.
  assert.equal(archive(["file", runDir, "P02"], env).status, 1);
  const missing = archive(["file", runDir, "P01"], {
    PATINA_PRESS_ONEDRIVE: path.join(parent, "nope", "Press"),
  });
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /skipped/);
});
