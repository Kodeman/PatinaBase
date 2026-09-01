// Deno test for the resend-webhook event→notification_log status mapping.
// Run: deno test supabase/functions/resend-webhook/status-map.test.ts
//
// Tests ./status-map.ts directly — importing ./index.ts would boot serve().

import {
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DELIVERY_UPGRADE_FROM_STATUSES,
  isHardBounce,
  RESEND_EVENT_STATUS,
} from "./status-map.ts";

Deno.test("email.delivered is the only writer of 'delivered'", () => {
  assertEquals(RESEND_EVENT_STATUS["email.delivered"], "delivered");
  const writers = Object.entries(RESEND_EVENT_STATUS)
    .filter(([, status]) => status === "delivered")
    .map(([type]) => type);
  assertEquals(writers, ["email.delivered"]);
});

Deno.test("bounce and complaint map to their own terminal statuses", () => {
  assertEquals(RESEND_EVENT_STATUS["email.bounced"], "bounced");
  // Previously mapped onto 'failed', which was indistinguishable from a
  // provider send error (00552 added the enum value).
  assertEquals(RESEND_EVENT_STATUS["email.complained"], "complained");
});

Deno.test("engagement events keep their own statuses", () => {
  assertEquals(RESEND_EVENT_STATUS["email.opened"], "opened");
  assertEquals(RESEND_EVENT_STATUS["email.clicked"], "clicked");
});

Deno.test("an unhandled event type maps to nothing", () => {
  assertEquals(RESEND_EVENT_STATUS["email.scheduled"], undefined);
});

Deno.test("'sent' is upgradeable to 'delivered'", () => {
  const upgradeable = new Set<string>(DELIVERY_UPGRADE_FROM_STATUSES);
  // sendCompliantEmail writes 'sent' on Resend's 2xx accept; the webhook must
  // be able to promote exactly that row.
  assertEquals(upgradeable.has("sent"), true);
  assertEquals(upgradeable.has("sending"), true);
  assertEquals(upgradeable.has("queued"), true);
  assertEquals(upgradeable.has("unconfirmed"), true);
});

Deno.test("'failed' is listed as upgradeable (future-proofing, not a live path)", () => {
  const upgradeable = new Set<string>(DELIVERY_UPGRADE_FROM_STATUSES);
  // send-email.ts writes 'failed' for an AMBIGUOUS send (timeout / transport
  // error / non-2xx / unreadable 2xx). Those branches carry no Resend message
  // id, so the row's provider_id is NULL and this webhook — which matches on
  // provider_id — can never reach it. The entry is harmless and becomes live
  // the moment an id is available there; see status-map.ts.
  assertEquals(upgradeable.has("failed"), true);
});

Deno.test("engagement states are never walked back to 'delivered'", () => {
  const upgradeable = new Set<string>(DELIVERY_UPGRADE_FROM_STATUSES);
  for (const terminal of ["opened", "clicked", "bounced", "complained"]) {
    assertFalse(upgradeable.has(terminal));
  }
});

Deno.test("hard and permanent bounces suppress on the first event", () => {
  assertEquals(isHardBounce("hard"), true);
  assertEquals(isHardBounce("permanent"), true);
});

Deno.test("soft and unknown bounce types stay on the rolling threshold", () => {
  assertFalse(isHardBounce("soft"));
  assertFalse(isHardBounce("transient"));
  assertFalse(isHardBounce(undefined));
});
