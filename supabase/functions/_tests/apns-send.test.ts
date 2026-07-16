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
