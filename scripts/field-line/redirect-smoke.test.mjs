import test from "node:test";
import assert from "node:assert/strict";
import { validateRedirectSmoke } from "./redirect-smoke.mjs";

const target = "bkvcixdmuyejfzcijpdg";
const base = {
  FIELD_LINE_SMOKE_RECIPIENT: "+15550102030",
  SMS_DEV_MODE: "redirect",
  SUPABASE_URL: `https://${target}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
};

test("redirect smoke refuses a missing allowlisted recipient before any target check", () => {
  const result = validateRedirectSmoke({ ...base, FIELD_LINE_SMOKE_RECIPIENT: "" }, target);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no allowlisted recipient/);
});

test("redirect smoke refuses a target that is not in redirect mode", () => {
  const result = validateRedirectSmoke({ ...base, SMS_DEV_MODE: "off" }, target);
  assert.deepEqual(result, { ok: false, reason: "target SMS_DEV_MODE must be redirect" });
});

test("redirect smoke refuses a mismatched deployed project ref", () => {
  const result = validateRedirectSmoke({ ...base, SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co" }, target);
  assert.equal(result.ok, false);
  assert.match(result.reason, /does not match supabase\/\.temp\/project-ref/);
});
