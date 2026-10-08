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
const PNG = path.join(SAMPLE, "mj", "inbox", "J01", "sample.png");

function copyRun() {
  const runDir = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "press-mj-")),
    "2026-10-08-sample",
  );
  fs.cpSync(SAMPLE, runDir, { recursive: true });
  return runDir;
}

function tool(name, args, env = {}) {
  return spawnSync(process.execPath, [path.join(TOOLS, name), ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// A fake mflux-generate on PATH: records its argv and writes a PNG to --output.
function fakeMflux() {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "press-bin-"));
  const log = path.join(bin, "calls.jsonl");
  const script = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
fs.copyFileSync(${JSON.stringify(PNG)}, args[args.indexOf('--output') + 1]);
`;
  fs.writeFileSync(path.join(bin, "mflux-generate"), script, { mode: 0o755 });
  return {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    calls: () =>
      fs
        .readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l)),
  };
}

test("mj-pack writes one block per job, jobs.json and inbox dirs; video block names startFrom", () => {
  const runDir = copyRun();
  fs.rmSync(path.join(runDir, "mj"), { recursive: true });
  const r = tool("mj-pack.mjs", [runDir]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /SREF is still the placeholder/);

  const prompts = fs.readFileSync(
    path.join(runDir, "mj", "prompts.md"),
    "utf8",
  );
  assert.match(prompts, /midjourney\.com/);
  assert.equal(prompts.match(/^```text$/gm).length, 3);
  assert.ok(
    prompts.includes(
      "A Midwest design studio worktable with fabric swatches and warm afternoon light --ar 4:5 --style raw --v 8.1 --sref {{SREF}}",
    ),
  );

  const video = prompts.slice(prompts.indexOf("## 3. J03"));
  assert.match(video, /from J01, choose Animate/);
  assert.match(video, /```text\n--ar 9:16\n```/);
  assert.match(video, /mp4/);

  const jobs = JSON.parse(
    fs.readFileSync(path.join(runDir, "mj", "jobs.json"), "utf8"),
  );
  assert.deepEqual(
    jobs.map((j) => j.id),
    ["J01", "J02", "J03"],
  );
  assert.equal(jobs[2].startFrom, "J01");
  for (const id of ["J01", "J02", "J03"]) {
    assert.ok(
      fs.statSync(path.join(runDir, "mj", "inbox", id)).isDirectory(),
      id,
    );
  }
});

test("mj-pack exits 1 on an invalid plan and writes nothing", () => {
  const runDir = copyRun();
  fs.rmSync(path.join(runDir, "mj"), { recursive: true });
  const plan = JSON.parse(
    fs.readFileSync(path.join(runDir, "plan.json"), "utf8"),
  );
  plan.jobs[0].channel = "nope";
  plan.pieces[0].channel = "nope";
  fs.writeFileSync(path.join(runDir, "plan.json"), JSON.stringify(plan));
  const r = tool("mj-pack.mjs", [runDir]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /plan\.json is invalid/);
  assert.equal(fs.existsSync(path.join(runDir, "mj")), false);
});

test("ingest: J01 midjourney, empty still flux-placeholder via mflux, empty video missing", () => {
  const runDir = copyRun();
  const fake = fakeMflux();
  const r = tool("ingest.mjs", [runDir], fake.env);
  assert.equal(r.status, 0, r.stderr);
  const assets = JSON.parse(
    fs.readFileSync(path.join(runDir, "mj", "assets.json"), "utf8"),
  );
  assert.deepEqual(assets, {
    J01: {
      source: "midjourney",
      files: [path.join(runDir, "mj", "inbox", "J01", "sample.png")],
    },
    J02: {
      source: "flux-placeholder",
      files: [path.join(runDir, "flux", "J02", "J02.png")],
    },
    J03: { source: "missing", files: [] },
  });
  assert.ok(fs.statSync(assets.J02.files[0]).size > 0);

  const calls = fake.calls();
  assert.equal(calls.length, 1);
  const arg = (k) => calls[0][calls[0].indexOf(k) + 1];
  assert.equal(arg("--model"), "schnell");
  assert.equal(
    arg("--prompt"),
    "Close detail of a studio swatch wall, warm light",
  );
  // pinterest-2x3 is 1000x1500: under the 1536 long edge, rounded to multiples of 16.
  assert.equal(arg("--width"), "1008");
  assert.equal(arg("--height"), "1504");
});

test("ingest --no-flux records empty stills as missing", () => {
  const runDir = copyRun();
  const fake = fakeMflux();
  const r = tool("ingest.mjs", [runDir, "--no-flux"], fake.env);
  assert.equal(r.status, 0, r.stderr);
  const assets = JSON.parse(
    fs.readFileSync(path.join(runDir, "mj", "assets.json"), "utf8"),
  );
  assert.equal(assets.J01.source, "midjourney");
  assert.deepEqual(assets.J02, { source: "missing", files: [] });
  assert.deepEqual(assets.J03, { source: "missing", files: [] });
});

test("ingest records missing when mflux is not installed (flux exit 3)", () => {
  const runDir = copyRun();
  const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), "press-nobin-"));
  const r = tool("ingest.mjs", [runDir], { PATH: emptyBin });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /mflux-generate is not installed/);
  const assets = JSON.parse(
    fs.readFileSync(path.join(runDir, "mj", "assets.json"), "utf8"),
  );
  assert.deepEqual(assets.J02, { source: "missing", files: [] });
});

test("flux.mjs exits 3 without mflux and rounds sizes to multiples of 16", () => {
  const out = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "press-flux-")),
    "x.png",
  );
  const absent = tool(
    "flux.mjs",
    ["--prompt", "p", "--out", out, "--width", "600", "--height", "400"],
    {
      PATH: fs.mkdtempSync(path.join(os.tmpdir(), "press-nobin-")),
    },
  );
  assert.equal(absent.status, 3);
  assert.match(absent.stderr, /uv pip install mflux==0\.9\.6/);

  const fake = fakeMflux();
  const ok = tool(
    "flux.mjs",
    [
      "--prompt",
      "p",
      "--out",
      out,
      "--width",
      "1229",
      "--height",
      "641",
      "--steps",
      "2",
    ],
    fake.env,
  );
  assert.equal(ok.status, 0, ok.stderr);
  const [call] = fake.calls();
  assert.deepEqual(call, [
    "--model",
    "schnell",
    "--prompt",
    "p",
    "--steps",
    "2",
    "--width",
    "1232",
    "--height",
    "640",
    "--output",
    out,
  ]);
  assert.ok(fs.existsSync(out));
});
