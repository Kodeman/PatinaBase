// Deno tests for the automation-processor negate/skip mechanics added in
// migration 00562 (Task L9 — drip retiming E2-E9).
//
// Tests ./logic.ts directly — importing ./index.ts would boot Deno.serve
// (see supabase/functions/po-send/index.test.ts for the established
// pattern this mirrors).
//
// Run: deno test --config supabase/functions/deno.json supabase/functions/automation-processor/logic.test.ts

import {
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  advanceEnrollmentSkippingNext,
  evaluateCondition,
} from "./logic.ts";

// ─── evaluateCondition: event_occurred + negate ────────────────────────────
//
// A minimal mock of the chain `supabase.from("engagement_events").select("id")
// .eq("user_id", userId).eq("event_name", eventName).limit(1)` resolving to
// `{ data, error }`. Every builder method returns `this` except `limit`,
// which is the terminal call the code `await`s.

function mockSupabaseForEvents(events: Array<{ id: string }>) {
  const builder = {
    from(_table: string) {
      return builder;
    },
    select(_cols: string) {
      return builder;
    },
    eq(_col: string, _val: unknown) {
      return builder;
    },
    limit(_n: number) {
      return Promise.resolve({ data: events, error: null });
    },
  };
  // deno-lint-ignore no-explicit-any
  return builder as any;
}

Deno.test("evaluateCondition: event_occurred, no negate, event NOT occurred -> false", async () => {
  const supabase = mockSupabaseForEvents([]);
  const result = await evaluateCondition(supabase, "user-1", {
    type: "event_occurred",
    event: "first_capture",
  });
  assertEquals(result, false);
});

Deno.test("evaluateCondition: event_occurred, no negate, event occurred -> true", async () => {
  const supabase = mockSupabaseForEvents([{ id: "e1" }]);
  const result = await evaluateCondition(supabase, "user-1", {
    type: "event_occurred",
    event: "first_capture",
  });
  assertEquals(result, true);
});

Deno.test("evaluateCondition: event_occurred, negate:true, event NOT occurred -> true (send the email)", async () => {
  const supabase = mockSupabaseForEvents([]);
  const result = await evaluateCondition(supabase, "user-1", {
    type: "event_occurred",
    event: "first_capture",
    negate: true,
  });
  assertEquals(result, true);
});

Deno.test("evaluateCondition: event_occurred, negate:true, event occurred -> false (skip the email)", async () => {
  const supabase = mockSupabaseForEvents([{ id: "e1" }]);
  const result = await evaluateCondition(supabase, "user-1", {
    type: "event_occurred",
    event: "first_capture",
    negate: true,
  });
  assertEquals(result, false);
});

Deno.test("evaluateCondition: negate:false behaves identically to negate absent", async () => {
  const occurred = await evaluateCondition(mockSupabaseForEvents([{ id: "e1" }]), "u", {
    type: "event_occurred",
    event: "hours_logged",
    negate: false,
  });
  assertEquals(occurred, true);
});

// ─── advanceEnrollmentSkippingNext: the on_false:'skip' step-runner path ───
//
// Captures every `.update(...)` payload issued against `sequence_enrollments`
// / `automated_sequences` so the skip mechanics can be asserted without a
// real database: the condition step AND the following email step must each
// get a step_history entry, the email entry carries `{skipped:true, reason}`,
// and current_step must land two steps past the condition (past the email,
// onto the following wait step) rather than one.

interface Captured {
  table: string;
  payload: Record<string, unknown>;
}

function mockSupabaseCapturingUpdates(captured: Captured[]) {
  const builder = {
    _table: "",
    from(table: string) {
      builder._table = table;
      return builder;
    },
    update(payload: Record<string, unknown>) {
      captured.push({ table: builder._table, payload });
      return builder;
    },
    eq(_col: string, _val: unknown) {
      return builder;
    },
    select(_cols: string) {
      return builder;
    },
    single() {
      return Promise.resolve({ data: { total_completed: 0 }, error: null });
    },
    then(resolve: (v: { data: null; error: null }) => unknown) {
      // Makes `await supabase.from(...).update(...).eq(...)` resolve when
      // no `.single()` follows (the sequence_enrollments update path).
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  // deno-lint-ignore no-explicit-any
  return builder as any;
}

const steps = [
  { id: "donb_gate_onboarding-capture", type: "condition" as const, config: {} },
  { id: "donb_6", type: "email" as const, config: { template_id: "onboarding-capture", delay_days: 0 } },
  { id: "donb_7", type: "wait" as const, config: { delay_days: 7 } },
];

Deno.test("advanceEnrollmentSkippingNext: skips the paired email, advances two steps, logs skipped:true", async () => {
  const captured: Captured[] = [];
  const supabase = mockSupabaseCapturingUpdates(captured);

  const enrollment = {
    id: "enr-1",
    sequence_id: "seq-1",
    user_id: "user-1",
    current_step: 0,
    status: "active",
    step_history: [],
    next_step_at: new Date().toISOString(),
    enrolled_at: new Date().toISOString(),
  };

  await advanceEnrollmentSkippingNext(
    supabase,
    enrollment,
    steps,
    steps[0],
    0,
    "event_occurred:first_capture",
  );

  assertEquals(captured.length, 1);
  assertEquals(captured[0].table, "sequence_enrollments");

  const payload = captured[0].payload;
  // current_step must land past BOTH the condition (index 0) and the
  // skipped email (index 1) — i.e. index 2, the following wait step —
  // not index 1 (which would re-evaluate/resend the email next tick).
  assertEquals(payload.current_step, 2);

  const history = payload.step_history as Array<Record<string, unknown>>;
  assertEquals(history.length, 2);
  assertObjectMatch(history[0], { step: 0, type: "condition", result: "condition_false" });
  assertObjectMatch(history[1], {
    step: 1,
    type: "email",
    result: "skipped",
    skipped: true,
    reason: "event_occurred:first_capture",
  });
});

Deno.test("advanceEnrollmentSkippingNext: reaching the end of steps marks the enrollment completed", async () => {
  const captured: Captured[] = [];
  const supabase = mockSupabaseCapturingUpdates(captured);

  const shortSteps = [
    { id: "c", type: "condition" as const, config: {} },
    { id: "e", type: "email" as const, config: { template_id: "onboarding-aesthete" } },
  ];

  const enrollment = {
    id: "enr-2",
    sequence_id: "seq-1",
    user_id: "user-2",
    current_step: 0,
    status: "active",
    step_history: [],
    next_step_at: new Date().toISOString(),
    enrolled_at: new Date().toISOString(),
  };

  await advanceEnrollmentSkippingNext(
    supabase,
    enrollment,
    shortSteps,
    shortSteps[0],
    0,
    "event_occurred:payment_received",
  );

  const enrollmentUpdate = captured.find((c) => c.table === "sequence_enrollments");
  assertEquals(enrollmentUpdate?.payload.status, "completed");
  assertEquals(enrollmentUpdate?.payload.next_step_at, null);

  const sequenceUpdate = captured.find((c) => c.table === "automated_sequences");
  assertEquals(sequenceUpdate?.payload.total_completed, 1);
});
