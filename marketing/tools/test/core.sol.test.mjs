import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOL = path.join(here, "..", "sol.mjs");
const PNG = path.join(
  here,
  "fixtures",
  "run-sample",
  "mj",
  "inbox",
  "J01",
  "sample.png",
);
const SYSTEM =
  "You have no tools and cannot write files. Your reply IS the complete deliverable document: output the full Markdown, starting with its title, and nothing else. Do not describe what you would do or ask for confirmation.";

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SOL, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function stub(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        body: JSON.parse(raw),
      });
      handler(req, res);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/v1/messages`;
  return {
    url,
    requests,
    close: () => new Promise((r) => server.close(r)),
    closeAll: () => server.closeAllConnections(),
  };
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "press-sol-"));
}

test("sol.mjs sends model, system and image block, writes provenance, and appends a ledger entry", async () => {
  const gw = await stub((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        model: "claude-gpt-6-sol[1m]",
        content: [{ type: "text", text: "# Rival draft\nCopy." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 12, output_tokens: 4 },
      }),
    );
  });
  const dir = tmp();
  const runDir = path.join(dir, "run");
  fs.mkdirSync(runDir);
  const prompt = path.join(dir, "prompt.md");
  fs.writeFileSync(prompt, "Write the rival draft.");
  const brief = path.join(dir, "brief.md");
  fs.writeFileSync(brief, "The brief.");
  const out = path.join(runDir, "copy", "P01.sol.md");
  try {
    const r = await run(
      [
        prompt,
        out,
        brief,
        PNG,
        "--run",
        runDir,
        "--piece",
        "P01",
        "--seat",
        "rival-copy",
        "--max-tokens",
        "2000",
      ],
      { GATEWAY_URL: gw.url, SOL_MODEL: "" },
    );
    assert.equal(r.code, 0, r.stderr);
    assert.equal(gw.requests.length, 1);
    const body = gw.requests[0].body;
    assert.equal(gw.requests[0].method, "POST");
    assert.equal(body.model, "claude-gpt-6-sol[1m]");
    assert.equal(body.max_tokens, 2000);
    assert.equal(body.system, SYSTEM);
    const content = body.messages[0].content;
    assert.match(
      content[0].text,
      /^<file path=".*brief\.md">\nThe brief\.\n<\/file>$/,
    );
    assert.deepEqual(content[1], { type: "text", text: "Image: sample.png" });
    assert.deepEqual(content[2], {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: fs.readFileSync(PNG).toString("base64"),
      },
    });
    assert.equal(content.at(-1).text, "Write the rival draft.");

    const written = fs.readFileSync(out, "utf8");
    assert.match(
      written,
      /^<!-- provenance: single-shot via local model gateway; response model=claude-gpt-6-sol\[1m\]; stop_reason=end_turn; usage=\{"input_tokens":12,"output_tokens":4\}; images=1; generated .* -->\n\n# Rival draft\nCopy\.\n$/,
    );

    const ledger = JSON.parse(
      fs.readFileSync(path.join(runDir, "ledger.json"), "utf8"),
    );
    assert.equal(ledger.length, 1);
    const { ts, ...entry } = ledger[0];
    assert.ok(ts);
    assert.deepEqual(entry, {
      seat: "rival-copy",
      piece: "P01",
      step: "rival-copy",
      status: "ok",
      model: "claude-gpt-6-sol[1m]",
      usage: { input_tokens: 12, output_tokens: 4 },
      stop_reason: "end_turn",
      out,
    });
  } finally {
    await gw.close();
  }
});

test("sol.mjs honors SOL_MODEL and writes no ledger without --run", async () => {
  const gw = await stub((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        model: "x",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: {},
      }),
    );
  });
  const dir = tmp();
  const prompt = path.join(dir, "prompt.md");
  fs.writeFileSync(prompt, "p");
  try {
    const r = await run([prompt, path.join(dir, "out.md")], {
      GATEWAY_URL: gw.url,
      SOL_MODEL: "claude-test-model",
    });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(gw.requests[0].body.model, "claude-test-model");
    assert.equal(gw.requests[0].body.max_tokens, 32000);
    assert.equal(fs.existsSync(path.join(dir, "ledger.json")), false);
  } finally {
    await gw.close();
  }
});

test("sol.mjs exits 1 on a non-2xx, echoes the body, and records a failed ledger entry", async () => {
  const gw = await stub((req, res) => {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("upstream asleep");
  });
  const dir = tmp();
  const prompt = path.join(dir, "prompt.md");
  fs.writeFileSync(prompt, "p");
  try {
    const r = await run(
      [prompt, path.join(dir, "out.md"), "--run", dir, "--seat", "sol-cold-read"],
      { GATEWAY_URL: gw.url },
    );
    assert.equal(r.code, 1);
    assert.match(r.stderr, /gateway 503: upstream asleep/);
    assert.equal(fs.existsSync(path.join(dir, "out.md")), false);
    const ledger = JSON.parse(
      fs.readFileSync(path.join(dir, "ledger.json"), "utf8"),
    );
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].step, "sol-cold-read");
    assert.equal(ledger[0].status, "failed");
    assert.match(ledger[0].reason, /gateway 503: upstream asleep/);
  } finally {
    await gw.close();
  }
});

test("sol.mjs gives up on a gateway that never answers (SOL_TIMEOUT_MS) and records it", async () => {
  const gw = await stub(() => {}); // reads the request, never responds
  const dir = tmp();
  const prompt = path.join(dir, "prompt.md");
  fs.writeFileSync(prompt, "p");
  try {
    const started = Date.now();
    const r = await run(
      [prompt, path.join(dir, "out.md"), "--run", dir, "--seat", "sol-draft", "--piece", "P01"],
      { GATEWAY_URL: gw.url, SOL_TIMEOUT_MS: "300" },
    );
    assert.equal(r.code, 1);
    assert.ok(Date.now() - started < 20_000, "exited on the timeout, not a hang");
    assert.match(r.stderr, /gateway timed out after 0\.3 s/);
    assert.equal(gw.requests.length, 1);
    assert.equal(fs.existsSync(path.join(dir, "out.md")), false);
    const [entry] = JSON.parse(
      fs.readFileSync(path.join(dir, "ledger.json"), "utf8"),
    );
    assert.equal(entry.status, "failed");
    assert.equal(entry.step, "sol-draft");
    assert.equal(entry.piece, "P01");
    assert.match(entry.reason, /timed out/);
  } finally {
    gw.closeAll();
    await gw.close();
  }
});

test("sol.mjs refuses a non-loopback GATEWAY_URL unless SOL_ALLOW_REMOTE=1", async () => {
  const dir = tmp();
  const prompt = path.join(dir, "prompt.md");
  fs.writeFileSync(prompt, "p");
  // 192.0.2.1 is TEST-NET-1 (documentation-only); the refusal comes before any request is made.
  const r = await run([prompt, path.join(dir, "out.md"), "--run", dir], {
    GATEWAY_URL: "http://192.0.2.1:18764/v1/messages",
    SOL_ALLOW_REMOTE: "",
  });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing GATEWAY_URL http:\/\/192\.0\.2\.1:18764.*not a loopback address/);
  assert.equal(fs.existsSync(path.join(dir, "out.md")), false);
  assert.equal(fs.existsSync(path.join(dir, "ledger.json")), false);
});

test("sol.mjs accepts every loopback spelling", async () => {
  const gw = await stub((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ model: "x", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: {} }));
  });
  const dir = tmp();
  const prompt = path.join(dir, "prompt.md");
  fs.writeFileSync(prompt, "p");
  try {
    const port = new URL(gw.url).port;
    const r = await run([prompt, path.join(dir, "out.md")], {
      GATEWAY_URL: `http://localhost:${port}/v1/messages`,
      SOL_ALLOW_REMOTE: "",
    });
    assert.equal(r.code, 0, r.stderr);
  } finally {
    await gw.close();
  }
});
