// dispatch-scan-modal · lib.ts — PURE, no IO.
//
// The Rendered Room v2 (DELIVERY-PLAN.md §2, ruling R1): a billing-guarded
// dispatcher that claims accuracy/quality-lane agent_tasks and spawns each one
// on Modal. Modelled on convert-room-scan-glb's billing-guard shape and
// parse-room-scan's lib/shell split — but this lane rides the agent_tasks
// QUEUE (claim_agent_tasks/complete_agent_task, 00297/00378), not a raw table
// sweep, because R1 is explicit: agent_tasks stays the single queue of
// record and Modal is a spawn target, never a second queue.
//
// Everything decidable without a network/DB call lives here: env validation,
// task-payload shape checks, the Modal request body, and the retry/park
// decision on a failed spawn. index.ts (the shell) owns auth, the DB reads,
// the presigned-URL minting, the outbound POST, and the RPC calls.
//
// Nothing here throws on malformed input where a caller can degrade instead —
// validators return a discriminated result so the shell can log + fail the
// one bad task without derailing the rest of the batch.

// ─── Task-type surface (R3: verify/splat/renders are the three Modal-hosted
// stages; ingest/solve/drawings stay on the CPU box, untouched by this fn) ──

export const DISPATCH_TASK_TYPES = [
  "scan_pipeline.verify",
  "scan_pipeline.splat",
  "scan_pipeline.renders",
] as const;
export type DispatchTaskType = (typeof DISPATCH_TASK_TYPES)[number];

/** The three stages, as the Modal side names them. */
export type DispatchStage = "verify" | "splat" | "renders";

/** `"scan_pipeline.splat"` → `"splat"`. Returns null for anything else, so an
 *  unexpected task_type fails the one task rather than resolving the wrong
 *  stage's inputs for it. */
export function stageForTaskType(taskType: string): DispatchStage | null {
  const bare = taskType.startsWith("scan_pipeline.")
    ? taskType.slice("scan_pipeline.".length)
    : taskType;
  return bare === "verify" || bare === "splat" || bare === "renders" ? bare : null;
}

export const BATCH_LIMIT = 3;

// ─── Per-task-type visibility timeout ───────────────────────────────────────
//
// One 30-minute lease for all three stages was wrong for exactly one of them.
// W2 measured `splat` at ~55 minutes for its 30,000-iteration budget on the
// real fixture, so a run that trained and exported CORRECTLY would find its
// lease expired and have every ledger write refused with P0403 — it would burn
// a full L4 pass and then discard the result as `lease_rejected`
// (W2-EVIDENCE.md §4 C). The lease is the sharpest of the stage's three time
// budgets because it is the only one that silently throws away completed work.
//
// 90 minutes is the Modal function's own 7200 s ceiling with room to spare on
// neither side being the binding constraint: long enough that a full training
// run plus its export/compress tail cannot outlive it, short enough that a
// genuinely dead splat spawn is reclaimed within the hour and a half rather
// than never. verify and renders are CPU-minutes and single-digit minutes
// respectively and keep the original 30.
export const SPLAT_VISIBILITY_TIMEOUT = "90 minutes";
export const DEFAULT_VISIBILITY_TIMEOUT = "30 minutes";

export function visibilityTimeoutForTaskType(taskType: string): string {
  return stageForTaskType(taskType) === "splat"
    ? SPLAT_VISIBILITY_TIMEOUT
    : DEFAULT_VISIBILITY_TIMEOUT;
}

export interface ClaimGroup {
  taskTypes: DispatchTaskType[];
  visibilityTimeout: string;
}

/** The claim is split by lease length, not by stage, because `claim_agent_tasks`
 *  takes ONE `p_visibility_timeout` for the whole call. Splat-first is
 *  deliberate: it is the expensive stage and the one whose lease was wrong, so
 *  it should not be starved of the batch budget by a queue full of renders. */
export function claimGroups(): ClaimGroup[] {
  return [
    { taskTypes: ["scan_pipeline.splat"], visibilityTimeout: SPLAT_VISIBILITY_TIMEOUT },
    {
      taskTypes: ["scan_pipeline.verify", "scan_pipeline.renders"],
      visibilityTimeout: DEFAULT_VISIBILITY_TIMEOUT,
    },
  ];
}

// ─── Superseded-version guard ───────────────────────────────────────────────
//
// A task dispatched for room_file v1 of a scan now at v3 can never complete:
// 00492 refuses its ledger writes with P0404 (StaleVersion), the job exits
// clean without completing, and the next cron sweep claims and spawns it again
// — forever. W1's verify task `abad722d` reached attempts 7 against
// max_attempts 5 this way (W2-EVIDENCE.md open item 9). On a CPU stage that is
// free; on `splat` it allocates an L4 every five minutes indefinitely.
//
// So the check moves BEFORE the spawn: a task whose version is no longer the
// max for its scan is completed as superseded, without input resolution,
// without a presigned URL, and without a GPU.

/** Fixed literal — merged into `agent_tasks.artifacts` by complete_agent_task's
 *  `artifacts || p_artifacts`. No scan id, no version, no key: the row already
 *  carries all three in `payload`, and this is a reason, not a record. */
export const SUPERSEDED_ARTIFACTS = { dispatch_outcome: "superseded" } as const;
export const SUPERSEDED_REASON =
  "room_file_version superseded by a newer version for this scan";

/** True when a strictly newer room_file version exists for the scan. A null or
 *  non-finite max (no rows, or an unreadable answer) is NOT superseded — the
 *  guard must never park a task on a failed lookup, which is a transient fault
 *  and belongs to the ordinary retry path. */
export function isSupersededVersion(
  dispatchVersion: number,
  maxVersion: number | null | undefined,
): boolean {
  if (typeof maxVersion !== "number" || !Number.isFinite(maxVersion)) return false;
  return maxVersion > dispatchVersion;
}
// Must outlast the whole Modal stage, not just the download: the presigned URL
// is fetched inside the job, and splat's run is 10–25 minutes. 600s expired
// mid-run.
export const SIGNED_URL_TTL_S = 3600;

// The lease token's stable prefix. The token ITSELF is minted per invocation
// (`newLeaseOwner()`), never reused: it is what `claim_agent_tasks` records as
// `locked_by`, what Modal is handed as `leaseToken`, and what 00490's wrappers
// check `locked_by` against before any write. A constant worker id would make
// every invocation's token match every lease, so a stale Modal job could fail
// or complete a task a live worker is running — the duplicate-spawn
// amplification 00490's P0403 path exists to stop.
export const WORKER_ID_PREFIX = "dispatch-scan-modal";

export function newLeaseOwner(): string {
  return `${WORKER_ID_PREFIX}:${crypto.randomUUID()}`;
}

// A spawn can be preempted/misconfigured a bounded number of times before the
// dispatcher gives up and parks the task fatally, rather than retrying a spawn
// that will never succeed (e.g. a permanently malformed payload). This mirrors
// convert-room-scan-glb's glb_convert_attempts cap in SPIRIT (bounded retries,
// terminal park) — but per the W0-B brief we do NOT add a new agent_tasks
// column for it. The counter instead rides task.artifacts.dispatch_attempts,
// which complete_agent_task's `artifacts || p_artifacts` merge already writes
// on every failed-outcome call — no schema change required.
export const MAX_DISPATCH_ATTEMPTS = 5;

// ─── Env contract (fail-closed) ─────────────────────────────────────────────

export interface DispatchEnv {
  MODAL_SPAWN_URL: string;
  MODAL_BEARER_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const REQUIRED_ENV_KEYS = [
  "MODAL_SPAWN_URL",
  "MODAL_BEARER_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type EnvCheck =
  | { ok: true; env: DispatchEnv }
  | { ok: false; missing: string[] };

/** Fail-closed env validation: any missing key exits without claiming. */
export function validateEnv(source: Record<string, string | undefined>): EnvCheck {
  const missing = REQUIRED_ENV_KEYS.filter((k) => !source[k] || source[k]!.trim() === "");
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    env: {
      MODAL_SPAWN_URL: source.MODAL_SPAWN_URL!,
      MODAL_BEARER_TOKEN: source.MODAL_BEARER_TOKEN!,
      SUPABASE_URL: source.SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY!,
    },
  };
}

// ─── Billing guard (cheap existence check BEFORE claiming/spawning) ────────

/** Empty eligible-queue check → true means skip WITHOUT calling Modal at all
 *  (mirrors convert-room-scan-glb: an empty queue must never wake the spend). */
export function shouldSkipForNoWork(eligibleCount: number): boolean {
  return eligibleCount <= 0;
}

// ─── Task payload shape (scan_pipeline.ingest's payload convention, 00370:
// {scan_id, room_file_version, user_id} — verify/splat/renders inherit it) ──

export interface ClaimedTaskRow {
  id: string;
  task_type: string;
  payload: Record<string, unknown>;
  artifacts: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
}

export interface TaskInputIds {
  scanId: string;
  roomFileVersion: number;
}

export type TaskInputCheck =
  | { ok: true; ids: TaskInputIds }
  | { ok: false; reason: string };

/** Validates the two fields this dispatcher needs out of an open-set jsonb
 *  payload. Anything else (user_id, future fields) is left alone. */
export function extractTaskInputIds(task: ClaimedTaskRow): TaskInputCheck {
  const scanId = task.payload?.scan_id;
  const roomFileVersion = task.payload?.room_file_version;
  if (typeof scanId !== "string" || scanId.length === 0) {
    return { ok: false, reason: "payload.scan_id missing or not a string" };
  }
  if (typeof roomFileVersion !== "number" || !Number.isFinite(roomFileVersion)) {
    return { ok: false, reason: "payload.room_file_version missing or not a number" };
  }
  return { ok: true, ids: { scanId, roomFileVersion } };
}

// ─── Object-key derivation (mirrors keys.py / convert-room-scan-glb's
// deriveUsdzKey: split on the LAST /room-scans/ marker; a bare key is used
// as-is — both writer shapes, pre- and post-I104-repair, resolve). ─────────

const BUCKET = "room-scans";
const MARKER = `/${BUCKET}/`;

export function objectKeyFromRoomScansUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const idx = url.lastIndexOf(MARKER);
  let key = idx >= 0 ? url.slice(idx + MARKER.length) : url;
  const q = key.indexOf("?");
  if (q >= 0) key = key.slice(0, q);
  key = key.replace(/^\/+/, "");
  return key.length > 0 ? key : null;
}

// ─── Owner-prefix anchoring ────────────────────────────────────────────────
//
// The key above comes out of a COLUMN (`room_scans.mesh_url` /
// `captured_room_json_url`), and this function then presigns it with the
// service role, which bypasses Storage RLS. So whatever that column says, we
// sign. A row whose url column points anywhere else in the bucket would hand
// Modal a presigned read of another tenant's object.
//
// The bucket layout is `<folder>/<user_id>/<room_id>/<filename>` (the same
// layout services/scan-pipeline/src/patina_scan_worker/keys.py anchors on, and
// the 00077 storage RLS guard before it). Segments 2 and 3 must equal the
// SCAN ROW'S OWN user_id and room_id — read from the row we are dispatching
// for, never from the key itself. A row missing either id cannot have its
// prefix proved, so it fails closed rather than being waved through.
export function keyMatchesScanOwner(
  key: string,
  userId: string | null | undefined,
  roomId: string | null | undefined,
): boolean {
  if (typeof userId !== "string" || userId.length === 0) return false;
  if (typeof roomId !== "string" || roomId.length === 0) return false;
  const parts = key.split("/");
  // folder / user_id / room_id / filename — a shorter key has no prefix to prove.
  if (parts.length < 4) return false;
  if (parts[0].length === 0) return false;
  return parts[1] === userId && parts[2] === roomId;
}

/** Fixed literal. The rejected key never enters an error string or a log line
 *  — that string lands in agent_tasks.last_error, which is far more widely
 *  readable than the storage path it would disclose. */
export const KEY_PREFIX_REJECTED = "input object key failed owner-prefix validation";

// ─── Modal dispatch request body ────────────────────────────────────────────

// Each stage gets ITS OWN input shape and nothing else. A single union of
// optional fields would let a renders task be dispatched with splat's photo
// list — the Modal side would happily accept the body and only discover the
// mismatch after allocating a GPU.
export interface VerifyInputs {
  kind: "verify";
  meshUrl: string;
  capturedRoomJsonUrl: string;
}

/** Where splat's camera poses came from.
 *
 *  `manifest` is the uploaded `photos/photos_metadata.ndjson` sidecar.
 *  `rows` is the fallback: `room_scan_images.camera_transform` /
 *  `camera_intrinsics`, inlined in the payload. The fallback is not an edge
 *  case — the ingest stage STRIPS `photosManifest` as device-local
 *  (capture-bundle-spec B-19), so `room_scans.photos_manifest_url` is null for
 *  a large share of real scans and splat would otherwise never run for them.
 *  Both carriers hold the same shapes (row-major flat-16 transform,
 *  `{fx, fy, cx, cy, width, height}` intrinsics in the native sensor frame)
 *  written by the same capture path, so the Modal side's convention handling —
 *  including portrait-rotation detection — is identical either way. */
export type PhotosSource = "manifest" | "rows";

/** One pose-bearing `room_scan_images` row, reduced to what a nerfstudio frame
 *  needs. Inlined in the payload rather than synthesized into an NDJSON blob
 *  and uploaded: a dispatcher that writes storage objects would need write
 *  scope it does not have and should not get, and the blob would be a second
 *  copy of data the table already holds. */
export interface PhotoRecord {
  fileName: string;
  cameraTransform: number[];
  cameraIntrinsics: {
    fx: number;
    fy: number;
    cx: number;
    cy: number;
    width: number;
    height: number;
  };
  width: number;
  height: number;
}

export interface SplatInputs {
  kind: "splat";
  photosSource: PhotosSource;
  /** Present iff photosSource === "manifest". */
  photosManifestUrl?: string;
  /** Present iff photosSource === "rows". Parallel to `photoUrls` by fileName. */
  photoRecords?: PhotoRecord[];
  photoUrls: string[];
  capturedRoomJsonUrl: string;
  /** True when `photoUrls` is a prefix of the scan's photos, not all of them. */
  photoUrlsCapped: boolean;
  /** How many usable photo rows the scan actually has, cap or no cap. */
  photoCount: number;
  /** Dense-frame path (a): a presigned GET for the scan's `keyframes.tar` (the
   *  100-view dense RGB stream, via `room_scans.scan_bundle_url`), present ONLY
   *  when the scan carries one. The Modal side untars it. Paired with
   *  `keyframeIndexUrl`; `config.frameSource` decides whether the job trains on
   *  these or the hero photos. Absent (not null) when the scan has no keyframe
   *  archive, so a scan without one produces the exact body it did before. */
  keyframesArchiveUrl?: string;
  /** Presigned GET for `keyframe_index.ndjson` (per-keyframe pose + intrinsics).
   *  Column-less: its key is derived in the `keyframes/` folder off the scan's
   *  own owner segments. Present iff `keyframesArchiveUrl` is. */
  keyframeIndexUrl?: string;
  /** The task payload's own `config`, passed through UNINSPECTED. See
   *  `extractStageConfig`. Absent when the task carried none. */
  config?: Record<string, unknown>;
}

/** The task payload's `config` object, if it has a usable one.
 *
 *  The dispatcher does not read, validate or default any key inside it. That is
 *  deliberate: `config.maxIterations` is the Modal side's knob, splat_job owns
 *  its policy and its bounds, and a dispatcher that learned the key set would be
 *  a second place to change every time a stage gains a setting — the exact
 *  dual-ownership that put `meshUrl`/`meshPlyUrl` on the wire in W1. What is
 *  checked here is only that the value is a plain object worth forwarding: an
 *  array, a scalar, a null or an empty object all mean "no config", so the
 *  spawn body stays byte-identical to what it was before for every task that
 *  does not set one.
 *
 *  W2-EVIDENCE.md §4 E, §13.6 — the knob was unreachable, and §13.6 measured it
 *  to be a quality control rather than only a cost one. */
export function extractStageConfig(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  const config = payload?.config;
  if (typeof config !== "object" || config === null || Array.isArray(config)) return undefined;
  const entries = config as Record<string, unknown>;
  return Object.keys(entries).length > 0 ? entries : undefined;
}

/** A `room_scan_images` row that carries a usable camera pose. Anything short
 *  of all four numbers plus both extents cannot become a nerfstudio frame, so
 *  the row is dropped rather than guessed at. */
export function isPoseBearing(
  record: Partial<PhotoRecord> | null | undefined,
): record is PhotoRecord {
  if (!record) return false;
  const t = record.cameraTransform;
  if (!Array.isArray(t) || t.length !== 16 || !t.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return false;
  }
  const i = record.cameraIntrinsics;
  if (!i || typeof i !== "object") return false;
  for (const key of ["fx", "fy", "cx", "cy", "width", "height"] as const) {
    const v = (i as Record<string, unknown>)[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }
  return (
    typeof record.width === "number" && Number.isFinite(record.width) && record.width > 0 &&
    typeof record.height === "number" && Number.isFinite(record.height) && record.height > 0 &&
    typeof record.fileName === "string" && record.fileName.length > 0
  );
}

/** `renders` builds its scene from the PARAMETRIC room and merges the GLB on
 *  top, so `capturedRoomJsonUrl` is the required input and `glbUrl` is the
 *  optional one — the reverse of W2's shape. The GLB for a real RoomPlan
 *  capture is floor-only (the USDZ→GLB converter walks `UsdGeom.Mesh` and
 *  RoomPlan writes `UsdGeom.Cube`), so a stage that rendered only the GLB
 *  rendered a bare slab. A scan whose `model_url_gltf` was never stamped now
 *  renders anyway rather than failing input resolution. */
export interface RendersInputs {
  kind: "renders";
  capturedRoomJsonUrl: string;
  glbUrl?: string;
}

export type DispatchInputs = VerifyInputs | SplatInputs | RendersInputs;

export interface DispatchParams {
  taskId: string;
  leaseToken: string;
  scanId: string;
  roomFileId: string;
  roomFileVersion: number;
  taskType: string;
  traceId: string;
  inputs: DispatchInputs;
}

// A room walk can leave hundreds of posed photos. The whole list would be a
// large body on a POST that must return inside Modal's 150 s web cap, and
// splatfacto gains very little past ~80 well-distributed views of one room. So
// the list is capped BY MANIFEST ORDER (display_order, then captured_at) and
// the payload SAYS SO — `photoUrlsCapped` — because a splat trained on a
// truncated set that nobody recorded as truncated is the kind of quiet quality
// regression that gets blamed on the model.
export const PHOTO_URL_CAP = 80;

export interface PhotoCap {
  keys: string[];
  capped: boolean;
  total: number;
}

/** Cap an ordered photo-key list. Pure; the caller has already ordered it. */
export function capPhotoKeys(keys: string[], cap = PHOTO_URL_CAP): PhotoCap {
  return { keys: keys.slice(0, cap), capped: keys.length > cap, total: keys.length };
}

/** The exact minimal POST body sent to MODAL_SPAWN_URL (R1: "the message is
 *  minimal by design" — ids, revision, trace id, presigned inputs only), plus
 *  `leaseToken`: the per-invocation claim owner 00490's wrappers check every
 *  write against. `inputs` is built field-by-field per stage rather than spread
 *  wholesale, so `kind` (a dispatcher-side discriminant, not part of the wire
 *  contract) can never leak into the body. The canonical example of this body —
 *  the one contract both sides' tests validate against — is ./contract.json. */
export function buildModalDispatchBody(p: DispatchParams): Record<string, unknown> {
  let inputs: Record<string, unknown>;
  switch (p.inputs.kind) {
    case "verify":
      inputs = {
        meshUrl: p.inputs.meshUrl,
        capturedRoomJsonUrl: p.inputs.capturedRoomJsonUrl,
      };
      break;
    case "splat": {
      inputs = {
        photosSource: p.inputs.photosSource,
        photoUrls: p.inputs.photoUrls,
        capturedRoomJsonUrl: p.inputs.capturedRoomJsonUrl,
        photoUrlsCapped: p.inputs.photoUrlsCapped,
        photoCount: p.inputs.photoCount,
      };
      // Exactly one pose carrier reaches the wire. Emitting both (or an
      // explicit undefined) would let the Modal side's "manifest wins" branch
      // pick a carrier the dispatcher did not intend.
      if (p.inputs.photosSource === "manifest") {
        inputs.photosManifestUrl = p.inputs.photosManifestUrl;
      } else {
        inputs.photoRecords = p.inputs.photoRecords;
      }
      // Dense-frame path (a): the keyframe archive + index ride alongside the
      // photo carrier when the scan has them; `config.frameSource` (below) tells
      // the Modal side which to train on. Absent (not both, not one) when the
      // scan has no keyframes — the two are signed and emitted together, so a
      // half-present pair can never reach the wire.
      if (p.inputs.keyframesArchiveUrl && p.inputs.keyframeIndexUrl) {
        inputs.keyframesArchiveUrl = p.inputs.keyframesArchiveUrl;
        inputs.keyframeIndexUrl = p.inputs.keyframeIndexUrl;
      }
      // Absent, not null — same rule as `glbUrl`. splat_job reads
      // `inputs.config` for truthiness, and an explicit null on the wire reads
      // as "there is one" to a shape check.
      if (p.inputs.config) inputs.config = p.inputs.config;
      break;
    }
    case "renders":
      inputs = { capturedRoomJsonUrl: p.inputs.capturedRoomJsonUrl };
      // Absent, not null: the Modal side reads `glbUrl` for truthiness, and an
      // explicit null on the wire reads as "there is one" to a shape check.
      if (p.inputs.glbUrl) inputs.glbUrl = p.inputs.glbUrl;
      break;
  }
  return {
    taskId: p.taskId,
    leaseToken: p.leaseToken,
    scanId: p.scanId,
    roomFileId: p.roomFileId,
    roomFileVersion: p.roomFileVersion,
    taskType: p.taskType,
    traceId: p.traceId,
    inputs,
  };
}

// ─── Spawn-response classification + retry/park decision ──────────────────

/** 2xx = spawned (leave the task claimed/leased; Modal's own writeback or lease
 *  expiry per 00378 resolves it from here). Anything else is a dispatch failure. */
export function isSpawnSuccess(httpStatus: number): boolean {
  return httpStatus >= 200 && httpStatus < 300;
}

/** Prior dispatch-failure count, read from the JSONB artifacts field a
 *  previous complete_agent_task(outcome:'failed') call merged in — never a
 *  dedicated column (see MAX_DISPATCH_ATTEMPTS above). */
export function readDispatchAttempts(artifacts: Record<string, unknown> | null | undefined): number {
  const v = artifacts?.dispatch_attempts;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

export interface DispatchFailureDecision {
  dispatchAttempts: number;
  fatal: boolean;
}

/** Given the prior dispatch_attempts count, decide the next count and whether
 *  this failure should be fatal (permanent park) vs. retried through
 *  complete_agent_task's normal backoff (1m/5m/25m, 00378). */
export function decideDispatchFailure(priorDispatchAttempts: number): DispatchFailureDecision {
  const dispatchAttempts = priorDispatchAttempts + 1;
  return { dispatchAttempts, fatal: dispatchAttempts >= MAX_DISPATCH_ATTEMPTS };
}

// ─── Structured allow-list logging ──────────────────────────────────────────
//
// Never log URLs, tokens, or payload/response bodies (DELIVERY-PLAN.md §1 hard
// rail). Each event name has a fixed allow-listed field set; buildLogLine
// drops anything not on the list rather than trusting the caller.

const ALLOWED_LOG_FIELDS: Record<string, readonly string[]> = {
  env_missing: ["missing"],
  no_work: ["eligible"],
  claimed: ["count"],
  task_input_invalid: ["task_id", "reason"],
  // The rejected key is deliberately absent from this allow-list — see
  // KEY_PREFIX_REJECTED. Only the ids that name the row are logged.
  key_prefix_rejected: ["task_id", "scan_id", "task_type"],
  // `photos_source` is a two-value enum, never a key or a url — it is here so
  // "which pose carrier fired" is answerable from the logs without reading the
  // room file, which is the first question when a splat comes out wrong.
  dispatch_spawned: ["task_id", "scan_id", "task_type", "http_status", "photos_source"],
  // A spawn we could not confirm either way: the task stays LEASED and the
  // visibility timeout recovers it. Not a failure, so it has its own event.
  dispatch_deferred: ["task_id", "scan_id", "task_type", "error_kind"],
  dispatch_failed: ["task_id", "scan_id", "task_type", "http_status", "error_kind", "fatal", "dispatch_attempts"],
  // A task completed WITHOUT a spawn because its room file has been superseded.
  // The two versions are integers off the task's own payload, never a key.
  dispatch_superseded: ["task_id", "scan_id", "task_type", "room_file_version", "max_version"],
  // PostgREST's error `code` only — never `message`/`details`, which can echo
  // row content back into the log.
  job_run_insert_failed: ["error_code"],
  run_error: ["error_kind"],
};

export function buildLogLine(
  fn: string,
  event: string,
  fields: Record<string, unknown> = {},
): string {
  const allowed = ALLOWED_LOG_FIELDS[event] ?? [];
  const safe: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields) safe[key] = fields[key];
  }
  return JSON.stringify({ ts: new Date().toISOString(), fn, event, ...safe });
}
