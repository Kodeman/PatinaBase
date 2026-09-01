import {
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DIGEST_ELIGIBLE_NOTIFICATION_STATUSES } from "./status.ts";

Deno.test("digest eligibility includes uncertain attempts but excludes non-deliveries", () => {
  assertEquals(
    DIGEST_ELIGIBLE_NOTIFICATION_STATUSES.includes("unconfirmed"),
    true,
  );
  // Provider-accepted-but-unconfirmed sends are real attempts (00552).
  assertEquals(
    DIGEST_ELIGIBLE_NOTIFICATION_STATUSES.includes("sent"),
    true,
  );

  const eligible = new Set<string>(DIGEST_ELIGIBLE_NOTIFICATION_STATUSES);
  for (const excluded of ["suppressed", "bounced", "failed"]) {
    assertFalse(eligible.has(excluded));
  }
});
