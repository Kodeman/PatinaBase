#!/usr/bin/env node
// Single-shot a seat through the local model gateway (GPT-6 Sol). Generalized from
// artifacts/pieces-building-room-2026-10-08/tools/sol-single-shot.mjs: Workflow agent() cannot take
// gateway model ids, so the Press reaches Sol only through this script, run from Bash.
// Usage: node marketing/tools/sol.mjs <prompt.md> <out.md> [inputs...]
//          [--run <runDir> --piece <P> --seat <name>] [--max-tokens N]
// Env: SOL_MODEL (default claude-gpt-6-sol[1m]), GATEWAY_URL (default http://127.0.0.1:18764/v1/messages;
//      a non-loopback host is refused unless SOL_ALLOW_REMOTE=1), SOL_TIMEOUT_MS (default 600000)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { appendLedger } from "./lib/run.mjs";

const MODEL = process.env.SOL_MODEL || "claude-gpt-6-sol[1m]";
const GATEWAY = process.env.GATEWAY_URL ?? "http://127.0.0.1:18764/v1/messages";
const TIMEOUT_MS = Number(process.env.SOL_TIMEOUT_MS) || 600_000;

// Drafts, canon and images must not leave this machine by accident.
function isLoopback(url) {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    run: { type: "string" },
    piece: { type: "string" },
    seat: { type: "string" },
    "max-tokens": { type: "string" },
  },
});
const [promptPath, outPath, ...inputs] = positionals;
const maxTokens = values["max-tokens"] ? Number(values["max-tokens"]) : 32000;
if (!promptPath || !outPath || !Number.isInteger(maxTokens) || maxTokens < 1) {
  console.error(
    "usage: sol.mjs <prompt.md> <out.md> [inputs...] [--run <runDir> --piece <P> --seat <name>] [--max-tokens N]",
  );
  process.exit(2);
}
if (!isLoopback(GATEWAY) && process.env.SOL_ALLOW_REMOTE !== "1") {
  console.error(
    `sol.mjs: refusing GATEWAY_URL ${GATEWAY}: not a loopback address (127.0.0.1, localhost, ::1). Set SOL_ALLOW_REMOTE=1 to send drafts to a remote gateway on purpose.`,
  );
  process.exit(1);
}

const ledgerBase = { seat: values.seat, piece: values.piece, step: values.seat };
function fail(message) {
  console.error(message);
  if (values.run)
    appendLedger(values.run, { ...ledgerBase, model: MODEL, status: "failed", reason: message });
  process.exit(1);
}

const content = [];
let images = 0;
for (const p of inputs) {
  const ext = extname(p).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") {
    content.push({ type: "text", text: `Image: ${basename(p)}` });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: ext === ".png" ? "image/png" : "image/jpeg",
        data: readFileSync(p).toString("base64"),
      },
    });
    images++;
  } else {
    content.push({
      type: "text",
      text: `<file path="${p}">\n${readFileSync(p, "utf8")}\n</file>`,
    });
  }
}
content.push({ type: "text", text: readFileSync(promptPath, "utf8") });

let body;
try {
  // One signal covers the request and reading the response body.
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      // Without this, the model treats "write the file" in shared briefs as a tool task it can't do.
      system:
        "You have no tools and cannot write files. Your reply IS the complete deliverable document: output the full Markdown, starting with its title, and nothing else. Do not describe what you would do or ask for confirmation.",
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) fail(`gateway ${res.status}: ${await res.text()}`);
  body = await res.json();
} catch (err) {
  if (err.name === "TimeoutError")
    fail(
      `gateway timed out after ${TIMEOUT_MS / 1000} s with no complete reply (${GATEWAY}); raise SOL_TIMEOUT_MS or check the gateway`,
    );
  fail(`gateway request failed (${GATEWAY}): ${err.cause?.code || err.message}`);
}
const text = body.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("\n");
const header = `<!-- provenance: single-shot via local model gateway; response model=${body.model}; stop_reason=${body.stop_reason}; usage=${JSON.stringify(body.usage)}; images=${images}; generated ${new Date().toISOString()} -->\n\n`;
mkdirSync(dirname(resolve(outPath)), { recursive: true });
writeFileSync(outPath, header + text + "\n");
if (values.run) {
  appendLedger(values.run, {
    ...ledgerBase,
    status: "ok",
    model: body.model,
    usage: body.usage,
    stop_reason: body.stop_reason,
    out: resolve(outPath),
  });
}
console.log(
  `wrote ${outPath} (${text.length} chars, stop=${body.stop_reason}, images=${images})`,
);
