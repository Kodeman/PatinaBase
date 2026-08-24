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
  capPhotoKeys,
  claimGroups,
  decideDispatchFailure,
  DEFAULT_VISIBILITY_TIMEOUT,
  DISPATCH_TASK_TYPES,
  extractStageConfig,
  extractTaskInputIds,
  isPoseBearing,
  isSpawnSuccess,
  isSupersededVersion,
  KEY_PREFIX_REJECTED,
  keyMatchesScanOwner,
  MAX_DISPATCH_ATTEMPTS,
  newLeaseOwner,
  objectKeyFromRoomScansUrl,
  PHOTO_URL_CAP,
  readDispatchAttempts,
  shouldSkipForNoWork,
  SIGNED_URL_TTL_S,
  SPLAT_VISIBILITY_TIMEOUT,
  stageForTaskType,
  SUPERSEDED_ARTIFACTS,
  validateEnv,
  visibilityTimeoutForTaskType,
  WORKER_ID_PREFIX,
  type ClaimedTaskRow,
  type DispatchInputs,
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
    taskType: "scan_pipeline.verify",
    traceId: "trace-1",
    inputs: {
      kind: "verify",
      meshUrl: "https://signed.example/mesh.ply?sig=1",
      capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=2",
    },
  });
  // `kind` is the dispatcher-side discriminant and must NOT survive into the
  // wire body — an exact-equality assertion is what proves it.
  assertEquals(body, {
    taskId: "task-1",
    leaseToken: "dispatch-scan-modal:lease-1",
    scanId: "scan-1",
    roomFileId: "rf-1",
    roomFileVersion: 3,
    taskType: "scan_pipeline.verify",
    traceId: "trace-1",
    inputs: {
      meshUrl: "https://signed.example/mesh.ply?sig=1",
      capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=2",
    },
  });
});

Deno.test("buildModalDispatchBody: a splat body carries the cap fields verbatim", () => {
  const body = buildModalDispatchBody({
    taskId: "task-1",
    leaseToken: "dispatch-scan-modal:lease-1",
    scanId: "scan-1",
    roomFileId: "rf-1",
    roomFileVersion: 3,
    taskType: "scan_pipeline.splat",
    traceId: "trace-1",
    inputs: {
      kind: "splat",
      photosSource: "manifest",
      photosManifestUrl: "https://signed.example/photos_metadata.ndjson?sig=1",
      photoUrls: ["https://signed.example/a.heic?sig=2"],
      capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=3",
      photoUrlsCapped: true,
      photoCount: 214,
    },
  });
  assertEquals(body.inputs, {
    photosSource: "manifest",
    photosManifestUrl: "https://signed.example/photos_metadata.ndjson?sig=1",
    photoUrls: ["https://signed.example/a.heic?sig=2"],
    capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=3",
    photoUrlsCapped: true,
    photoCount: 214,
  });
});

// ─── the queue's `config` knob ──────────────────────────────────────────────

Deno.test("extractStageConfig: a populated object is forwarded as-is", () => {
  const config = { maxIterations: 12000, somethingFuture: "x" };
  assertEquals(extractStageConfig({ scan_id: "s", config }), config);
});

Deno.test("extractStageConfig: absent, empty, null, array and scalar all mean none", () => {
  assertEquals(extractStageConfig({ scan_id: "s" }), undefined);
  assertEquals(extractStageConfig({ config: {} }), undefined);
  assertEquals(extractStageConfig({ config: null }), undefined);
  assertEquals(extractStageConfig({ config: [1, 2] }), undefined);
  assertEquals(extractStageConfig({ config: 12000 }), undefined);
  assertEquals(extractStageConfig({ config: "12000" }), undefined);
  assertEquals(extractStageConfig(null), undefined);
  assertEquals(extractStageConfig(undefined), undefined);
});

Deno.test("extractStageConfig: does not read or validate any key inside", () => {
  // The dispatcher forwards whatever the task set. A key it has never heard of
  // must survive; a key it HAS heard of must not be coerced or defaulted.
  const config = { maxIterations: "not-a-number", unknownKnob: { deep: true } };
  assertEquals(extractStageConfig({ config }), config);
});

Deno.test("buildModalDispatchBody: a splat body carries config only when set", () => {
  const base = {
    taskId: "task-1",
    leaseToken: "dispatch-scan-modal:lease-1",
    scanId: "scan-1",
    roomFileId: "rf-1",
    roomFileVersion: 3,
    taskType: "scan_pipeline.splat",
    traceId: "trace-1",
  };
  const splatInputs = {
    kind: "splat" as const,
    photosSource: "manifest" as const,
    photosManifestUrl: "https://signed.example/photos_metadata.ndjson?sig=1",
    photoUrls: ["https://signed.example/a.heic?sig=2"],
    capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=3",
    photoUrlsCapped: false,
    photoCount: 42,
  };

  const without = buildModalDispatchBody({ ...base, inputs: splatInputs });
  assertFalse("config" in (without.inputs as Record<string, unknown>));

  const withConfig = buildModalDispatchBody({
    ...base,
    inputs: { ...splatInputs, config: { maxIterations: 12000 } },
  });
  assertEquals((withConfig.inputs as Record<string, unknown>).config, { maxIterations: 12000 });
  // And nothing else moved: the config-bearing body is the plain one plus one key.
  assertEquals(
    Object.keys(withConfig.inputs as Record<string, unknown>).sort(),
    [...Object.keys(without.inputs as Record<string, unknown>), "config"].sort(),
  );
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
    inputs: { kind: "verify", meshUrl: "u1", capturedRoomJsonUrl: "u2" },
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

type ContractBody = Record<string, unknown>;

async function readContractDoc(): Promise<Record<string, Record<string, ContractBody>>> {
  const url = new URL("./contract.json", import.meta.url);
  return JSON.parse(await Deno.readTextFile(url)) as Record<string, Record<string, ContractBody>>;
}

async function readContract(): Promise<Record<string, ContractBody>> {
  return (await readContractDoc()).stages;
}

async function readVariants(): Promise<Record<string, ContractBody>> {
  return (await readContractDoc()).variants;
}

function contractKeys(o: Record<string, unknown>): string[] {
  return Object.keys(o).filter((k) => k !== "_comment").sort();
}

/** `kind` is the dispatcher-side discriminant, not part of the wire body — the
 *  contract file carries the wire shape, so it is added back here. */
function paramsFor(stage: string, body: ContractBody) {
  return {
    taskId: body.taskId as string,
    leaseToken: body.leaseToken as string,
    scanId: body.scanId as string,
    roomFileId: body.roomFileId as string,
    roomFileVersion: body.roomFileVersion as number,
    taskType: body.taskType as string,
    traceId: body.traceId as string,
    inputs: { kind: stage, ...(body.inputs as ContractBody) } as DispatchInputs,
  };
}

Deno.test("contract.json: every stage's built body has exactly that stage's key set", async () => {
  const stages = await readContract();
  assertEquals(Object.keys(stages).sort(), ["renders", "splat", "verify"]);

  for (const [stage, body] of Object.entries(stages)) {
    const built = buildModalDispatchBody(paramsFor(stage, body));
    assertEquals(contractKeys(built), contractKeys(body), `envelope drift on ${stage}`);
    assertEquals(
      Object.keys(built.inputs as Record<string, unknown>).sort(),
      Object.keys(body.inputs as Record<string, unknown>).sort(),
      `inputs drift on ${stage}`,
    );
    // Values round-trip — the contract is a real example, not a schema. This
    // also proves `kind` never reaches the wire body.
    assertEquals(built.inputs, body.inputs);
    assertEquals(built.leaseToken, body.leaseToken);
    assertEquals(built.taskType, `scan_pipeline.${stage}`);
  }
});

Deno.test("contract.json: each stage's inputs are closed — no cross-stage keys", async () => {
  const stages = await readContract();
  assertEquals(
    Object.keys(stages.verify.inputs as ContractBody).sort(),
    ["capturedRoomJsonUrl", "meshUrl"],
  );
  assertEquals(
    Object.keys(stages.splat.inputs as ContractBody).sort(),
    [
      "capturedRoomJsonUrl", "photoCount", "photoUrls", "photoUrlsCapped",
      "photosManifestUrl", "photosSource",
    ],
  );
  // `renders` builds from the parametric room and merges the GLB on top, so
  // captured_room is required here and glbUrl is the optional overlay.
  assertEquals(
    Object.keys(stages.renders.inputs as ContractBody).sort(),
    ["capturedRoomJsonUrl", "glbUrl"],
  );
});

// ─── the splat pose-carrier fallback ───────────────────────────────────────

Deno.test("contract.json: the splat_rows variant round-trips through the builder", async () => {
  const variant = (await readVariants()).splat_rows;
  const built = buildModalDispatchBody(paramsFor("splat", variant));
  assertEquals(contractKeys(built), contractKeys(variant));
  assertEquals(built.inputs, variant.inputs);
  assertEquals(built.taskType, "scan_pipeline.splat");
});

Deno.test("contract.json: the splat_config variant round-trips through the builder", async () => {
  const variant = (await readVariants()).splat_config;
  const built = buildModalDispatchBody(paramsFor("splat", variant));
  assertEquals(contractKeys(built), contractKeys(variant));
  assertEquals(built.inputs, variant.inputs);
  assertEquals(built.taskType, "scan_pipeline.splat");
});

Deno.test("contract.json: the splat_pose_refine variant round-trips through the builder", async () => {
  const variant = (await readVariants()).splat_pose_refine;
  const built = buildModalDispatchBody(paramsFor("splat", variant));
  assertEquals(contractKeys(built), contractKeys(variant));
  assertEquals(built.inputs, variant.inputs);
  assertEquals(built.taskType, "scan_pipeline.splat");
});

Deno.test("contract.json: splat_pose_refine carries poseRefine in its config", async () => {
  const variant = (await readVariants()).splat_pose_refine;
  assertEquals(
    (variant.inputs as ContractBody).config,
    { poseRefine: "colmap" },
  );
});

Deno.test("contract.json: splat_config is the base splat shape plus config", async () => {
  const stages = await readContract();
  const variant = (await readVariants()).splat_config;
  const base = new Set(Object.keys(stages.splat.inputs as ContractBody));
  const withConfig = Object.keys(variant.inputs as ContractBody);
  assertEquals(withConfig.filter((k) => !base.has(k)), ["config"]);
  assertEquals(
    (variant.inputs as ContractBody).config,
    { maxIterations: 12000 },
  );
});

Deno.test("contract.json: the base splat stage carries NO config", async () => {
  // A task that sets nothing must produce exactly the body it produced before
  // this knob existed — that is what makes the change safe to deploy ahead of
  // any task using it.
  const stages = await readContract();
  assertFalse("config" in (stages.splat.inputs as ContractBody));
  const built = buildModalDispatchBody(paramsFor("splat", stages.splat));
  assertFalse("config" in (built.inputs as Record<string, unknown>));
});

Deno.test("contract.json: splat_rows carries photoRecords and NO manifest url", async () => {
  const variant = (await readVariants()).splat_rows;
  const inputs = variant.inputs as ContractBody;
  assertEquals(Object.keys(inputs).sort(), [
    "capturedRoomJsonUrl", "photoCount", "photoRecords", "photoUrls",
    "photoUrlsCapped", "photosSource",
  ]);
  assertEquals(inputs.photosSource, "rows");
  assertEquals(inputs.photosManifestUrl, undefined);
});

Deno.test("buildModalDispatchBody: exactly one pose carrier reaches the wire", async () => {
  const stages = await readContract();
  const variants = await readVariants();

  const manifestBody = buildModalDispatchBody(paramsFor("splat", stages.splat));
  const manifestInputs = manifestBody.inputs as Record<string, unknown>;
  assertEquals(manifestInputs.photosSource, "manifest");
  assert("photosManifestUrl" in manifestInputs);
  assertFalse("photoRecords" in manifestInputs);

  const rowsBody = buildModalDispatchBody(paramsFor("splat", variants.splat_rows));
  const rowsInputs = rowsBody.inputs as Record<string, unknown>;
  assertEquals(rowsInputs.photosSource, "rows");
  assert("photoRecords" in rowsInputs);
  // Not merely undefined — ABSENT. The Modal side branches on truthiness of
  // photosManifestUrl, so an explicit undefined key would be equivalent here,
  // but an explicit *null* would not, and absence is the shape that cannot be
  // read as "there is a manifest".
  assertFalse("photosManifestUrl" in rowsInputs);
});

Deno.test("isPoseBearing: a complete row is usable", async () => {
  const variant = (await readVariants()).splat_rows;
  for (const record of (variant.inputs as ContractBody).photoRecords as unknown[]) {
    assert(isPoseBearing(record as never));
  }
});

Deno.test("isPoseBearing: a null or absent pose is dropped, never guessed at", () => {
  assertFalse(isPoseBearing(null));
  assertFalse(isPoseBearing(undefined));
  assertFalse(isPoseBearing({} as never));
});

Deno.test("isPoseBearing: a wrong-length or non-finite transform is dropped", () => {
  const good = {
    fileName: "a.heic",
    cameraTransform: Array.from({ length: 16 }, () => 1),
    cameraIntrinsics: { fx: 1, fy: 1, cx: 1, cy: 1, width: 2, height: 2 },
    width: 2,
    height: 2,
  };
  assert(isPoseBearing(good));
  assertFalse(isPoseBearing({ ...good, cameraTransform: [1, 2, 3] }));
  assertFalse(isPoseBearing({
    ...good,
    cameraTransform: [...Array.from({ length: 15 }, () => 1), Number.NaN],
  }));
});

Deno.test("isPoseBearing: incomplete intrinsics are dropped", () => {
  const base = {
    fileName: "a.heic",
    cameraTransform: Array.from({ length: 16 }, () => 1),
    width: 2,
    height: 2,
  };
  assertFalse(isPoseBearing({ ...base, cameraIntrinsics: { fx: 1, fy: 1, cx: 1, cy: 1 } } as never));
  assertFalse(isPoseBearing({ ...base, cameraIntrinsics: null } as never));
});

Deno.test("isPoseBearing: a zero or missing image extent is dropped", () => {
  const base = {
    fileName: "a.heic",
    cameraTransform: Array.from({ length: 16 }, () => 1),
    cameraIntrinsics: { fx: 1, fy: 1, cx: 1, cy: 1, width: 2, height: 2 },
    width: 2,
    height: 2,
  };
  assertFalse(isPoseBearing({ ...base, width: 0 }));
  assertFalse(isPoseBearing({ ...base, height: undefined } as never));
  assertFalse(isPoseBearing({ ...base, fileName: "" }));
});

Deno.test("buildLogLine: dispatch_spawned carries photos_source and still no url", () => {
  const line = JSON.parse(
    buildLogLine("dispatch-scan-modal", "dispatch_spawned", {
      task_id: "t1",
      scan_id: "s1",
      task_type: "scan_pipeline.splat",
      http_status: 202,
      photos_source: "rows",
      photos_manifest_url: "https://signed.example/x?token=leak",
    }),
  );
  assertEquals(line.photos_source, "rows");
  assertEquals(line.photos_manifest_url, undefined);
});

Deno.test("contract.json: every stage carries the lease token", async () => {
  const stages = await readContract();
  for (const body of Object.values(stages)) {
    assert(typeof body.leaseToken === "string");
    assert((body.leaseToken as string).startsWith(`${WORKER_ID_PREFIX}:`));
  }
});

// ─── per-stage input resolution (W2) ───────────────────────────────────────

Deno.test("stageForTaskType: maps the three dispatch task types", () => {
  assertEquals(stageForTaskType("scan_pipeline.verify"), "verify");
  assertEquals(stageForTaskType("scan_pipeline.splat"), "splat");
  assertEquals(stageForTaskType("scan_pipeline.renders"), "renders");
});

Deno.test("stageForTaskType: tolerates the bare stage name", () => {
  assertEquals(stageForTaskType("splat"), "splat");
});

Deno.test("stageForTaskType: anything else is null, never a guess", () => {
  assertEquals(stageForTaskType("scan_pipeline.ingest"), null);
  assertEquals(stageForTaskType("scan_pipeline.solve"), null);
  assertEquals(stageForTaskType(""), null);
  assertEquals(stageForTaskType("verify.scan_pipeline"), null);
});

Deno.test("stageForTaskType: covers exactly DISPATCH_TASK_TYPES and nothing more", () => {
  for (const t of DISPATCH_TASK_TYPES) assert(stageForTaskType(t) !== null);
});

Deno.test("capPhotoKeys: under the cap passes through uncapped", () => {
  const keys = ["a", "b", "c"];
  const cap = capPhotoKeys(keys);
  assertEquals(cap.keys, keys);
  assertFalse(cap.capped);
  assertEquals(cap.total, 3);
});

Deno.test("capPhotoKeys: exactly at the cap is NOT capped", () => {
  const keys = Array.from({ length: PHOTO_URL_CAP }, (_, i) => `k${i}`);
  const cap = capPhotoKeys(keys);
  assertEquals(cap.keys.length, PHOTO_URL_CAP);
  assertFalse(cap.capped);
});

Deno.test("capPhotoKeys: over the cap truncates in order and says so", () => {
  const keys = Array.from({ length: PHOTO_URL_CAP + 25 }, (_, i) => `k${i}`);
  const cap = capPhotoKeys(keys);
  assertEquals(cap.keys.length, PHOTO_URL_CAP);
  assertEquals(cap.keys[0], "k0");
  assertEquals(cap.keys[PHOTO_URL_CAP - 1], `k${PHOTO_URL_CAP - 1}`);
  assert(cap.capped);
  // The FULL count survives into the payload, so a truncated splat is visible
  // rather than silently smaller than the capture.
  assertEquals(cap.total, PHOTO_URL_CAP + 25);
});

Deno.test("capPhotoKeys: an empty list is uncapped and empty", () => {
  const cap = capPhotoKeys([]);
  assertEquals(cap.keys, []);
  assertFalse(cap.capped);
  assertEquals(cap.total, 0);
});

Deno.test("buildModalDispatchBody: a splat body carries no verify/renders keys", async () => {
  const stages = await readContract();
  const built = buildModalDispatchBody(paramsFor("splat", stages.splat));
  const inputs = built.inputs as Record<string, unknown>;
  assertEquals(inputs.meshUrl, undefined);
  assertEquals(inputs.glbUrl, undefined);
  assertEquals((inputs as { kind?: unknown }).kind, undefined);
});

Deno.test("buildModalDispatchBody: a renders body carries the room, then the GLB", async () => {
  const stages = await readContract();
  const built = buildModalDispatchBody(paramsFor("renders", stages.renders));
  assertEquals(
    Object.keys(built.inputs as Record<string, unknown>),
    ["capturedRoomJsonUrl", "glbUrl"],
  );
});

Deno.test("buildModalDispatchBody: a renders body OMITS an absent glbUrl", () => {
  // Absent, not null. The Modal side reads `glbUrl` for truthiness, and the
  // contract asserts key SETS — an explicit null would both fail the shape
  // check and read as "there is a GLB" to anything less careful.
  const built = buildModalDispatchBody({
    taskId: "task-1",
    leaseToken: "dispatch-scan-modal:lease-1",
    scanId: "scan-1",
    roomFileId: "rf-1",
    roomFileVersion: 3,
    taskType: "scan_pipeline.renders",
    traceId: "trace-1",
    inputs: {
      kind: "renders",
      capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=1",
    },
  });
  assertEquals(built.inputs, {
    capturedRoomJsonUrl: "https://signed.example/captured_room.json?sig=1",
  });
});

// ─── per-task-type visibility timeout ──────────────────────────────────────

Deno.test("visibilityTimeoutForTaskType: splat gets 90 minutes, the others 30", () => {
  assertEquals(visibilityTimeoutForTaskType("scan_pipeline.splat"), SPLAT_VISIBILITY_TIMEOUT);
  assertEquals(visibilityTimeoutForTaskType("scan_pipeline.verify"), DEFAULT_VISIBILITY_TIMEOUT);
  assertEquals(visibilityTimeoutForTaskType("scan_pipeline.renders"), DEFAULT_VISIBILITY_TIMEOUT);
});

Deno.test("visibilityTimeoutForTaskType: the bare stage name resolves too", () => {
  assertEquals(visibilityTimeoutForTaskType("splat"), SPLAT_VISIBILITY_TIMEOUT);
});

Deno.test("visibilityTimeoutForTaskType: an unknown type gets the SHORT lease", () => {
  // Fail short, not long: an unrecognised type holding a 90-minute lease would
  // block its own retry for an hour and a half on a guess.
  assertEquals(visibilityTimeoutForTaskType("scan_pipeline.solve"), DEFAULT_VISIBILITY_TIMEOUT);
});

Deno.test("claimGroups: splat is claimed first, and alone", () => {
  const groups = claimGroups();
  assertEquals(groups.length, 2);
  assertEquals(groups[0].taskTypes, ["scan_pipeline.splat"]);
  assertEquals(groups[0].visibilityTimeout, SPLAT_VISIBILITY_TIMEOUT);
});

Deno.test("claimGroups: every dispatchable task type is claimed by exactly one group", () => {
  const seen = claimGroups().flatMap((g) => g.taskTypes);
  assertEquals([...seen].sort(), [...DISPATCH_TASK_TYPES].sort());
  assertEquals(new Set(seen).size, seen.length, "no task type may be claimed twice");
});

Deno.test("claimGroups: each group's lease matches what its types resolve to", () => {
  for (const group of claimGroups()) {
    for (const taskType of group.taskTypes) {
      assertEquals(visibilityTimeoutForTaskType(taskType), group.visibilityTimeout);
    }
  }
});

// ─── superseded-version guard ──────────────────────────────────────────────

Deno.test("isSupersededVersion: a strictly newer version supersedes", () => {
  assert(isSupersededVersion(1, 3));
  assert(isSupersededVersion(2, 3));
});

Deno.test("isSupersededVersion: the newest version is not superseded by itself", () => {
  assertFalse(isSupersededVersion(3, 3));
});

Deno.test("isSupersededVersion: a version ahead of the max is not superseded", () => {
  // Shouldn't happen, but treating it as superseded would park a live task.
  assertFalse(isSupersededVersion(4, 3));
});

Deno.test("isSupersededVersion: an unavailable max never supersedes", () => {
  // A failed room_files lookup must fall through to the ordinary dispatch path
  // and its ordinary retry — never park a task permanently on a transient read.
  assertFalse(isSupersededVersion(1, null));
  assertFalse(isSupersededVersion(1, undefined));
  assertFalse(isSupersededVersion(1, NaN));
});

Deno.test("SUPERSEDED_ARTIFACTS: carries a reason and no identifiers", () => {
  assertEquals(SUPERSEDED_ARTIFACTS, { dispatch_outcome: "superseded" });
});

Deno.test("buildLogLine: dispatch_superseded logs both versions and no key", () => {
  const line = JSON.parse(buildLogLine("dispatch-scan-modal", "dispatch_superseded", {
    task_id: "t-1",
    scan_id: "s-1",
    task_type: "scan_pipeline.splat",
    room_file_version: 1,
    max_version: 3,
    object_key: "captured_room/u/r/captured_room.json",
  }));
  assertEquals(line.room_file_version, 1);
  assertEquals(line.max_version, 3);
  assertEquals(line.object_key, undefined);
});
