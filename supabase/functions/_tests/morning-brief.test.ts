// Deno test for the morning-brief edge function's pure composition module
// (compose.ts) — no live DB, no server. Fixtures cover: empty queue,
// exceptions present, vitals absent/present, and a DST-boundary sanity check
// for chicagoDateOf/chicagoDayBoundsUtc.
//
// Run: deno test --no-check -A --config supabase/functions/deno.json supabase/functions/_tests/morning-brief.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  chicagoDateOf,
  chicagoDayBoundsUtc,
  composeBriefContent,
  computeVitalsDeltas,
  previousChicagoDate,
  type AgentTaskRow,
  type ComposeBriefInputs,
  type JobRunRow,
  type QueueStatRow,
} from "../morning-brief/compose.ts";

function baseTask(overrides: Partial<AgentTaskRow>): AgentTaskRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    task_type: "vendor_qualification",
    status: "awaiting_review",
    priority: 3,
    assignee: null,
    summary: "A task",
    flagged_stale_at: null,
    last_error: null,
    created_at: "2026-07-12T09:00:00.000Z",
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function baseInputs(overrides: Partial<ComposeBriefInputs> = {}): ComposeBriefInputs {
  return {
    briefDate: "2026-07-12",
    now: new Date("2026-07-12T16:00:00.000Z"),
    queue: [],
    jobRuns: [],
    jobTasks: [],
    staleTasks: [],
    failedTasks: [],
    intakeErrorTasks: [],
    todaysThreeTasks: [],
    vitalsCurrent: null,
    vitalsPrevious: null,
    ...overrides,
  };
}

// ─── chicagoDateOf ───────────────────────────────────────────────────────────

Deno.test("chicagoDateOf: CDT (summer) instant maps to the correct local date", () => {
  // 2026-07-12T04:30:00Z is 2026-07-11T23:30 CDT (UTC-5) — still July 11 locally.
  assertEquals(chicagoDateOf(new Date("2026-07-12T04:30:00.000Z")), "2026-07-11");
  // 2026-07-12T05:30:00Z is 2026-07-12T00:30 CDT — now July 12 locally.
  assertEquals(chicagoDateOf(new Date("2026-07-12T05:30:00.000Z")), "2026-07-12");
});

Deno.test("chicagoDateOf: CST (winter) instant maps to the correct local date", () => {
  // 2026-01-15T05:30:00Z is 2026-01-14T23:30 CST (UTC-6) — still Jan 14 locally.
  assertEquals(chicagoDateOf(new Date("2026-01-15T05:30:00.000Z")), "2026-01-14");
  // 2026-01-15T06:30:00Z is 2026-01-15T00:30 CST — now Jan 15 locally.
  assertEquals(chicagoDateOf(new Date("2026-01-15T06:30:00.000Z")), "2026-01-15");
});

Deno.test("chicagoDateOf: spring-forward DST boundary day (2026-03-08)", () => {
  // US DST 2026 spring-forward is 2026-03-08 02:00 local -> 03:00 local.
  // 07:59 UTC = 01:59 CST (still pre-transition) -> still March 8 locally either way.
  assertEquals(chicagoDateOf(new Date("2026-03-08T07:59:00.000Z")), "2026-03-08");
  // 09:00 UTC = 04:00 CDT (post-transition) -> still March 8 locally.
  assertEquals(chicagoDateOf(new Date("2026-03-08T09:00:00.000Z")), "2026-03-08");
  // Just before local midnight the previous UTC day should still read March 7.
  assertEquals(chicagoDateOf(new Date("2026-03-08T05:00:00.000Z")), "2026-03-07");
});

Deno.test("chicagoDateOf: fall-back DST boundary day (2026-11-01)", () => {
  // US DST 2026 fall-back is 2026-11-01 02:00 CDT -> 01:00 CST (07:00 UTC).
  // Before it (still CDT, UTC-5): 04:30 UTC = 2026-10-31T23:30 CDT.
  assertEquals(chicagoDateOf(new Date("2026-11-01T04:30:00.000Z")), "2026-10-31");
  // Still pre-transition CDT: 05:30 UTC = 2026-11-01T00:30 CDT.
  assertEquals(chicagoDateOf(new Date("2026-11-01T05:30:00.000Z")), "2026-11-01");
  assertEquals(chicagoDateOf(new Date("2026-11-01T12:00:00.000Z")), "2026-11-01");
});

// ─── chicagoDayBoundsUtc / previousChicagoDate ──────────────────────────────

Deno.test("chicagoDayBoundsUtc: spans exactly 24h and both ends land on the right calendar date", () => {
  const { startUtc, endUtc } = chicagoDayBoundsUtc("2026-07-11");
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  assertEquals(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
  assertEquals(chicagoDateOf(start), "2026-07-11");
  assertEquals(chicagoDateOf(new Date(end.getTime() - 1)), "2026-07-11");
  assertEquals(chicagoDateOf(end), "2026-07-12");
});

Deno.test("chicagoDayBoundsUtc: spring-forward day is a real 23h span, correctly bounded", () => {
  const { startUtc, endUtc } = chicagoDayBoundsUtc("2026-03-08");
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  // The 2026-03-08 local day is 23h long (clocks skip 02:00->03:00), not 24h.
  assertEquals(end.getTime() - start.getTime(), 23 * 60 * 60 * 1000);
  assertEquals(chicagoDateOf(start), "2026-03-08");
  assertEquals(chicagoDateOf(new Date(end.getTime() - 1)), "2026-03-08");
  assertEquals(chicagoDateOf(end), "2026-03-09");
});

Deno.test("chicagoDayBoundsUtc: fall-back day is a real 25h span, correctly bounded", () => {
  const { startUtc, endUtc } = chicagoDayBoundsUtc("2026-11-01");
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  // The 2026-11-01 local day is 25h long (01:00-02:00 CDT repeats as CST).
  assertEquals(end.getTime() - start.getTime(), 25 * 60 * 60 * 1000);
  assertEquals(chicagoDateOf(start), "2026-11-01");
  assertEquals(chicagoDateOf(new Date(end.getTime() - 1)), "2026-11-01");
  assertEquals(chicagoDateOf(end), "2026-11-02");
});

Deno.test("previousChicagoDate: simple day-before, unaffected by UTC-side month/year rollover", () => {
  assertEquals(previousChicagoDate("2026-07-12"), "2026-07-11");
  assertEquals(previousChicagoDate("2026-01-01"), "2025-12-31");
  assertEquals(previousChicagoDate("2026-03-01"), "2026-02-28");
});

// ─── computeVitalsDeltas ─────────────────────────────────────────────────────

Deno.test("computeVitalsDeltas: numeric-only diff, null when either side missing", () => {
  assertEquals(computeVitalsDeltas({ a: 5, b: "x" }, { a: 3, b: "y" }), { a: 2 });
  assertEquals(computeVitalsDeltas({ a: 5 }, null), null);
  assertEquals(computeVitalsDeltas(null, { a: 3 }), null);
  assertEquals(computeVitalsDeltas({ a: "x" }, { a: "y" }), null);
});

// ─── composeBriefContent ─────────────────────────────────────────────────────

Deno.test("composeBriefContent: empty queue and no rows composes an empty-but-valid brief", () => {
  const content = composeBriefContent(baseInputs());
  assertEquals(content.brief_date, "2026-07-12");
  assertEquals(content.queue, []);
  assertEquals(content.runs_yesterday, []);
  assertEquals(content.exceptions, { stale: [], failed: [], intake_errors: [] });
  assertEquals(content.todays_three, []);
  assertEquals(content.vitals, undefined);
});

Deno.test("composeBriefContent: queue counts pass through untouched", () => {
  const queue: QueueStatRow[] = [
    { status: "awaiting_review", task_count: 4, oldest_created_at: "2026-07-09T16:38:59.000Z" },
    { status: "queued", task_count: 1, oldest_created_at: "2026-07-12T16:08:59.000Z" },
  ];
  const content = composeBriefContent(baseInputs({ queue }));
  assertEquals(content.queue, queue);
});

Deno.test("composeBriefContent: runs_yesterday merges job_runs + job:% agent_tasks, sorted by start time, with duration/error/cost mapped", () => {
  const jobRuns: JobRunRow[] = [
    {
      job_name: "queue-groom",
      status: "succeeded",
      started_at: "2026-07-11T23:23:00.000Z",
      finished_at: "2026-07-11T23:23:05.000Z",
      error: null,
      cost_usd: null,
    },
  ];
  const jobTasks: AgentTaskRow[] = [
    baseTask({
      id: "job-task-1",
      task_type: "job:catalog_normalize",
      status: "failed",
      summary: "Catalog normalize — Meridian feed",
      last_error: "Upstream feed 502 after 5 attempts",
      started_at: "2026-07-11T08:38:59.000Z",
      completed_at: "2026-07-11T09:38:59.000Z",
    }),
  ];
  const content = composeBriefContent(baseInputs({ jobRuns, jobTasks }));
  assertEquals(content.runs_yesterday.length, 2);
  // Sorted by started_at ascending: the job:% task (08:38) before queue-groom (23:23).
  assertEquals(content.runs_yesterday[0].name, "job:catalog_normalize");
  assertEquals(content.runs_yesterday[0].source, "agent_task");
  assertEquals(content.runs_yesterday[0].status, "failed");
  assertEquals(content.runs_yesterday[0].duration_ms, 60 * 60 * 1000);
  assertEquals(content.runs_yesterday[0].error, "Upstream feed 502 after 5 attempts");
  assertEquals(content.runs_yesterday[1].name, "queue-groom");
  assertEquals(content.runs_yesterday[1].source, "job_runs");
  assertEquals(content.runs_yesterday[1].duration_ms, 5000);
});

Deno.test("composeBriefContent: exceptions present — stale (with age), failed (with last_error), intake_errors", () => {
  const now = new Date("2026-07-12T16:38:59.000Z");
  const staleTasks = [
    baseTask({
      id: "stale-1",
      summary: "Concierge order review — PO #10428 freight quote",
      flagged_stale_at: "2026-07-11T16:38:59.000Z", // 24h before `now`
    }),
  ];
  const failedTasks = [
    baseTask({
      id: "failed-1",
      status: "failed",
      task_type: "job:catalog_normalize",
      summary: "Catalog normalize — Meridian feed",
      last_error: "Upstream feed 502 after 5 attempts",
    }),
  ];
  const intakeErrorTasks = [
    baseTask({
      id: "intake-1",
      task_type: "intake_error",
      summary: "Intake error — malformed header in Ops Inbox/vendor/",
      last_error: "Header parse failed",
    }),
  ];
  const content = composeBriefContent(
    baseInputs({ now, staleTasks, failedTasks, intakeErrorTasks }),
  );
  assertEquals(content.exceptions.stale.length, 1);
  assertEquals(content.exceptions.stale[0].id, "stale-1");
  assertEquals(content.exceptions.stale[0].age_hours, 24);
  assertEquals(content.exceptions.failed.length, 1);
  assertEquals(content.exceptions.failed[0].last_error, "Upstream feed 502 after 5 attempts");
  assertEquals(content.exceptions.intake_errors.length, 1);
  assertEquals(content.exceptions.intake_errors[0].id, "intake-1");
});

Deno.test("composeBriefContent: todays_three maps id/summary/priority/assignee in caller-supplied order", () => {
  const todaysThreeTasks = [
    baseTask({ id: "t1", priority: 1, assignee: "kody", summary: "Intake error" }),
    baseTask({ id: "t2", priority: 2, assignee: "kody", summary: "Concierge order review" }),
    baseTask({ id: "t3", priority: 2, assignee: "leah", summary: "Brand review — Aldercrest" }),
  ];
  const content = composeBriefContent(baseInputs({ todaysThreeTasks }));
  assertEquals(content.todays_three.length, 3);
  assertEquals(content.todays_three.map((t) => t.id), ["t1", "t2", "t3"]);
  assertEquals(content.todays_three[2].assignee, "leah");
});

Deno.test("composeBriefContent: vitals section omitted when current is absent", () => {
  const content = composeBriefContent(baseInputs({ vitalsCurrent: null, vitalsPrevious: { liquidity_ratio: 1.2 } }));
  assertEquals(content.vitals, undefined);
  assert(!("vitals" in content) || content.vitals === undefined);
});

Deno.test("composeBriefContent: vitals section present with deltas when both current and previous exist", () => {
  const content = composeBriefContent(
    baseInputs({
      vitalsCurrent: { liquidity_ratio_pct: 150, gmv_per_designer_cents: 500_000 },
      vitalsPrevious: { liquidity_ratio_pct: 120, gmv_per_designer_cents: 480_000 },
    }),
  );
  assert(content.vitals);
  assertEquals(content.vitals?.current.liquidity_ratio_pct, 150);
  assertEquals(content.vitals?.previous?.liquidity_ratio_pct, 120);
  assertEquals(content.vitals?.deltas?.liquidity_ratio_pct, 30);
  assertEquals(content.vitals?.deltas?.gmv_per_designer_cents, 20_000);
});

Deno.test("composeBriefContent: vitals present but no previous row yields deltas: null", () => {
  const content = composeBriefContent(
    baseInputs({ vitalsCurrent: { liquidity_ratio: 1.5 }, vitalsPrevious: null }),
  );
  assert(content.vitals);
  assertEquals(content.vitals?.previous, null);
  assertEquals(content.vitals?.deltas, null);
});
