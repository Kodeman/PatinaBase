import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = path.join(here, "..", "preflight.mjs");

function run(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PREFLIGHT, "--json"], {
      env: { ...process.env, PRESS_SKIP_BROWSER: "1", SOL_MODEL: "", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function stub(status) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      requests.push(JSON.parse(raw));
      res.writeHead(status, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          status === 200
            ? { content: [{ type: "text", text: "p" }] }
            : { error: "down" },
        ),
      );
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1/messages`,
    requests,
    close: () => new Promise((r) => server.close(r)),
  };
}

const check = (report, name) => report.checks.find((c) => c.name === name);

test("preflight --json passes with a live gateway stub and only warns on optional tools", async () => {
  const gw = await stub(200);
  // A PATH holding only a fake ffmpeg: mflux-generate is absent, which must stay a warning.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "press-pf-"));
  fs.writeFileSync(path.join(bin, "ffmpeg"), "#!/bin/sh\n", { mode: 0o755 });
  try {
    const r = await run({
      GATEWAY_URL: gw.url,
      PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}`,
    });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.ok, true);
    assert.equal(gw.requests.length, 1);
    assert.equal(gw.requests[0].max_tokens, 1);
    assert.equal(gw.requests[0].model, "claude-gpt-6-sol[1m]");

    assert.equal(check(report, "gateway").ok, true);
    assert.equal(check(report, "playwright-chromium").ok, null);
    assert.equal(check(report, "ffmpeg").ok, true);
    const mflux = check(report, "mflux-generate");
    assert.equal(mflux.ok, false);
    assert.equal(mflux.required, false);
    assert.match(
      mflux.fix,
      /uv venv ~\/\.venvs\/mflux && VIRTUAL_ENV=~\/\.venvs\/mflux uv pip install mflux==0\.9\.6/,
    );
    assert.equal(check(report, "disk").required, false);
    assert.equal(check(report, "hyperframes").required, false);
  } finally {
    await gw.close();
  }
});

test("preflight refuses a non-loopback GATEWAY_URL without sending to it", async () => {
  // TEST-NET-1 (documentation-only); the check must fail before any request is made.
  const r = await run({
    GATEWAY_URL: "http://192.0.2.1:18764/v1/messages",
    SOL_ALLOW_REMOTE: "",
  });
  assert.equal(r.code, 1);
  const report = JSON.parse(r.stdout);
  assert.equal(report.ok, false);
  const gateway = check(report, "gateway");
  assert.equal(gateway.ok, false);
  assert.equal(gateway.required, true);
  assert.match(gateway.detail, /not a loopback address/);
  assert.match(gateway.fix, /SOL_ALLOW_REMOTE=1/);
});

test("preflight exits 1 when the gateway fails and names the fix", async () => {
  const gw = await stub(502);
  try {
    const r = await run({ GATEWAY_URL: gw.url });
    assert.equal(r.code, 1);
    const report = JSON.parse(r.stdout);
    assert.equal(report.ok, false);
    const gateway = check(report, "gateway");
    assert.equal(gateway.ok, false);
    assert.equal(gateway.required, true);
    assert.equal(
      gateway.fix,
      "node ~/.claude/model-gateway/model-gateway.js ensure",
    );
    assert.match(gateway.detail, /502/);
  } finally {
    await gw.close();
  }
});
