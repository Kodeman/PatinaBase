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

export const BATCH_LIMIT = 3;
export const SIGNED_URL_TTL_S = 600;
export const WORKER_ID = "dispatch-scan-modal";

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

// ─── Modal dispatch request body ────────────────────────────────────────────

export interface DispatchInputs {
  meshUrl: string;
  capturedRoomJsonUrl: string;
}

export interface DispatchParams {
  taskId: string;
  scanId: string;
  roomFileId: string;
  roomFileVersion: number;
  taskType: string;
  traceId: string;
  inputs: DispatchInputs;
}

/** The exact minimal POST body sent to MODAL_SPAWN_URL (R1: "the message is
 *  minimal by design" — ids, revision, trace id, presigned inputs only). */
export function buildModalDispatchBody(p: DispatchParams): Record<string, unknown> {
  return {
    taskId: p.taskId,
    scanId: p.scanId,
    roomFileId: p.roomFileId,
    roomFileVersion: p.roomFileVersion,
    taskType: p.taskType,
    traceId: p.traceId,
    inputs: {
      meshUrl: p.inputs.meshUrl,
      capturedRoomJsonUrl: p.inputs.capturedRoomJsonUrl,
    },
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
  dispatch_spawned: ["task_id", "scan_id", "task_type", "http_status"],
  dispatch_failed: ["task_id", "scan_id", "task_type", "http_status", "error_kind", "fatal", "dispatch_attempts"],
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
