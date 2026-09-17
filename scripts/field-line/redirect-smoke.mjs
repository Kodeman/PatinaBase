#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function targetProjectRef(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function validateRedirectSmoke(env, expectedProjectRef) {
  const recipient = env.FIELD_LINE_SMOKE_RECIPIENT?.trim();
  if (!recipient) return { ok: false, reason: "no allowlisted recipient (set FIELD_LINE_SMOKE_RECIPIENT)" };
  if (!/^\+[1-9]\d{7,14}$/.test(recipient)) return { ok: false, reason: "allowlisted recipient must be an E.164 phone number" };
  if (env.SMS_DEV_MODE !== "redirect") return { ok: false, reason: "target SMS_DEV_MODE must be redirect" };
  const actualProjectRef = targetProjectRef(env.SUPABASE_URL ?? "");
  if (!actualProjectRef) return { ok: false, reason: "SUPABASE_URL must name a deployed <project-ref>.supabase.co target" };
  if (!expectedProjectRef) return { ok: false, reason: "supabase/.temp/project-ref is missing" };
  if (actualProjectRef !== expectedProjectRef.trim()) {
    return { ok: false, reason: `target project ref ${actualProjectRef} does not match supabase/.temp/project-ref` };
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY is required for deployed sms-dispatch" };
  return { ok: true, recipient, target: env.SUPABASE_URL.replace(/\/$/, "") };
}

function parsePhase(args) {
  if (args.length !== 2 || args[0] !== "--phase" || !/^[0-3]$/.test(args[1])) {
    throw new Error("usage: node scripts/field-line/redirect-smoke.mjs --phase <0..3>");
  }
  return Number(args[1]);
}

function loadTwins(env, phase) {
  const raw = env.FIELD_LINE_SMOKE_TWINS;
  if (!raw) throw new Error(`no outbound twins configured for phase ${phase} (set FIELD_LINE_SMOKE_TWINS)`);
  let twins;
  try { twins = JSON.parse(raw); } catch { throw new Error("FIELD_LINE_SMOKE_TWINS must be JSON"); }
  if (!Array.isArray(twins) || twins.length !== 2) throw new Error("FIELD_LINE_SMOKE_TWINS must contain exactly two outbound jobs");
  for (const twin of twins) {
    if (!twin || typeof twin.partyId !== "string" || typeof twin.projectId !== "string" || typeof twin.templateKey !== "string") {
      throw new Error("each outbound twin needs partyId, projectId, and templateKey");
    }
  }
  return twins;
}

export async function runRedirectSmoke(env, readProjectRef, fetchImpl = fetch) {
  // Refuse recipient/mode/target problems before reading any deployment state.
  // That makes the command safe to invoke from a clean worktree and ensures a
  // missing allowlist cannot be masked by a missing local project-ref file.
  const preliminary = validateRedirectSmoke(env, targetProjectRef(env.SUPABASE_URL ?? "") ?? "");
  if (!preliminary.ok) throw new Error(preliminary.reason);
  let expectedRef;
  try { expectedRef = readProjectRef(); } catch { throw new Error("supabase/.temp/project-ref is missing"); }
  const check = validateRedirectSmoke(env, expectedRef);
  if (!check.ok) throw new Error(check.reason);
  const phase = Number(env.FIELD_LINE_SMOKE_PHASE);
  const twins = loadTwins(env, phase);
  const endpoint = `${check.target}/functions/v1/sms-dispatch`;
  const responses = [];
  for (const twin of twins) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ ...twin, type: `field-line-smoke-phase-${phase}` }),
    });
    if (!response.ok) throw new Error(`sms-dispatch twin ${twin.templateKey} returned ${response.status}`);
    responses.push({ templateKey: twin.templateKey, status: response.status });
  }
  return { recipient: check.recipient, responses };
}

async function main() {
  let phase;
  try { phase = parsePhase(process.argv.slice(2)); } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  const expectedPath = path.join(root, "supabase/.temp/project-ref");
  try {
    const result = await runRedirectSmoke(
      { ...process.env, FIELD_LINE_SMOKE_PHASE: String(phase) },
      () => readFileSync(expectedPath, "utf8").trim(),
    );
    console.log(`PASS | redirect-smoke phase ${phase} | ${result.responses.length} redirected outbound twins accepted for ${result.recipient}`);
  } catch (error) {
    console.error(`REFUSED | redirect-smoke phase ${phase} | ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
