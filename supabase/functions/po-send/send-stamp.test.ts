// Deno test for po-send's refused sent_at stamp (SQ-448, review R2).
// Run: deno test supabase/functions/po-send/send-stamp.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  SENT_NOT_RECORDED_DETAIL,
  SENT_NOT_RECORDED_EMAILED_DETAIL,
  sentStampFailure,
} from "./release-gate.ts";

const guardRefusal = {
  code: "23514",
  message: "held_for_release: purchase order po-1 waits for an owner or admin to release it",
};

Deno.test("a guard-refused stamp after the email is a 409 that says the email went", () => {
  const failure = sentStampFailure(guardRefusal, true);
  assertEquals(failure.status, 409);
  assertEquals(failure.body, {
    error: "sent_not_recorded",
    detail: SENT_NOT_RECORDED_EMAILED_DETAIL,
    emailSent: true,
  });
  assert(failure.body.detail.includes("reached the vendor"));
});

Deno.test("the code never reads as held_for_release, so the portal does not say it did not go", () => {
  assert(!sentStampFailure(guardRefusal, true).body.error.includes("held_for_release"));
});

Deno.test("any other stamp failure is a 500, never ok", () => {
  const failure = sentStampFailure({ message: "connection reset" }, true);
  assertEquals(failure.status, 500);
  assertEquals(failure.body.error, "sent_not_recorded");
  assertEquals(failure.body.emailSent, true);
});

Deno.test("mark_sent (no email) reports the stamp failure without claiming an email", () => {
  const failure = sentStampFailure(guardRefusal, false);
  assertEquals(failure.status, 409);
  assertEquals(failure.body, {
    error: "sent_not_recorded",
    detail: SENT_NOT_RECORDED_DETAIL,
    emailSent: false,
  });
});
