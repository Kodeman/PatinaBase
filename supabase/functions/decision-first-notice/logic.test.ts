import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveSupersededEdition } from "./logic.ts";

const PREDECESSOR = {
  id: "decision-3",
  responded_at: "2026-09-02T15:00:00Z",
  approval_artifact: {
    source_version: 3,
    artifact_title: "Kitchen plan set",
    cost_cents_delta: 100_000,
    schedule_days_delta: 4,
    lead_time_days_delta: 20,
  },
  options: [
    { approval_outcome: "changes_requested", selected: false },
    { approval_outcome: "approved", selected: true },
  ],
};

const SUCCESSOR_ARTIFACT = {
  source_version: 4,
  cost_cents_delta: 224_000,
  schedule_days_delta: 4,
  lead_time_days_delta: 14,
};

Deno.test("no predecessor is no thread", () => {
  assertEquals(resolveSupersededEdition(null, SUCCESSOR_ARTIFACT), null);
  assertEquals(resolveSupersededEdition(undefined, SUCCESSOR_ARTIFACT), null);
});

Deno.test("a predecessor with no artifact names no edition", () => {
  assertEquals(
    resolveSupersededEdition(
      { id: "decision-3", approval_artifact: null },
      SUCCESSOR_ARTIFACT,
    ),
    null,
  );
});

Deno.test("the thread names her answer and the three differences", () => {
  const edition = resolveSupersededEdition(PREDECESSOR, SUCCESSOR_ARTIFACT);
  assertEquals(edition, {
    version: 3,
    title: "Kitchen plan set",
    answeredOn: "2026-09-02T15:00:00Z",
    answeredOutcome: "approved",
    costCentsDelta: 124_000,
    scheduleDaysDelta: 0,
    leadTimeDaysDelta: -6,
  });
});

Deno.test("an embedded to-one arriving as an array is still one artifact", () => {
  const edition = resolveSupersededEdition(
    { ...PREDECESSOR, approval_artifact: [PREDECESSOR.approval_artifact] },
    SUCCESSOR_ARTIFACT,
  );
  assertEquals(edition?.version, 3);
  assertEquals(edition?.costCentsDelta, 124_000);
});

Deno.test("an unanswered predecessor carries no answer and no date", () => {
  const edition = resolveSupersededEdition(
    { ...PREDECESSOR, responded_at: null },
    SUCCESSOR_ARTIFACT,
  );
  assertEquals(edition?.answeredOutcome, null);
  assertEquals(edition?.answeredOn, null);
  // The deltas survive: they come from the two frozen artifacts, not from her.
  assertEquals(edition?.costCentsDelta, 124_000);
});

Deno.test("a responded predecessor with no selected option states no answer", () => {
  const edition = resolveSupersededEdition(
    { ...PREDECESSOR, options: [{ approval_outcome: "approved", selected: false }] },
    SUCCESSOR_ARTIFACT,
  );
  assertEquals(edition?.answeredOutcome, null);
  assertEquals(edition?.answeredOn, null);
});

Deno.test("no successor artifact means no computable delta at all", () => {
  const edition = resolveSupersededEdition(PREDECESSOR, null);
  assert(edition !== null);
  assertEquals(edition?.version, 3);
  assertEquals("costCentsDelta" in (edition ?? {}), false);
  assertEquals("scheduleDaysDelta" in (edition ?? {}), false);
  assertEquals("leadTimeDaysDelta" in (edition ?? {}), false);
  // What she answered is evidence of its own and survives the missing artifact.
  assertEquals(edition?.answeredOutcome, "approved");
});

Deno.test("a half-populated pair yields only the deltas that subtract", () => {
  const edition = resolveSupersededEdition(
    {
      ...PREDECESSOR,
      approval_artifact: {
        source_version: 3,
        cost_cents_delta: 100_000,
        schedule_days_delta: null,
        lead_time_days_delta: 20,
      },
    },
    { cost_cents_delta: 100_000, schedule_days_delta: 9, lead_time_days_delta: null },
  );
  assertEquals(edition?.costCentsDelta, 0);
  assertEquals("scheduleDaysDelta" in (edition ?? {}), false);
  assertEquals("leadTimeDaysDelta" in (edition ?? {}), false);
});
