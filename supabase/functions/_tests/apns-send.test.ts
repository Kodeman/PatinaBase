/// <reference lib="deno.ns" />
// ^ The monorepo root tsconfig.json sets lib: [ES2022, DOM] which Deno >= 2.4
// picks up, clobbering the `Deno` global during type-check — the reference
// restores it (same issue documented in catalog-normalizer.test.ts).
//
// Structural test for apns-send (Arrival Arc, I66): host selection per token
// environment, payload shape, token normalization, and dead-token
// classification. Pure helpers from apns-send/core.ts — no live stack, no
// network, no jose. Run:
//   deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/apns-send.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  apnsDeviceUrl,
  apnsHostFor,
  buildApnsPayload,
  isDeadTokenResponse,
  normalizePkcs8Pem,
  resolveTokens,
} from "../apns-send/core.ts";

Deno.test("apnsHostFor picks the host PER TOKEN environment (I66)", () => {
  assertEquals(apnsHostFor("production"), "https://api.push.apple.com");
  assertEquals(apnsHostFor("sandbox"), "https://api.sandbox.push.apple.com");
});

Deno.test("apnsDeviceUrl embeds the token on the environment's host", () => {
  assertEquals(
    apnsDeviceUrl({ token: "abc123", environment: "sandbox" }),
    "https://api.sandbox.push.apple.com/3/device/abc123",
  );
  assertEquals(
    apnsDeviceUrl({ token: "abc123", environment: "production" }),
    "https://api.push.apple.com/3/device/abc123",
  );
});

Deno.test("buildApnsPayload carries alert + routing refs", () => {
  const payload = buildApnsPayload({
    title: "Middle Studio introduced themselves",
    body: "Middle Studio introduced themselves — pick a time.",
    entity_type: "design_request",
    entity_id: "lead-1",
    notification_log_id: "log-1",
  });
  assertEquals(payload, {
    aps: {
      alert: {
        title: "Middle Studio introduced themselves",
        body: "Middle Studio introduced themselves — pick a time.",
      },
      sound: "default",
    },
    entity_type: "design_request",
    entity_id: "lead-1",
    notification_log_id: "log-1",
  });
});

Deno.test("buildApnsPayload nulls absent routing refs (never undefined keys)", () => {
  const payload = buildApnsPayload({ title: "t", body: "b" }) as Record<string, unknown>;
  assertEquals(payload.entity_type, null);
  assertEquals(payload.entity_id, null);
  assertEquals(payload.notification_log_id, null);
});

Deno.test("resolveTokens: explicit environment wins; bare strings resolve from DB rows", () => {
  const { resolved, unresolved } = resolveTokens(
    [
      { token: "t-explicit", environment: "production" },
      "t-db-sandbox",
      { token: "t-db-prod" }, // object without environment → DB lookup
      "t-unknown",
    ],
    [
      { token: "t-db-sandbox", environment: "sandbox" },
      { token: "t-db-prod", environment: "production" },
    ],
  );
  assertEquals(resolved, [
    { token: "t-explicit", environment: "production" },
    { token: "t-db-sandbox", environment: "sandbox" },
    { token: "t-db-prod", environment: "production" },
  ]);
  // No environment anywhere → dropped, never guessed (I66).
  assertEquals(unresolved, ["t-unknown"]);
});

Deno.test("resolveTokens ignores malformed DB environments", () => {
  const { resolved, unresolved } = resolveTokens(
    ["t-1"],
    [{ token: "t-1", environment: "staging" }],
  );
  assertEquals(resolved, []);
  assertEquals(unresolved, ["t-1"]);
});

Deno.test("isDeadTokenResponse: 410 and Apple's dead-token reasons delete the row", () => {
  assert(isDeadTokenResponse(410));
  assert(isDeadTokenResponse(400, "BadDeviceToken"));
  assert(isDeadTokenResponse(410, "Unregistered"));
  assert(!isDeadTokenResponse(403, "ExpiredProviderToken"));
  assert(!isDeadTokenResponse(429, "TooManyRequests"));
  assert(!isDeadTokenResponse(500));
});

// ── normalizePkcs8Pem ────────────────────────────────────────────────────
// jose's importPKCS8 REQUIRES the BEGIN/END PRIVATE KEY framing; a bare
// base64 body (what `supabase secrets set KEY=<paste>` yields if the PEM
// header/footer got stripped before paste) throws
// `"pkcs8" must be PKCS#8 formatted string` — confirmed locally against the
// exact jose@v5.2.0 version pinned in index.ts, with a throwaway
// (non-Patina) ES256 test key. These tests exercise the string-shaping
// logic only (no jose/network — same "pure helper" posture as the rest of
// this file); the actual jose round-trip was verified out-of-band.
const FAKE_BODY =
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgWIFGm3azGxwHtyU" +
  "xVtaM6MRGxieVHeCMRgwPkfENr2hRANCAAQVTY9RCTvPfFAMikwlrLeICOWNWA9x" +
  "rTC9Rn3lWwWoa2Zxm8XKfEuk8KHJ5vwLGrfWzalQotF2KvZ9SX6Jl9";
const FAKE_PEM = `-----BEGIN PRIVATE KEY-----\n${
  FAKE_BODY.match(/.{1,64}/g)!.join("\n")
}\n-----END PRIVATE KEY-----`;

Deno.test("normalizePkcs8Pem: bare base64 body gets BEGIN/END framing + 64-char wrap", () => {
  const result = normalizePkcs8Pem(FAKE_BODY);
  assert(result.startsWith("-----BEGIN PRIVATE KEY-----\n"));
  assert(result.endsWith("\n-----END PRIVATE KEY-----"));
  const inner = result
    .replace("-----BEGIN PRIVATE KEY-----\n", "")
    .replace("\n-----END PRIVATE KEY-----", "");
  const lines = inner.split("\n");
  for (const line of lines.slice(0, -1)) {
    assertEquals(line.length, 64);
  }
  assert(lines[lines.length - 1].length <= 64);
  // Re-joining the wrapped body recovers the exact original base64.
  assertEquals(lines.join(""), FAKE_BODY);
});

Deno.test("normalizePkcs8Pem: bare base64 with stray whitespace/newlines is still recognized (no BEGIN marker)", () => {
  const messy = `  ${FAKE_BODY.slice(0, 40)}\n${FAKE_BODY.slice(40)}  \n`;
  const result = normalizePkcs8Pem(messy);
  assert(result.startsWith("-----BEGIN PRIVATE KEY-----\n"));
  assert(result.endsWith("\n-----END PRIVATE KEY-----"));
  const inner = result
    .replace("-----BEGIN PRIVATE KEY-----\n", "")
    .replace("\n-----END PRIVATE KEY-----", "")
    .split("\n")
    .join("");
  assertEquals(inner, FAKE_BODY);
});

Deno.test("normalizePkcs8Pem: full PEM (already framed) passes through unchanged", () => {
  assertEquals(normalizePkcs8Pem(FAKE_PEM), FAKE_PEM);
});

Deno.test("normalizePkcs8Pem: full PEM with literal \\n escapes (single-line secret) gets real newlines", () => {
  const singleLineEscaped = FAKE_PEM.split("\n").join("\\n");
  assertEquals(normalizePkcs8Pem(singleLineEscaped), FAKE_PEM);
});
