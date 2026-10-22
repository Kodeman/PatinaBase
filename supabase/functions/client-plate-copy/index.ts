/// <reference lib="deno.ns" />
// client-plate-copy (US-49): copies queued pictures into the private plate
// bucket through the media worker. Invoked by pg_cron through
// dispatch_client_plate_copy() → invoke_edge_function with {job_run_id};
// service role only (verify_jwt = true, then resolveCaller).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/caller.ts";
import { ingestPlate, type PlateFraming, recordPlate } from "./ingest.ts";
import {
  bounded,
  copyRun,
  type CopySteps,
  finishRun,
  parseJobRunId,
  type PlateRequest,
  RUN_HARD_END_MS,
  RunDeadline,
  SIGNED_URL_TTL_SECONDS,
  type SourceAuthority,
  systemClock,
} from "./lib.ts";

const CLAIM_LIMIT = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Admin = SupabaseClient;
interface WorkerEnv {
  workerUrl: string;
  secret: string;
}

// Every request this client makes is cut off at the run's hard end, signing
// included (createSignedUrl takes no signal of its own). No auth refresh
// timer: one client is made per signed source, and a warm isolate would
// otherwise keep one never-stopped interval per sign.
function adminClient(supabaseUrl: string, hardEnd: AbortSignal): Admin {
  return createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, hardEnd]) : hardEnd }),
    },
  });
}

function sourceAuthority(admin: Admin, supabaseUrl: string): SourceAuthority {
  return {
    async owned(request, signal) {
      let call = admin.rpc("client_plate_source_owned", {
        p_project_id: request.project_id,
        p_table: request.source_ref?.table ?? null,
        p_id: request.source_ref?.id ?? null,
        p_source_url: request.source_url,
      });
      if (signal) call = call.abortSignal(signal);
      const { data, error } = await call;
      if (error) throw new Error(`ownership check failed: ${error.message}`);
      return data === true;
    },
    async sign(bucket, path, signal) {
      // Storage exposes no per-call signal, so bind this signer client's fetch
      // to the address step, not just the run's later hard end.
      const signer = signal ? adminClient(supabaseUrl, signal) : admin;
      const { data, error } = await signer.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) throw new Error(`signing ${bucket} failed: ${error.message}`);
      return data.signedUrl;
    },
  };
}

function finishStep(admin: Admin, runId: number): CopySteps["finish"] {
  return async (summary, signal) => {
    const { error } = await admin.rpc("finish_client_plate_copy_run", {
      p_run_id: runId,
      p_status: summary.status,
      p_detail: summary.detail,
      p_error: summary.error,
    }).abortSignal(signal);
    if (error) throw new Error(`${runId}: ${error.message}`);
  };
}

function copySteps(admin: Admin, runId: number, worker: WorkerEnv, supabaseUrl: string): CopySteps {
  const framings = new WeakMap<PlateRequest, PlateFraming>();
  return {
    async claim(signal) {
      const { data, error } = await admin.rpc("claim_client_plate_requests", { p_limit: 1 }).abortSignal(signal);
      if (error) throw new Error(error.message);
      return ((data ?? []) as PlateRequest[])[0] ?? null;
    },
    authority: sourceAuthority(admin, supabaseUrl),
    async ingest(request, sourceUrl, signal) {
      const { response, framing } = await ingestPlate(admin, worker, request, sourceUrl, signal);
      framings.set(request, framing);
      return response;
    },
    record: (request, asset, signal) =>
      recordPlate(admin, request, asset, framings.get(request) ?? null, signal),
    async fail(request, cause, signal) {
      const { error } = await admin.rpc("fail_client_plate_request", {
        p_request_id: request.id,
        p_lease_token: request.lease_token,
        p_error: cause,
      }).abortSignal(signal);
      if (error) throw new Error(error.message);
    },
    finish: finishStep(admin, runId),
  };
}

// The cron dispatcher's run, or a manual run opened here.
async function openRun(admin: Admin, body: unknown): Promise<number | null> {
  const given = parseJobRunId(body);
  if (given !== null) return given;
  const { data, error } = await admin.rpc("begin_client_plate_copy_run");
  return !error && typeof data === "number" ? data : null;
}

function workerEnv(): WorkerEnv | null {
  const workerUrl = (Deno.env.get("MEDIA_WORKER_URL") ?? "").replace(/\/+$/, "");
  const secret = Deno.env.get("PLATE_INGEST_SECRET") ?? "";
  return workerUrl && secret ? { workerUrl, secret } : null;
}

async function copyBatch(admin: Admin, run: RunDeadline, runId: number, supabaseUrl: string): Promise<Response> {
  const worker = workerEnv();
  if (!worker) {
    // Nothing is claimed, so no attempt is spent while the lane is unconfigured.
    await finishRun({ finish: finishStep(admin, runId) }, run, {
      status: "failed",
      detail: { claimed: 0, recorded: 0, failed: 0 },
      error: "MEDIA_WORKER_URL or PLATE_INGEST_SECRET is not set",
    });
    return json({ error: "not_configured", job_run_id: runId }, 500);
  }
  const { summary, claimError } = await copyRun(copySteps(admin, runId, worker, supabaseUrl), run, supabaseUrl, CLAIM_LIMIT);
  if (claimError !== null) return json({ error: "claim_failed", job_run_id: runId }, 500);
  return json({ job_run_id: runId, ...summary.detail });
}

Deno.serve(async (req) => {
  // The run's deadline counts from here.
  const run = new RunDeadline(systemClock);
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const hardEnd = run.by(RUN_HARD_END_MS);
    const admin = adminClient(supabaseUrl, hardEnd);
    const caller = await resolveCaller(req, admin);
    if (!caller.service) return json({ error: "forbidden" }, 403);
    let body: unknown;
    try {
      body = await bounded(hardEnd, (signal) =>
        new Response(req.body?.pipeThrough(new TransformStream(), { signal })).json().catch(() => null));
    } catch {
      return json({ error: "request_body_timeout" }, 408);
    }
    const runId = await openRun(admin, body);
    if (runId === null) return json({ error: "run_not_started" }, 500);
    return await copyBatch(admin, run, runId, supabaseUrl);
  } finally {
    run.close();
  }
});
