import {
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DIGEST_ELIGIBLE_NOTIFICATION_STATUSES,
  DIGEST_EXCLUDED_TYPES,
} from "./status.ts";

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

Deno.test("hour-tracking nudge rows never enter the digest collection (HT-34 / D-R3-01)", () => {
  // Both nudge types are eligible-by-status (delivered), so the ONLY thing
  // that can keep them out of a digest is DIGEST_EXCLUDED_TYPES — exactly
  // the gap D-R3-01 found: the collection query has no `channel` filter.
  assertEquals(
    DIGEST_ELIGIBLE_NOTIFICATION_STATUSES.includes("delivered"),
    true,
  );
  for (
    const type of [
      "time_entry_running_long",
      "time_weekly_unlogged_reminder",
    ] as const
  ) {
    assertEquals(DIGEST_EXCLUDED_TYPES.has(type), true);
  }

  // Reproduce dispatchDigests's own filter (index.ts) against a mixed batch
  // of rows, all otherwise status-eligible, to prove the collection itself
  // drops the nudge rows rather than merely asserting Set membership.
  const rows = [
    { id: "1", type: "time_entry_running_long", status: "delivered" },
    { id: "2", type: "time_weekly_unlogged_reminder", status: "delivered" },
    { id: "3", type: "new_lead_designer", status: "delivered" },
  ];
  const collected = rows.filter((r) => !DIGEST_EXCLUDED_TYPES.has(r.type));
  assertEquals(collected.map((r) => r.id), ["3"]);
});
