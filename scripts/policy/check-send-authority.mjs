#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const allowlisted = [
  /^supabase\/functions\/_shared\/send-email\.ts$/,
  /^supabase\/functions\/_shared\/sms\.ts$/,
  /^supabase\/functions\/sms-dispatch\/handler\.ts$/,
  /^supabase\/functions\/apns-send\//,
  // Staff and Patina-to-designer campaigns are exempt from the studio send gate.
  /^supabase\/functions\/campaign-dispatch\//,
  /^services\/orders\//,
  // Admin application sends (apps/admin-portal/src/lib/application-emails.ts and
  // apps/admin-portal/src/app/api/campaigns/test-send/route.ts) still use
  // @patina/email/send; Weekly Pulse now goes through pulse-send.
  /^packages\/email\//,
];
const providerUse = /api\.resend\.com|resend\.emails\.send|Messages\.json|api\.push\.apple\.com/;
const files = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  maxBuffer: 32 * 1024 * 1024,
})
  .toString("utf8")
  .split("\0")
  .filter((file) => /\.(?:[cm]?js|[cm]?ts|tsx|jsx)$/.test(file))
  .filter((file) => !/(?:^|\/)(?:test|tests|__tests__|_tests)(?:\/|\.)/.test(file))
  .filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
  .filter((file) => file !== "scripts/policy/check-send-authority.mjs")
  .filter((file) => !allowlisted.some((pattern) => pattern.test(file)));

const violations = [];
for (const file of files) {
  const source = readFileSync(path.join(root, file), "utf8");
  if (providerUse.test(source)) violations.push(file);
}

if (violations.length) {
  console.error("Outbound provider usage outside approved chokepoints:");
  for (const file of violations) console.error(`  ${file}`);
  process.exitCode = 1;
} else {
  console.log("Outbound provider usage is confined to approved chokepoints.");
}
