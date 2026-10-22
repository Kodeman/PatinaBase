// deno test --no-check -A --config supabase/functions/deno.json supabase/functions/client-plate-copy/
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type Clock,
  copyRun,
  type CopySteps,
  fetchAddress,
  ingestTimeoutMs,
  parseJobRunId,
  type PlateRequest,
  recordPayload,
  resolveSource,
  RUN_BUDGET_EXCEEDED,
  RunDeadline,
  type RunSummary,
  shortenError,
  type SourceAuthority,
  SourceNotOwned,
  summarizeRun,
  validateIngestResponse,
} from "./lib.ts";

const PROJECT = "84300000-0000-4000-8000-000000000001";
const OTHER_PROJECT = "84300000-0000-4000-8000-000000000002";
const ROOM = "84300000-0000-4000-8000-000000000011";
const OWNER = "84300000-0000-4000-8000-0000000000a1";
const SCAN = "84300000-0000-4000-8000-000000000301";
const PROPOSAL = "84300000-0000-4000-8000-0000000000f1";
const SHA = "a".repeat(64);
const SUPABASE = "https://strata.example.supabase.co/";

// Each private bucket's object layout (its storage policy): room-renders
// <project>/<room>/<file>; room-scans <type>/<owner>/<scan>/<file>;
// proposal-mood-boards <proposal>/...
const RENDER_PATH = `${PROJECT}/${ROOM}/kitchen-v1.png`;
const SCAN_PATH = `photos/${OWNER}/${SCAN}/still-1.jpg`;
const BOARD_PATH = `${PROPOSAL}/boards/b1/cover.jpg`;

function request(table: string, sourceKind: string, sourceUrl: string): PlateRequest {
  return {
    id: "r1",
    project_id: PROJECT,
    source_kind: sourceKind,
    source_ref: { table, id: "s1" },
    source_url: sourceUrl,
    lease_token: "t1",
  };
}

function answer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sha256: SHA,
    width: 1600,
    height: 1200,
    format: "jpeg",
    ground: "white",
    dominantHex: "#efe9e0",
    lqip: "data:image/webp;base64,AAAA",
    originalKey: `plates/${PROJECT}/${SHA}/original.jpg`,
    crops: { wide: { rect: [0, 0, 1600, 900], widths: [800, 1600] } },
    ...overrides,
  };
}

function authority(owned: boolean | Error) {
  const calls = { owned: 0, signed: [] as string[] };
  const value: SourceAuthority = {
    owned() {
      calls.owned++;
      return owned instanceof Error ? Promise.reject(owned) : Promise.resolve(owned);
    },
    sign(bucket, path) {
      calls.signed.push(`${bucket}/${path}`);
      return Promise.resolve(`https://signed.test/${bucket}/${path}?token=t`);
    },
  };
  return { value, calls };
}

Deno.test("resolveSource: a library hotlink is fetched as it is", () => {
  assertEquals(
    resolveSource(request("project_ffe_item_images", "maker", "https://img.test/chair.jpg"), SUPABASE),
    { kind: "direct", url: "https://img.test/chair.jpg" },
  );
});

Deno.test("resolveSource: an upload gets the public project-item-images URL", () => {
  assertEquals(
    resolveSource(request("project_ffe_item_images", "upload", `${PROJECT}/my photo.jpg`), SUPABASE),
    {
      kind: "direct",
      url: `https://strata.example.supabase.co/storage/v1/object/public/project-item-images/${PROJECT}/my%20photo.jpg`,
    },
  );
});

Deno.test("resolveSource: concept renders, scans and board covers are signed in their private bucket", () => {
  assertEquals(resolveSource(request("project_rooms", "concept", RENDER_PATH), SUPABASE), {
    kind: "signed",
    bucket: "room-renders",
    path: RENDER_PATH,
  });
  assertEquals(resolveSource(request("room_scan_images", "scan", `/${SCAN_PATH}`), SUPABASE), {
    kind: "signed",
    bucket: "room-scans",
    path: SCAN_PATH,
  });
  assertEquals(resolveSource(request("project_boards", "board", BOARD_PATH), SUPABASE), {
    kind: "signed",
    bucket: "proposal-mood-boards",
    path: BOARD_PATH,
  });
});

Deno.test("resolveSource: a render outside the project's folder or a dot segment is not the project's", () => {
  for (const path of [
    `${OTHER_PROJECT}/${ROOM}/kitchen-v1.png`,
    `${PROJECT}/kitchen.png`,
    `${PROJECT}/${ROOM}/../../${OTHER_PROJECT}/${ROOM}/kitchen-v1.png`,
  ]) {
    assertEquals(resolveSource(request("project_rooms", "concept", path), SUPABASE), { kind: "not_owned" }, path);
  }
  for (const [table, path] of [
    ["room_scan_images", `photos/${OWNER}/${SCAN}/../../../photos/x/y/still-1.jpg`],
    ["room_scan_images", `photos/${OWNER}//still-1.jpg`],
    ["project_boards", `${PROPOSAL}/%2E%2E/other/cover.jpg`],
  ]) {
    assertEquals(resolveSource(request(table, "scan", path), SUPABASE), { kind: "not_owned" }, path);
  }
});

Deno.test("resolveSource: an outside board cover is fetched as it is", () => {
  assertEquals(resolveSource(request("project_boards", "board", "https://img.test/cover.jpg"), SUPABASE), {
    kind: "direct",
    url: "https://img.test/cover.jpg",
  });
});

Deno.test("resolveSource: an unknown table or a blank address has no source", () => {
  assertEquals(resolveSource(request("plan_prints", "sheet", "prints/a.pdf"), SUPABASE), null);
  assertEquals(resolveSource(request("project_rooms", "concept", "   "), SUPABASE), null);
});

const PRIVATE_SOURCES = [
  { table: "project_rooms", kind: "concept", bucket: "room-renders", path: RENDER_PATH },
  { table: "room_scan_images", kind: "scan", bucket: "room-scans", path: SCAN_PATH },
  { table: "project_boards", kind: "board", bucket: "proposal-mood-boards", path: BOARD_PATH },
];

for (const source of PRIVATE_SOURCES) {
  Deno.test(`fetchAddress: a ${source.bucket} object the project owns is signed`, async () => {
    const { value, calls } = authority(true);
    assertEquals(
      await fetchAddress(request(source.table, source.kind, source.path), SUPABASE, value),
      `https://signed.test/${source.bucket}/${source.path}?token=t`,
    );
    assertEquals(calls, { owned: 1, signed: [`${source.bucket}/${source.path}`] });
  });

  Deno.test(`fetchAddress: a ${source.bucket} object the database places elsewhere is never signed`, async () => {
    const { value, calls } = authority(false);
    await assertRejects(
      () => fetchAddress(request(source.table, source.kind, source.path), SUPABASE, value),
      SourceNotOwned,
      "source_not_owned",
    );
    assertEquals(calls, { owned: 1, signed: [] });
  });
}

Deno.test("fetchAddress: a render under another project is refused before the database is asked", async () => {
  const { value, calls } = authority(true);
  await assertRejects(
    () => fetchAddress(request("project_rooms", "concept", `${OTHER_PROJECT}/${ROOM}/kitchen-v1.png`), SUPABASE, value),
    SourceNotOwned,
  );
  assertEquals(calls, { owned: 0, signed: [] });
});

Deno.test("fetchAddress: a failed ownership check signs nothing", async () => {
  const { value, calls } = authority(new Error("ownership check failed: timeout"));
  await assertRejects(
    () => fetchAddress(request("room_scan_images", "scan", SCAN_PATH), SUPABASE, value),
    Error,
    "ownership check failed",
  );
  assertEquals(calls.signed, []);
});

Deno.test("fetchAddress: a hotlink or outside cover needs neither the check nor a signature", async () => {
  const { value, calls } = authority(false);
  assertEquals(
    await fetchAddress(request("project_ffe_item_images", "maker", "https://img.test/chair.jpg"), SUPABASE, value),
    "https://img.test/chair.jpg",
  );
  assertEquals(
    await fetchAddress(request("project_boards", "board", "https://img.test/cover.jpg"), SUPABASE, value),
    "https://img.test/cover.jpg",
  );
  assertEquals(calls, { owned: 0, signed: [] });
  await assertRejects(() => fetchAddress(request("plan_prints", "sheet", "a.pdf"), SUPABASE, value), Error, "no fetch address");
});

Deno.test("shortenError: a refused source is recorded as source_not_owned", () => {
  assertEquals(shortenError(new SourceNotOwned()), "source_not_owned");
});

Deno.test("validateIngestResponse: a full answer is accepted with its fields", () => {
  const checked = validateIngestResponse(answer(), PROJECT);
  assert(checked.ok);
  assertEquals(checked.asset.sha256, SHA);
  assertEquals(checked.asset.width, 1600);
  assertEquals(checked.asset.ground, "white");
  assertEquals(checked.asset.crops, { wide: { rect: [0, 0, 1600, 900], widths: [800, 1600] } });
});

Deno.test("validateIngestResponse: missing optional facts become null and crops {}", () => {
  const checked = validateIngestResponse(
    answer({ format: undefined, ground: undefined, dominantHex: undefined, lqip: undefined, crops: undefined }),
    PROJECT,
  );
  assert(checked.ok);
  assertEquals(
    [checked.asset.format, checked.asset.ground, checked.asset.dominantHex, checked.asset.lqip],
    [null, null, null, null],
  );
  assertEquals(checked.asset.crops, {});
});

Deno.test("validateIngestResponse: a malformed answer is refused with its reason", () => {
  const refused = (body: unknown) => {
    const checked = validateIngestResponse(body, PROJECT);
    return checked.ok ? null : checked.error;
  };
  assertEquals(refused(null), "ingest answer is not an object");
  assertEquals(refused([answer()]), "ingest answer is not an object");
  assertEquals(refused(answer({ sha256: "A".repeat(64) })), "ingest answer has no sha256");
  assertEquals(refused(answer({ width: 0 })), "ingest answer has no width and height");
  assertEquals(refused(answer({ height: 12.5 })), "ingest answer has no width and height");
  assertEquals(
    refused(answer({ originalKey: `plates/other-project/${SHA}/original.jpg` })),
    "ingest answer's original is outside plates/<project>/<sha256>/",
  );
  assertEquals(refused(answer({ ground: "sky" })), "ingest answer has an unknown ground");
  assertEquals(refused(answer({ lqip: "x".repeat(801) })), "ingest answer's lqip is over 800 characters");
  assertEquals(refused(answer({ dominantHex: 7 })), "ingest answer has a non-text format, dominantHex or lqip");
  assertEquals(refused(answer({ crops: [] })), "ingest answer's crops is not an object");
});

Deno.test("recordPayload: the answer carries the request's source", () => {
  const checked = validateIngestResponse(answer(), PROJECT);
  assert(checked.ok);
  const payload = recordPayload(checked.asset, request("project_rooms", "concept", "a.png"));
  assertEquals(payload.source_kind, "concept");
  assertEquals(payload.source_ref, { table: "project_rooms", id: "s1" });
  assertEquals(payload.originalKey, `plates/${PROJECT}/${SHA}/original.jpg`);
});

Deno.test("shortenError: one line, at most 200 characters", () => {
  assertEquals(shortenError(new Error("ingest 502:\n  bad   gateway")), "ingest 502: bad gateway");
  const long = shortenError("x".repeat(500));
  assertEquals(long.length, 200);
  assert(long.endsWith("…"));
  assertEquals(shortenError({ code: "E1" }), '{"code":"E1"}');
  assertEquals(shortenError(""), "copy failed");
  assertEquals(shortenError(undefined), "undefined");
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assertEquals(shortenError(circular), "[object Object]");
});

Deno.test("shortenError: a signed URL's token never reaches the queue", () => {
  assertEquals(
    shortenError("fetch failed https://x.supabase.co/storage/v1/object/sign/room-renders/a.png?token=SECRET123 (403)"),
    "fetch failed https://x.supabase.co/storage/v1/object/sign/room-renders/a.png (403)",
  );
});

Deno.test("parseJobRunId: a positive integer or digit string, else null", () => {
  assertEquals(parseJobRunId({ job_run_id: 42 }), 42);
  assertEquals(parseJobRunId({ job_run_id: "42" }), 42);
  assertEquals(parseJobRunId({ job_run_id: 0 }), null);
  assertEquals(parseJobRunId({ job_run_id: "4x" }), null);
  assertEquals(parseJobRunId({}), null);
  assertEquals(parseJobRunId(null), null);
});

Deno.test("summarizeRun: skipped with nothing claimed, failed when every copy failed, else succeeded", () => {
  assertEquals(summarizeRun({ claimed: 0, recorded: 0, failed: 0 }).status, "skipped");
  assertEquals(summarizeRun({ claimed: 2, recorded: 0, failed: 2 }), {
    status: "failed",
    detail: { claimed: 2, recorded: 0, failed: 2 },
    error: "all 2 copies failed",
  });
  assertEquals(summarizeRun({ claimed: 3, recorded: 2, failed: 1 }).status, "succeeded");
});

// ---- one run against its deadline (SQ-1634), on a fake clock ---------------

// Lets every settled promise run its callbacks before the clock moves on.
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

class FakeClock implements Clock {
  #now = 0;
  #next = 1;
  #timers = new Map<number, { at: number; fn: () => void }>();

  now() {
    return this.#now;
  }

  setTimeout(fn: () => void, ms: number) {
    const id = this.#next++;
    this.#timers.set(id, { at: this.#now + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(id: unknown) {
    this.#timers.delete(id as number);
  }

  /** Moves time to `to`, firing each timer due on the way at its own time. */
  async runUntil(to: number) {
    for (;;) {
      await flush();
      let due: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.#timers) if (entry[1].at <= to && (!due || entry[1].at < due[1].at)) due = entry;
      if (!due) break;
      this.#timers.delete(due[0]);
      this.#now = due[1].at;
      due[1].fn();
    }
    this.#now = to;
    await flush();
  }
}

// A hotlink row (no ownership read or signing) and a private render row (both).
const hotlinkRow = (id: string): PlateRequest => ({
  ...request("", "maker", `https://cdn.test/${id}.jpg`),
  id,
  lease_token: `t-${id}`,
});
const renderRow = (id: string): PlateRequest => ({ ...request("project_rooms", "concept", RENDER_PATH), id, lease_token: `t-${id}` });

// How long each step takes to answer: 0 or absent is at once, null is never.
type Timing = Partial<Record<"claim" | "owned" | "sign" | "ingest" | "record" | "fail" | "finish", number | null>>;

// The queue, the database steps and the media worker, all on `clock`. Steps
// ignore their abort signal, as a request already sent may; the run must end anyway.
function world(
  clock: FakeClock,
  rows: PlateRequest[],
  timing: Timing = {},
  ingest?: (request: PlateRequest, signal: AbortSignal) => Promise<Response>,
) {
  const log = {
    claims: [] as number[],
    ingests: [] as { id: string; at: number }[],
    fails: [] as { id: string; error: string; at: number }[],
    finishes: [] as RunSummary[],
    aborts: {} as Record<string, number>,
    peak: 0,
  };
  let inFlight = 0;
  const wait = <T>(ms: number | null | undefined, value: T): Promise<T> =>
    ms === null
      ? new Promise<T>(() => {})
      : ms
      ? new Promise<T>((resolve) => clock.setTimeout(() => resolve(value), ms))
      : Promise.resolve(value);
  const watch = (step: string, signal: AbortSignal | undefined) =>
    signal?.addEventListener("abort", () => (log.aborts[step] = clock.now()), { once: true });
  const steps: CopySteps = {
    claim(signal) {
      watch("claim", signal);
      log.claims.push(clock.now());
      return wait(timing.claim, rows.shift() ?? null);
    },
    authority: {
      owned(_request, signal) {
        watch("owned", signal);
        return wait(timing.owned, true);
      },
      sign(bucket, path, signal) {
        watch("sign", signal);
        return wait(timing.sign, `https://signed.test/${bucket}/${path}?token=t`);
      },
    },
    ingest(request, _sourceUrl, signal) {
      watch("ingest", signal);
      log.ingests.push({ id: request.id, at: clock.now() });
      if (ingest) return ingest(request, signal);
      inFlight++;
      log.peak = Math.max(log.peak, inFlight);
      let over = false;
      const end = () => {
        if (!over) inFlight--;
        over = true;
      };
      signal.addEventListener("abort", end, { once: true });
      return wait(timing.ingest, null).then(() => (end(), Response.json(answer())));
    },
    record(_request, _asset, signal) {
      watch("record", signal);
      return wait(timing.record, undefined);
    },
    fail(request, error, signal) {
      watch("fail", signal);
      log.fails.push({ id: request.id, error, at: clock.now() });
      return wait(timing.fail, undefined);
    },
    finish(summary, signal) {
      watch("finish", signal);
      log.finishes.push(summary);
      return wait(timing.finish, undefined);
    },
  };
  return { steps, log };
}

function startRun(clock: FakeClock, steps: CopySteps, limit = 10) {
  const run = new RunDeadline(clock);
  const ended: { at: number | null; summary: RunSummary | null; claimError: unknown } = {
    at: null,
    summary: null,
    claimError: null,
  };
  copyRun(steps, run, SUPABASE, limit).then(({ summary, claimError }) => {
    Object.assign(ended, { at: clock.now(), summary, claimError });
    run.close();
  });
  return ended;
}

const counts = (claimed: number, recorded: number, failed: number) => ({ claimed, recorded, failed });

Deno.test("copyRun: a claim answered after the 20 s start budget fails its row as run budget exceeded, unstarted", async () => {
  const clock = new FakeClock();
  const { steps, log } = world(clock, [hotlinkRow("r1"), hotlinkRow("r2")], { claim: 25_000 });
  const ended = startRun(clock, steps);
  await clock.runUntil(70_000);
  assertEquals(log.ingests, []);
  assertEquals(log.fails, [{ id: "r1", error: RUN_BUDGET_EXCEEDED, at: 25_000 }]);
  assertEquals(log.claims, [0], "no claim after the start budget");
  assertEquals(ended.at, 25_000);
  assertEquals(ended.summary, { status: "failed", detail: counts(1, 0, 1), error: "all 1 copies failed" });
});

Deno.test("copyRun: a claim answered at 61 s is cut off at 45 s; the run ends before 55 s and never ingests the late row", async () => {
  const clock = new FakeClock();
  const { steps, log } = world(clock, [hotlinkRow("r1")], { claim: 61_000 });
  const ended = startRun(clock, steps);
  await clock.runUntil(70_000);
  assertEquals(log.aborts.claim, 45_000);
  assertEquals(ended.at, 45_000);
  // SQ-1655 R1 ruling: a claim first seen after the hard end cannot be
  // settled. No late ingest/fail; the 10-minute lease expiry recovers it.
  // This attempt counts: the third expiry leaves it failed, not re-queued.
  assertEquals(log.ingests, []);
  assertEquals(log.fails, []);
  assertEquals(ended.summary, { status: "failed", detail: counts(0, 0, 0), error: RUN_BUDGET_EXCEEDED });
  assertEquals(log.finishes, [ended.summary!]);
});

Deno.test("copyRun: an ownership read or signing answered late fails the row unstarted as run budget exceeded", async () => {
  const cases: [Timing, number][] = [
    [{ owned: 25_000 }, 25_000],
    [{ owned: 61_000 }, 45_000],
    [{ sign: 25_000 }, 25_000],
    [{ sign: 61_000 }, 45_000],
  ];
  for (const [timing, failedAt] of cases) {
    const clock = new FakeClock();
    const { steps, log } = world(clock, [renderRow("r1"), renderRow("r2")], timing);
    const ended = startRun(clock, steps);
    await clock.runUntil(70_000);
    const name = JSON.stringify(timing);
    assertEquals(log.ingests, [], name);
    assertEquals(log.fails, [{ id: "r1", error: RUN_BUDGET_EXCEEDED, at: failedAt }], name);
    assertEquals(log.claims, [0], name);
    assertEquals(ended.at, failedAt, name);
  }
});

Deno.test("copyRun: a record still unanswered is aborted at 45 s, its row failed and the run over before 55 s", async () => {
  const clock = new FakeClock();
  const { steps, log } = world(clock, [hotlinkRow("r1"), hotlinkRow("r2")], { record: 70_000 });
  const ended = startRun(clock, steps);
  await clock.runUntil(80_000);
  assertEquals(log.aborts.record, 45_000);
  assertEquals(log.fails, [{ id: "r1", error: RUN_BUDGET_EXCEEDED, at: 45_000 }]);
  assertEquals(ended.at, 45_000);
  assertEquals(ended.summary?.detail, counts(1, 0, 1));
});

Deno.test("copyRun: the ingest is given min(30 s, what is left of the 50 s less 5 s)", async () => {
  assertEquals(ingestTimeoutMs(0), 30_000);
  assertEquals(ingestTimeoutMs(15_000), 30_000);
  assertEquals(ingestTimeoutMs(19_000), 26_000);
  assertEquals(ingestTimeoutMs(50_000), 0);
  // Claimed at 19 s, the ingest that never answers is aborted at 45 s.
  const clock = new FakeClock();
  const { steps, log } = world(clock, [hotlinkRow("r1")], { claim: 19_000, ingest: null });
  const ended = startRun(clock, steps);
  await clock.runUntil(70_000);
  assertEquals(log.ingests, [{ id: "r1", at: 19_000 }]);
  assertEquals(log.aborts.ingest, 45_000);
  assertEquals(log.fails, [{ id: "r1", error: "ingest timed out after 26000 ms", at: 45_000 }]);
  assertEquals(ended.at, 45_000);
});

Deno.test("copyRun: whichever step never answers, the run has ended by 50 s and starts no ingest after 20 s", async () => {
  const cases: Record<string, Timing> = {
    claim: { claim: null },
    owned: { owned: null },
    sign: { sign: null },
    ingest: { ingest: null },
    record: { record: null },
    fail: { owned: 25_000, fail: null },
    finish: { finish: null },
  };
  for (const [step, timing] of Object.entries(cases)) {
    const clock = new FakeClock();
    const { steps, log } = world(clock, [renderRow("r1"), renderRow("r2")], timing);
    const ended = startRun(clock, steps);
    await clock.runUntil(120_000);
    assert(ended.at !== null && ended.at <= 50_000, `${step}: ended at ${ended.at}`);
    assert(log.aborts[step] !== undefined && log.aborts[step] <= 50_000, `${step}: aborted at ${log.aborts[step]}`);
    assert(log.ingests.every(({ at }) => at < 20_000), step);
    assertEquals(log.finishes.length, 1, step);
  }
});

Deno.test("copyRun: one copy in flight, claimed one at a time, none claimed after the start budget", async () => {
  // 8 s per ingest: copies start at 0, 8 and 16 s; at 24 s the 20 s start budget is spent.
  const clock = new FakeClock();
  const rows = Array.from({ length: 238 }, (_, n) => hotlinkRow(`r${n}`));
  const { steps, log } = world(clock, rows, { ingest: 8_000 });
  const ended = startRun(clock, steps);
  await clock.runUntil(70_000);
  assertEquals(log.claims, [0, 8_000, 16_000]);
  assertEquals(log.peak, 1);
  assertEquals(rows.length, 235, "nothing past the budget is leased");
  assertEquals(ended.at, 24_000);
  assertEquals(ended.summary, { status: "succeeded", detail: counts(3, 3, 0), error: null });
});

Deno.test("copyRun: a run started 5 s into another gets 503 busy from the one-job processor, fails that row and stops", async () => {
  const clock = new FakeClock();
  const rows = Array.from({ length: 6 }, (_, n) => hotlinkRow(`r${n}`));
  // The container lane: one job at a time, 15 s each; another job meanwhile is refused.
  let running = 0;
  let peak = 0;
  const lane = (_request: PlateRequest, signal: AbortSignal): Promise<Response> => {
    if (running > 0) return Promise.resolve(Response.json({ error: "busy" }, { status: 503 }));
    running++;
    peak = Math.max(peak, running);
    return new Promise((resolve, reject) => {
      const done = () => signal.removeEventListener("abort", killed);
      const killed = () => {
        clock.clearTimeout(id);
        running--;
        done();
        reject(signal.reason);
      };
      const id = clock.setTimeout(() => {
        running--;
        done();
        resolve(Response.json(answer()));
      }, 15_000);
      signal.addEventListener("abort", killed, { once: true });
    });
  };
  const a = world(clock, rows, {}, lane);
  const first = startRun(clock, a.steps);
  await clock.runUntil(5_000);
  const b = world(clock, rows, {}, lane);
  const second = startRun(clock, b.steps);
  await clock.runUntil(120_000);
  assertEquals(peak, 1, "never two ingests in flight");
  assertEquals(b.log.ingests, [{ id: "r1", at: 5_000 }]);
  assertEquals(b.log.fails, [{ id: "r1", error: "ingest 503 busy", at: 5_000 }]);
  assertEquals(b.log.claims, [5_000], "a busy processor ends the run");
  assertEquals(second.at, 5_000);
  assertEquals(a.log.ingests, [{ id: "r0", at: 0 }, { id: "r2", at: 15_000 }]);
  assertEquals(a.log.fails, []);
  assertEquals(first.at, 30_000);
  assertEquals(first.summary?.detail, counts(2, 2, 0));
});

Deno.test("copyRun: stops at the claim limit or an empty queue", async () => {
  for (const [queued, claimed, status] of [[238, 10, "succeeded"], [2, 2, "succeeded"], [0, 0, "skipped"]] as const) {
    const clock = new FakeClock();
    const rows = Array.from({ length: queued }, (_, n) => hotlinkRow(`r${n}`));
    const { steps } = world(clock, rows);
    const ended = startRun(clock, steps);
    await clock.runUntil(1_000);
    assertEquals(ended.summary?.detail, counts(claimed, claimed, 0));
    assertEquals(ended.summary?.status, status);
  }
});

Deno.test("copyRun: a claim error ends the run with the counts so far", async () => {
  const clock = new FakeClock();
  const { steps, log } = world(clock, [1, 2, 3, 4, 5].map((n) => hotlinkRow(`r${n}`)));
  let claims = 0;
  const claim = steps.claim;
  steps.claim = (signal) => (++claims === 3 ? Promise.reject(new Error("claim boom")) : claim(signal));
  const ended = startRun(clock, steps);
  await clock.runUntil(1_000);
  assertEquals(shortenError(ended.claimError), "claim boom");
  assertEquals(ended.summary, { status: "failed", detail: counts(2, 2, 0), error: "claim boom" });
  assertEquals(log.finishes, [ended.summary!]);
});
