#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const gateFile = "supabase/functions/_tests/field-line-gates.test.ts";
const sqlOracles = [
  "supabase/tests/rls/sms_tables_test.sql",
  "supabase/tests/field/sms_authority_test.sql",
  "supabase/tests/field/apply_field_effect_test.sql",
  "supabase/tests/field/field_links_test.sql",
  "supabase/tests/field/sms_resend_test.sql",
  "supabase/tests/field/sms_prompt_consumption_test.sql",
  // The homeowner rail (00650-00652): the capability that is her identity, and
  // the door her reply goes through. Both are transaction-wrapped + ROLLBACK.
  "supabase/tests/field/client_phone_identity_test.sql",
  "supabase/tests/field/apply_client_effect_test.sql",
];

function usage(reason) {
  if (reason) console.error(`field-line verify: ${reason}`);
  console.error("usage: node scripts/field-line/verify.mjs --phase <0..3> --mode fixture [--wave <id>] [--strict]");
  process.exitCode = 2;
}

function parseArgs(args) {
  const result = { phase: undefined, mode: undefined, wave: undefined, strict: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--strict") result.strict = true;
    else if (arg === "--phase" || arg === "--mode" || arg === "--wave") {
      const value = args[++i];
      if (!value) return { error: `missing value for ${arg}` };
      result[arg.slice(2)] = value;
    } else return { error: `unknown argument ${arg}` };
  }
  const phase = Number(result.phase);
  if (!Number.isInteger(phase) || phase < 0 || phase > 3) return { error: "--phase must be an integer from 0 through 3" };
  if (result.mode !== "fixture") return { error: "--mode fixture is required" };
  return { ...result, phase };
}

function isLocalUrl(value) {
  if (!value) return true;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function print(status, label, reason) {
  console.log(`${status.toUpperCase()} | ${label} | ${reason}`);
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) {
  usage(parsed.error);
} else if (!isLocalUrl(process.env.SUPABASE_URL)) {
  console.error("field-line verify: refuses non-local SUPABASE_URL");
  process.exitCode = 2;
} else if (!isLocalUrl(process.env.LOCAL_DB_URL)) {
  console.error("field-line verify: refuses non-local LOCAL_DB_URL");
  process.exitCode = 2;
} else {
  const deno = spawnSync("deno", [
    // --no-lock: this repo checks in no Deno lock, and the run would otherwise
    // drop a deno.lock in the repo root every time the gate is asked.
    "test", "--no-check", "-A", "--no-lock", "--config", "supabase/functions/deno.json", gateFile,
  ], { cwd: root, encoding: "utf8", env: process.env });
  const output = `${deno.stdout ?? ""}\n${deno.stderr ?? ""}`;
  const assertions = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/FIELD_LINE_ASSERTION\s+(\{.*\})/);
    if (!match) continue;
    try { assertions.push(JSON.parse(match[1])); } catch { /* Deno will supply the failure signal below. */ }
  }
  let failed = deno.status !== 0 || Boolean(deno.error);
  if (assertions.length === 0) {
    print("fail", "fixture-gate", deno.error?.message ?? `Deno gate exited ${deno.status ?? "without a status"}`);
    failed = true;
  }
  for (const assertion of assertions) {
    print(assertion.status, `${assertion.caseId} ${assertion.clause}`, assertion.reason);
    if (assertion.status === "fail") failed = true;
    if (parsed.strict && assertion.status === "skip" && casePhase(assertion.caseId) <= parsed.phase) {
      failed = true;
    }
  }
  if (deno.status !== 0 && assertions.length > 0) {
    print("fail", "fixture-gate", `Deno gate exited ${deno.status}`);
  }

  for (const oracle of sqlOracles) {
    const absolute = path.join(root, oracle);
    if (!process.env.LOCAL_DB_URL) {
      print("skip", oracle, "LOCAL_DB_URL is unset");
      continue;
    }
    if (!existsSync(absolute)) {
      print("fail", oracle, "SQL oracle is not present");
      failed = true;
      continue;
    }
    const sql = spawnSync("psql", [process.env.LOCAL_DB_URL, "-v", "ON_ERROR_STOP=1", "-f", absolute], {
      cwd: root,
      encoding: "utf8",
    });
    if (sql.status === 0) print("pass", oracle, "psql completed");
    else {
      const reason = (sql.stderr || sql.error?.message || `psql exited ${sql.status}`).trim().split("\n").at(-1);
      print("fail", oracle, reason || "psql failed");
      failed = true;
    }
  }
  process.exitCode = failed ? 1 : 0;
}

function casePhase(caseId) {
  return new Map([
    ["two-studios-one-phone", 0], ["stop-then-new-engagement", 0], ["start-no-consent", 0],
    ["duplicate-twilio-sid", 0], ["rpc-failure-mid-effect", 0], ["provider-failure-with-code", 0],
    ["stale-forwarded-link", 0], ["dst-quiet-hours", 0], ["unknown-sender-wrong", 0],
    // Every id below carries the phase its own GateCase declares — Node cannot
    // import the TypeScript manifest, so this map mirrors it, and an id missing
    // here reads as Infinity, i.e. a skip strict mode would never notice. These
    // four were exactly that: two read 1 while declaring 0, and the 00643 pair
    // was absent altogether.
    ["old-ref-reply", 0], ["interrupted-media-upload", 0],
    ["condition-report", 0], ["po-delivery", 0],
    // The trade rail (00645).
    ["reply-to-renew", 1], ["budget-fold-to-digest", 1],
    ["dead-end-handoff", 1], ["site-card-day-of", 1],
    // The consent gate the resend dispatches through (00646).
    ["optin-resend-evidence", 1],
    // The homeowner's rail (00650-00652).
    ["client-phone-only-capability", 2], ["client-open-is-not-accept", 2],
    ["client-reply-authority", 2], ["client-payment-boundary", 2],
    ["client-version-race", 2], ["client-one-ask-a-day", 2],
    ["client-consent-boundary", 2], ["client-campaign-approval", 2],
    ["client-window-pick-issued", 2],
  ]).get(caseId) ?? Number.POSITIVE_INFINITY;
}
