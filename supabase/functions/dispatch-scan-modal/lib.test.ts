// Deno tests for the pure dispatch-scan-modal lib.
// Run: deno test --allow-read --config supabase/functions/deno.json supabase/functions/dispatch-scan-modal/lib.test.ts
// (--allow-read: the contract tests at the bottom read ./contract.json. CI's
//  `deno test --allow-all ... supabase/functions` already covers it.)

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  BATCH_LIMIT,
  buildLogLine,
  buildModalDispatchBody,
  decideDispatchFailure,
  DISPATCH_TASK_TYPES,
  extractTaskInputIds,
  isSpawnSuccess,
  KEY_PREFIX_REJECTED,
  keyMatchesScanOwner,
  MAX_DISPATCH_ATTEMPTS,
  newLeaseOwner,
  objectKeyFromRoomScansUrl,
  readDispatchAttempts,
  shouldSkipForNoWork,
  SIGNED_URL_TTL_S,
  validateEnv,
  WORKER_ID_PREFIX,
  type ClaimedTaskRow,
} from "./lib.ts";

const FULL_ENV = {
  MODAL_SPAWN_URL: "https://modal.example/spawn",
  MODAL_BEARER_TOKEN: "secret-token",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function makeTask(overrides: Partial<ClaimedTaskRow> = {}): ClaimedTaskRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    task_type: "scan_pipeline.verify",
    payload: { scan_id: "22222222-2222-2222-2222-222222222222", room_file_version: 1, user_id: "u1" },
    artifacts: {},
    attempts: 1,
    max_attempts: 5,
    ...overrides,
  };
}

// ─── env fail-closed ────────────────────────────────────────────────────────

Deno.test("validateEnv: all present → ok with the env object", () => {
  const result = validateEnv(FULL_ENV);
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.env.MODAL_SPAWN_URL, FULL_ENV.MODAL_SPAWN_URL);
    assertEquals(result.env.MODAL_BEARER_TOKEN, FULL_ENV.MODAL_BEARER_TOKEN);
  }
});

Deno.test("validateEnv: missing MODAL_SPAWN_URL → fail-closed, names it", () => {
  const { MODAL_SPAWN_URL: _drop, ...rest } = FULL_ENV;
  const result = validateEnv(rest);
  assertFalse(result.ok);
  if (!result.ok) assertEquals(result.missing, ["MODAL_SPAWN_URL"]);
});

Deno.test("validateEnv: all missing → every key named, in declared order", () => {
  const result = validateEnv({});
  assertFalse(result.ok);
  if (!result.ok) {
    assertEquals(result.missing, [
      "MODAL_SPAWN_URL",
      "MODAL_BEARER_TOKEN",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  }
});

Deno.test("validateEnv: blank string counts as missing (not just undefined)", () => {
  const result = validateEnv({ ...FULL_ENV, MODAL_BEARER_TOKEN: "   " });
  assertFalse(result.ok);
  if (!result.ok) assertEquals(result.missing, ["MODAL_BEARER_TOKEN"]);
});

// ─── empty-queue no-op ──────────────────────────────────────────────────────

Deno.test("shouldSkipForNoWork: zero eligible → skip", () => {
  assert(shouldSkipForNoWork(0));
});

Deno.test("shouldSkipForNoWork: one or more eligible → proceed", () => {
  assertFalse(shouldSkipForNoWork(1));
  assertFalse(shouldSkipForNoWork(BATCH_LIMIT));
});

Deno.test("DISPATCH_TASK_TYPES: exactly the three W0 stages, no others", () => {
  assertEquals(DISPATCH_TASK_TYPES, [
    "scan_pipeline.verify",
    "scan_pipeline.splat",
    "scan_pipeline.renders",
  ]);
});

// ─── task payload validation ────────────────────────────────────────────────

Deno.test("extractTaskInputIds: valid payload → ok with scanId/roomFileVersion", () => {
  const result = extractTaskInputIds(makeTask());
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.ids.scanId, "22222222-2222-2222-2222-222222222222");
    assertEquals(result.ids.roomFileVersion, 1);
  }
});

Deno.test("extractTaskInputIds: missing scan_id → rejected with reason", () => {
  const task = makeTask({ payload: { room_file_version: 1 } });
  const result = extractTaskInputIds(task);
  assertFalse(result.ok);
  if (!result.ok) assert(result.reason.includes("scan_id"));
});

Deno.test("extractTaskInputIds: non-numeric room_file_version → rejected", () => {
  const task = makeTask({
    payload: { scan_id: "22222222-2222-2222-2222-222222222222", room_file_version: "1" },
  });
  const result = extractTaskInputIds(task);
  assertFalse(result.ok);
  if (!result.ok) assert(result.reason.includes("room_file_version"));
});

Deno.test("extractTaskInputIds: empty payload → rejected on scan_id first", () => {
  const result = extractTaskInputIds(makeTask({ payload: {} }));
  assertFalse(result.ok);
});

// ─── object key derivation ──────────────────────────────────────────────────

Deno.test("objectKeyFromRoomScansUrl: bare key passes through", () => {
  assertEquals(
    objectKeyFromRoomScansUrl("mesh/u1/r1/mesh.ply"),
    "mesh/u1/r1/mesh.ply",
  );
});

Deno.test("objectKeyFromRoomScansUrl: public-shaped URL → key after the marker", () => {
  assertEquals(
    objectKeyFromRoomScansUrl(
      "https://proj.supabase.co/storage/v1/object/public/room-scans/mesh/u1/r1/mesh.ply",
    ),
    "mesh/u1/r1/mesh.ply",
  );
});

Deno.test("objectKeyFromRoomScansUrl: strips a query string", () => {
  assertEquals(
    objectKeyFromRoomScansUrl("captured_room/u1/r1/captured_room.json?token=abc"),
    "captured_room/u1/r1/captured_room.json",
  );
});

Deno.test("objectKeyFromRoomScansUrl: null/empty → null", () => {
  assertEquals(objectKeyFromRoomScansUrl(null), null);
  assertEquals(objectKeyFromRoomScansUrl(undefined), null);
  assertEquals(objectKeyFromRoomScansUrl(""), null);
});

// ─── payload construction ────────────────────────────────────────────────────

Deno.test("buildModalDispatchBody: exact minimal shape, nothing extra", () => {
  const body = buildModalDispatchBody({
    taskId: "task-1",
    leaseToken: "dispatch-scan-modal:lease-1",
    scanId: "scan-1",
    roomFileId: "rf-1",
    roomFileVersion: 3,
    taskType: "scan_pipeline.splat",
    traceId: "trace-1",
    inputs: {
      meshUrl: "https://signed.example/mesh.ply?sig=1",
      capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=2",
    },
  });
  assertEquals(body, {
    taskId: "task-1",
    leaseToken: "dispatch-scan-modal:lease-1",
    scanId: "scan-1",
    roomFileId: "rf-1",
    roomFileVersion: 3,
    taskType: "scan_pipeline.splat",
    traceId: "trace-1",
    inputs: {
      meshUrl: "https://signed.example/mesh.ply?sig=1",
      capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=2",
    },
  });
});

Deno.test("buildModalDispatchBody: never leaks the bearer token into the body", () => {
  const body = buildModalDispatchBody({
    taskId: "t",
    leaseToken: "dispatch-scan-modal:lease-1",
    scanId: "s",
    roomFileId: "rf",
    roomFileVersion: 1,
    taskType: "scan_pipeline.verify",
    traceId: "tr",
    inputs: { meshUrl: "u1", capturedRoomJsonUrl: "u2" },
  });
  assertFalse(JSON.stringify(body).includes("Bearer"));
});

// ─── per-invocation lease owner ─────────────────────────────────────────────

Deno.test("newLeaseOwner: prefixed, and never the same twice", () => {
  const a = newLeaseOwner();
  const b = newLeaseOwner();
  assert(a.startsWith(`${WORKER_ID_PREFIX}:`));
  assert(b.startsWith(`${WORKER_ID_PREFIX}:`));
  // The whole point: two invocations must not share a lease identity, or a
  // stale worker's token would still match the live lease.
  assertFalse(a === b);
});

Deno.test("SIGNED_URL_TTL_S: outlasts the longest Modal stage", () => {
  assertEquals(SIGNED_URL_TTL_S, 3600);
});

// ─── owner-prefix anchoring ─────────────────────────────────────────────────

const UID = "faa8cb85-c74c-45d0-887c-d7826756c2b4";
const RID = "11111111-2222-3333-4444-555555555555";

Deno.test("keyMatchesScanOwner: the scan's own prefix is accepted", () => {
  assert(keyMatchesScanOwner(`mesh/${UID}/${RID}/mesh.ply`, UID, RID));
  assert(keyMatchesScanOwner(`captured_room/${UID}/${RID}/captured_room.json`, UID, RID));
});

Deno.test("keyMatchesScanOwner: a foreign user segment is rejected", () => {
  const foreign = "00000000-0000-4000-8000-000000000000";
  assertFalse(keyMatchesScanOwner(`mesh/${foreign}/${RID}/mesh.ply`, UID, RID));
});

Deno.test("keyMatchesScanOwner: a foreign room segment is rejected", () => {
  const foreign = "99999999-9999-4999-8999-999999999999";
  assertFalse(keyMatchesScanOwner(`mesh/${UID}/${foreign}/mesh.ply`, UID, RID));
});

Deno.test("keyMatchesScanOwner: a key too short to carry a prefix is rejected", () => {
  assertFalse(keyMatchesScanOwner(`${UID}/${RID}/mesh.ply`, UID, RID));
  assertFalse(keyMatchesScanOwner("mesh.ply", UID, RID));
});

Deno.test("keyMatchesScanOwner: an unprovable row (null user_id or room_id) fails closed", () => {
  assertFalse(keyMatchesScanOwner(`mesh/${UID}/${RID}/mesh.ply`, null, RID));
  assertFalse(keyMatchesScanOwner(`mesh/${UID}/${RID}/mesh.ply`, UID, null));
  assertFalse(keyMatchesScanOwner(`mesh/${UID}/${RID}/mesh.ply`, "", ""));
});

Deno.test("KEY_PREFIX_REJECTED: a fixed literal that names no key", () => {
  assertFalse(KEY_PREFIX_REJECTED.includes("/"));
  assertFalse(KEY_PREFIX_REJECTED.includes("http"));
});

// ─── non-2xx / network-error release path ──────────────────────────────────

Deno.test("isSpawnSuccess: 2xx true, everything else false", () => {
  assert(isSpawnSuccess(200));
  assert(isSpawnSuccess(202));
  assert(isSpawnSuccess(299));
  assertFalse(isSpawnSuccess(199));
  assertFalse(isSpawnSuccess(300));
  assertFalse(isSpawnSuccess(404));
  assertFalse(isSpawnSuccess(500));
});

Deno.test("readDispatchAttempts: absent artifacts → 0", () => {
  assertEquals(readDispatchAttempts(null), 0);
  assertEquals(readDispatchAttempts(undefined), 0);
  assertEquals(readDispatchAttempts({}), 0);
});

Deno.test("readDispatchAttempts: reads the prior count back", () => {
  assertEquals(readDispatchAttempts({ dispatch_attempts: 2 }), 2);
});

Deno.test("readDispatchAttempts: a malformed value degrades to 0, not a throw", () => {
  assertEquals(readDispatchAttempts({ dispatch_attempts: "two" }), 0);
  assertEquals(readDispatchAttempts({ dispatch_attempts: -1 }), 0);
});

Deno.test("decideDispatchFailure: increments and stays non-fatal under the cap", () => {
  const d = decideDispatchFailure(0);
  assertEquals(d.dispatchAttempts, 1);
  assertFalse(d.fatal);
});

Deno.test("decideDispatchFailure: fatal exactly at MAX_DISPATCH_ATTEMPTS", () => {
  const d = decideDispatchFailure(MAX_DISPATCH_ATTEMPTS - 1);
  assertEquals(d.dispatchAttempts, MAX_DISPATCH_ATTEMPTS);
  assert(d.fatal);
});

Deno.test("decideDispatchFailure: stays fatal past the cap (idempotent park)", () => {
  const d = decideDispatchFailure(MAX_DISPATCH_ATTEMPTS + 3);
  assert(d.fatal);
});

// ─── allow-list logging ─────────────────────────────────────────────────────

Deno.test("buildLogLine: only allow-listed fields for a known event survive", () => {
  const line = JSON.parse(
    buildLogLine("dispatch-scan-modal", "dispatch_failed", {
      task_id: "t1",
      scan_id: "s1",
      task_type: "scan_pipeline.splat",
      http_status: 500,
      error_kind: "non_2xx",
      fatal: false,
      dispatch_attempts: 1,
      // not allow-listed for this event — must be dropped:
      url: "https://modal.example/spawn?token=leak",
      body: '{"secret":"leak"}',
    }),
  );
  assertEquals(line.task_id, "t1");
  assertEquals(line.http_status, 500);
  assertEquals(line.url, undefined);
  assertEquals(line.body, undefined);
});

Deno.test("buildLogLine: unknown event name allow-lists nothing", () => {
  const line = JSON.parse(
    buildLogLine("dispatch-scan-modal", "totally_unknown_event", {
      secret: "leak",
    }),
  );
  assertEquals(line.secret, undefined);
  assertEquals(line.event, "totally_unknown_event");
});

Deno.test("buildLogLine: key_prefix_rejected can never carry the key", () => {
  const line = JSON.parse(
    buildLogLine("dispatch-scan-modal", "key_prefix_rejected", {
      task_id: "t1",
      scan_id: "s1",
      task_type: "scan_pipeline.verify",
      object_key: "mesh/someone-else/room/mesh.ply",
      key: "mesh/someone-else/room/mesh.ply",
    }),
  );
  assertEquals(line.task_id, "t1");
  assertEquals(line.object_key, undefined);
  assertEquals(line.key, undefined);
});

Deno.test("buildLogLine: env_missing carries only 'missing'", () => {
  const line = JSON.parse(
    buildLogLine("dispatch-scan-modal", "env_missing", {
      missing: ["MODAL_SPAWN_URL"],
      token: "should-not-appear",
    }),
  );
  assertEquals(line.missing, ["MODAL_SPAWN_URL"]);
  assertEquals(line.token, undefined);
});

// ─── the cross-language payload contract ───────────────────────────────────
//
// contract.json is the single canonical example body. This side asserts the
// dispatcher BUILDS a body with exactly that key set; the pytest
// (services/scan-modal/tests/test_contract.py) asserts the Modal side ACCEPTS
// it. Two independently-drifting halves is precisely how the dispatcher came
// to send `meshUrl`/`capturedRoomJsonUrl` while the job read
// `meshPlyUrl`/`capturedRoomUrl` — a contract only one side can see is not a
// contract.

async function readContract(): Promise<Record<string, unknown>> {
  const url = new URL("./contract.json", import.meta.url);
  return JSON.parse(await Deno.readTextFile(url)) as Record<string, unknown>;
}

function contractKeys(o: Record<string, unknown>): string[] {
  return Object.keys(o).filter((k) => k !== "_comment").sort();
}

Deno.test("contract.json: the built body has exactly the contract's key set", async () => {
  const contract = await readContract();
  const built = buildModalDispatchBody({
    taskId: contract.taskId as string,
    leaseToken: contract.leaseToken as string,
    scanId: contract.scanId as string,
    roomFileId: contract.roomFileId as string,
    roomFileVersion: contract.roomFileVersion as number,
    taskType: contract.taskType as string,
    traceId: contract.traceId as string,
    inputs: contract.inputs as { meshUrl: string; capturedRoomJsonUrl: string },
  });

  assertEquals(contractKeys(built), contractKeys(contract));
  assertEquals(
    Object.keys(built.inputs as Record<string, unknown>).sort(),
    Object.keys(contract.inputs as Record<string, unknown>).sort(),
  );
  // And the values round-trip — the contract is a real example, not a schema.
  assertEquals(built.leaseToken, contract.leaseToken);
  assertEquals(built.inputs, contract.inputs);
});

Deno.test("contract.json: carries the lease token and the unified input keys", async () => {
  const contract = await readContract();
  assert(typeof contract.leaseToken === "string");
  assert((contract.leaseToken as string).startsWith(`${WORKER_ID_PREFIX}:`));
  assertEquals(
    Object.keys(contract.inputs as Record<string, unknown>).sort(),
    ["capturedRoomJsonUrl", "meshUrl"],
  );
});
