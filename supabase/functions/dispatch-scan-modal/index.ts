// dispatch-scan-modal · index.ts — the shell (IO).
//
// Rendered Room v2, wave W0-B (docs/architecture/CAD Generation Pipeline/
// DELIVERY-PLAN.md §2 R1/R3). A billing-guarded edge function, swept by
// pg_cron every 5 minutes (00491), that claims scan_pipeline.verify|splat|
// renders tasks off the existing agent_tasks queue (00297) and spawns each on
// Modal. Pure decision logic lives in ./lib.ts; this file does auth, the DB
// reads/RPCs, the presigned-URL minting, and the outbound POST.
//
// Nothing enqueues scan_pipeline.verify|splat|renders yet — W1 wires the
// enqueue side. Until then the billing guard's cheap existence check finds
// zero eligible rows on every tick and this function no-ops before touching
// Modal, the claim RPC, or Storage — cheap and safe to deploy today.
//
// Invocation: pg_cron -> public.invoke_edge_function('dispatch-scan-modal','{}')
// (service-role Bearer, the standard cron->edge bridge — 00258/00338/00340
// idiom). verify_jwt = true (platform default; config.toml). The function
// additionally decodes the bearer and REQUIRES role == 'service_role' — no
// browser calls this, ever.
//
// R2: completion/progress writes happen over direct Postgres by Modal itself,
// using a scan-worker-scoped role — never service_role in Modal, and this
// function never hands Modal a Supabase credential of any kind. It hands
// Modal exactly two short-lived presigned Storage GET URLs per task.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (runtime-injected),
//      MODAL_SPAWN_URL, MODAL_BEARER_TOKEN.

// The 00337/00341 objects aren't in the checked-in generated types, and this
// function reaches into agent_tasks/room_scans/room_files with ad-hoc selects
// — same posture as parse-room-scan / morning-brief.
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  BATCH_LIMIT,
  buildLogLine,
  buildModalDispatchBody,
  DISPATCH_TASK_TYPES,
  decideDispatchFailure,
  extractTaskInputIds,
  isSpawnSuccess,
  KEY_PREFIX_REJECTED,
  keyMatchesScanOwner,
  newLeaseOwner,
  objectKeyFromRoomScansUrl,
  readDispatchAttempts,
  shouldSkipForNoWork,
  SIGNED_URL_TTL_S,
  validateEnv,
  type ClaimedTaskRow,
} from "./lib.ts";

const FN = "dispatch-scan-modal";
const BUCKET = "room-scans";

// Bounds the outbound spawn POST. A hung Modal edge would otherwise hold the
// whole batch until the function's own wall clock ran out.
const SPAWN_TIMEOUT_MS = 10_000;

/** Thrown when an input key fails owner-prefix anchoring. Distinct from an
 *  ordinary input-resolution failure because it is never retryable: the row's
 *  url column is wrong, and it will still be wrong on the next tick. */
class KeyPrefixError extends Error {
  constructor() {
    super(KEY_PREFIX_REJECTED);
    this.name = "KeyPrefixError";
  }
}

type Supa = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(buildLogLine(FN, event, fields));
}

/** Decode (without verifying — the gateway's verify_jwt already did) the role
 *  claim from the Bearer token (parse-room-scan / convert-room-scan-glb idiom). */
function decodeBearerRole(authHeader: string | null): string | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  const parts = authHeader.slice(7).split(".");
  if (parts.length !== 3) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return (JSON.parse(atob(padded)) as { role?: string }).role;
  } catch {
    return undefined;
  }
}

interface RoomScanRow {
  id: string;
  user_id: string | null;
  room_id: string | null;
  mesh_url: string | null;
  captured_room_json_url: string | null;
}

interface RoomFileRow {
  id: string;
}

/** Resolve the two presigned input URLs a Modal stage needs for one task.
 *  Throws with a short, safe (no-URL, no-body) reason on any failure. */
async function resolveDispatchInputs(
  admin: Supa,
  scanId: string,
  roomFileVersion: number,
): Promise<{ roomFileId: string; meshUrl: string; capturedRoomJsonUrl: string }> {
  const { data: scan, error: scanErr } = await admin
    .from("room_scans")
    .select("id, user_id, room_id, mesh_url, captured_room_json_url")
    .eq("id", scanId)
    .maybeSingle();
  if (scanErr) throw new Error("room_scans lookup failed");
  const scanRow = scan as RoomScanRow | null;
  if (!scanRow) throw new Error("room_scans row not found");

  const meshKey = objectKeyFromRoomScansUrl(scanRow.mesh_url);
  const capturedRoomKey = objectKeyFromRoomScansUrl(scanRow.captured_room_json_url);
  if (!meshKey || !capturedRoomKey) throw new Error("missing mesh or captured_room input key");

  // Owner-prefix anchoring, BEFORE anything is presigned. createSignedUrl runs
  // with service_role and bypasses storage RLS, so this is the only thing
  // standing between a mis-pointed url column and a cross-tenant presigned read.
  if (
    !keyMatchesScanOwner(meshKey, scanRow.user_id, scanRow.room_id) ||
    !keyMatchesScanOwner(capturedRoomKey, scanRow.user_id, scanRow.room_id)
  ) {
    throw new KeyPrefixError();
  }

  const { data: roomFile, error: rfErr } = await admin
    .from("room_files")
    .select("id")
    .eq("scan_id", scanId)
    .eq("version", roomFileVersion)
    .maybeSingle();
  if (rfErr) throw new Error("room_files lookup failed");
  const roomFileRow = roomFile as RoomFileRow | null;
  if (!roomFileRow) throw new Error("room_files row not found for scan/version");

  const [meshSigned, capturedRoomSigned] = await Promise.all([
    admin.storage.from(BUCKET).createSignedUrl(meshKey, SIGNED_URL_TTL_S),
    admin.storage.from(BUCKET).createSignedUrl(capturedRoomKey, SIGNED_URL_TTL_S),
  ]);
  if (meshSigned.error || !meshSigned.data?.signedUrl) {
    throw new Error("createSignedUrl failed for mesh input");
  }
  if (capturedRoomSigned.error || !capturedRoomSigned.data?.signedUrl) {
    throw new Error("createSignedUrl failed for captured_room input");
  }

  return {
    roomFileId: roomFileRow.id,
    meshUrl: meshSigned.data.signedUrl,
    capturedRoomJsonUrl: capturedRoomSigned.data.signedUrl,
  };
}

/** Report a dispatch failure through the existing lease/backoff RPC (00378) —
 *  never a bespoke retry column. dispatch_attempts rides task.artifacts. */
async function failDispatch(
  admin: Supa,
  task: ClaimedTaskRow,
  reasonForCaller: string,
  leaseOwner: string,
  forceFatal = false,
): Promise<{ dispatchAttempts: number; fatal: boolean }> {
  const prior = readDispatchAttempts(task.artifacts);
  const decided = decideDispatchFailure(prior);
  const dispatchAttempts = decided.dispatchAttempts;
  const fatal = forceFatal || decided.fatal;
  const { error } = await admin.rpc("complete_agent_task", {
    p_id: task.id,
    p_outcome: "failed",
    p_artifacts: { dispatch_attempts: dispatchAttempts },
    p_error: reasonForCaller,
    p_fatal: fatal,
    p_actor: leaseOwner,
  });
  if (error) {
    // Nothing more we can do — the lease will eventually expire (00378) and a
    // later claim will retry. Log and move on rather than throwing out of the
    // batch loop.
    log("run_error", { error_kind: "complete_agent_task_failed" });
  }
  return { dispatchAttempts, fatal };
}

async function dispatchOne(
  admin: Supa,
  env: { MODAL_SPAWN_URL: string; MODAL_BEARER_TOKEN: string },
  task: ClaimedTaskRow,
  leaseOwner: string,
): Promise<"spawned" | "failed" | "deferred"> {
  const idCheck = extractTaskInputIds(task);
  if (!idCheck.ok) {
    log("task_input_invalid", { task_id: task.id, reason: idCheck.reason });
    await failDispatch(admin, task, `invalid_payload: ${idCheck.reason}`, leaseOwner);
    return "failed";
  }
  const { scanId, roomFileVersion } = idCheck.ids;

  let inputs: { roomFileId: string; meshUrl: string; capturedRoomJsonUrl: string };
  try {
    inputs = await resolveDispatchInputs(admin, scanId, roomFileVersion);
  } catch (err) {
    // An owner-prefix rejection is terminal, not a retry candidate: the row's
    // url column points outside this scan's own prefix, and no number of
    // retries changes that. Park it fatally, and say nothing about the key.
    if (err instanceof KeyPrefixError) {
      log("key_prefix_rejected", {
        task_id: task.id,
        scan_id: scanId,
        task_type: task.task_type,
      });
      await failDispatch(admin, task, KEY_PREFIX_REJECTED, leaseOwner, true);
      return "failed";
    }
    const reason = err instanceof Error ? err.message : "input_resolution_failed";
    const { dispatchAttempts, fatal } = await failDispatch(admin, task, reason, leaseOwner);
    log("dispatch_failed", {
      task_id: task.id,
      scan_id: scanId,
      task_type: task.task_type,
      http_status: null,
      error_kind: "input_resolution_failed",
      fatal,
      dispatch_attempts: dispatchAttempts,
    });
    return "failed";
  }

  const traceId = crypto.randomUUID();
  const body = buildModalDispatchBody({
    taskId: task.id,
    leaseToken: leaseOwner,
    scanId,
    roomFileId: inputs.roomFileId,
    roomFileVersion,
    taskType: task.task_type,
    traceId,
    inputs: { meshUrl: inputs.meshUrl, capturedRoomJsonUrl: inputs.capturedRoomJsonUrl },
  });

  let httpStatus: number | null = null;
  try {
    const res = await fetch(env.MODAL_SPAWN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.MODAL_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SPAWN_TIMEOUT_MS),
    });
    httpStatus = res.status;
    // Drain the body without ever logging it — never trust a 3rd-party
    // response as something safe to print.
    await res.text().catch(() => undefined);
  } catch {
    httpStatus = null; // network error, or the spawn timeout above
  }

  if (httpStatus !== null && isSpawnSuccess(httpStatus)) {
    // 2xx = spawned. Leave the task claimed/leased — Modal's own writeback
    // (R2, scan_worker role) completes it, or lease expiry (00378) recovers a
    // dead spawn. We do NOT call complete_agent_task here.
    log("dispatch_spawned", {
      task_id: task.id,
      scan_id: scanId,
      task_type: task.task_type,
      http_status: httpStatus,
    });
    return "spawned";
  }

  if (httpStatus === null) {
    // We never got a response, so we do NOT know whether Modal accepted the
    // spawn. Failing here would requeue a task that may already be running,
    // and the next tick would spawn a SECOND GPU job for it. Leave the task
    // leased instead: either the spawn landed and writes back normally, or it
    // didn't and the visibility timeout (00378) releases the task for a clean
    // retry. If a job from the lost spawn does surface later, its leaseToken
    // no longer matches locked_by and 00490 refuses its writes with P0403.
    log("dispatch_deferred", {
      task_id: task.id,
      scan_id: scanId,
      task_type: task.task_type,
      error_kind: "network_error",
    });
    return "deferred";
  }

  // A received non-2xx IS an answer: Modal declined. That is the only path
  // that consumes an attempt.
  const { dispatchAttempts, fatal } = await failDispatch(
    admin,
    task,
    `modal spawn returned ${httpStatus}`,
    leaseOwner,
  );
  log("dispatch_failed", {
    task_id: task.id,
    scan_id: scanId,
    task_type: task.task_type,
    http_status: httpStatus,
    error_kind: "non_2xx",
    fatal,
    dispatch_attempts: dispatchAttempts,
  });
  return "failed";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Require a service_role caller — no browser/user path exists (parse-room-scan idiom).
  if (decodeBearerRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "service_role required" }, 403);
  }

  const envCheck = validateEnv({
    MODAL_SPAWN_URL: Deno.env.get("MODAL_SPAWN_URL"),
    MODAL_BEARER_TOKEN: Deno.env.get("MODAL_BEARER_TOKEN"),
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  });

  // Fail-closed: any missing env exits WITHOUT claiming anything. It also
  // leaves a job_runs row — a misconfigured dispatcher that returned 200 and
  // wrote nothing was indistinguishable from a healthy idle one in the run
  // history, which is exactly the shape of outage nobody notices. (`no_work`
  // stays silent by contract: an empty queue is the normal case and would bury
  // the ledger under one row every five minutes.)
  if (!envCheck.ok) {
    log("env_missing", { missing: envCheck.missing });
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && serviceKey) {
      const nowIso = new Date().toISOString();
      const { error: skipErr } = await createClient(url, serviceKey)
        .from("job_runs")
        .insert({
          job_name: FN,
          status: "skipped",
          started_at: nowIso,
          finished_at: nowIso,
          detail: { skipped: "env_missing", missing: envCheck.missing },
        });
      if (skipErr) {
        log("job_run_insert_failed", { error_code: (skipErr as { code?: string }).code ?? null });
      }
    }
    return json({ skipped: "env_missing", claimed: 0, spawned: 0, failed: 0 }, 200);
  }
  const env = envCheck.env;

  const admin: Supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── billing guard: cheap existence check BEFORE claiming/spawning anything.
  // No eligible row = zero outbound HTTP to Modal, zero claim writes.
  const { data: pending, error: pendingErr } = await admin
    .from("agent_tasks")
    .select("id")
    .in("task_type", DISPATCH_TASK_TYPES)
    .eq("status", "queued")
    .lte("run_after", new Date().toISOString())
    .limit(1);

  if (pendingErr) {
    // Fail OPEN on the check itself (convert-room-scan-glb idiom) — an
    // unreadable table is not proof there's no work. Fall through to claim;
    // an empty claim is harmless.
    log("run_error", { error_kind: "work_check_failed" });
  } else if (shouldSkipForNoWork(pending?.length ?? 0)) {
    log("no_work", { eligible: 0 });
    return json({ skipped: "no_work", claimed: 0, spawned: 0, failed: 0 }, 200);
  }

  const startedAt = new Date().toISOString();
  const { data: runRow, error: runErr } = await admin
    .from("job_runs")
    .insert({ job_name: FN, status: "running", started_at: startedAt })
    .select("id")
    .single();
  if (runErr) {
    log("job_run_insert_failed", { error_code: (runErr as { code?: string }).code ?? null });
  }
  const runId = (runRow as { id: number | string } | null)?.id ?? null;

  // One lease owner per INVOCATION: claim_agent_tasks writes it to locked_by,
  // Modal receives it as leaseToken, and 00490's wrappers refuse any write
  // whose token no longer matches. A later tick mints a different one, so a
  // stale Modal job cannot fail or complete work this tick's tasks.
  const leaseOwner = newLeaseOwner();

  let claimed: ClaimedTaskRow[] = [];
  let spawned = 0;
  let failed = 0;
  let deferred = 0;
  let errorText: string | null = null;

  try {
    const { data: claimedRows, error: claimErr } = await admin.rpc("claim_agent_tasks", {
      p_task_types: DISPATCH_TASK_TYPES,
      p_batch: BATCH_LIMIT,
      p_worker: leaseOwner,
      p_visibility_timeout: "30 minutes", // covers splat's 10-25min Modal run; 00378 reclaims a dead spawn past this
    });
    if (claimErr) throw new Error(`claim_agent_tasks: ${claimErr.message}`);
    claimed = (claimedRows ?? []) as ClaimedTaskRow[];
    log("claimed", { count: claimed.length });

    for (const task of claimed) {
      const outcome = await dispatchOne(admin, env, task, leaseOwner);
      if (outcome === "spawned") spawned++;
      else if (outcome === "deferred") deferred++;
      else failed++;
    }
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    log("run_error", { error_kind: "batch_failed" });
  }

  if (runId != null) {
    await admin
      .from("job_runs")
      .update({
        status: errorText ? "failed" : "succeeded",
        finished_at: new Date().toISOString(),
        detail: { claimed: claimed.length, spawned, failed, deferred },
        error: errorText,
      })
      .eq("id", runId);
  }

  return json(
    { claimed: claimed.length, spawned, failed, deferred, error: errorText },
    errorText ? 500 : 200,
  );
});
