// client-plate-copy (US-49): copies queued pictures into the private plate
// bucket through the media worker. Invoked by pg_cron through
// dispatch_client_plate_copy() → invoke_edge_function with {job_run_id};
// service role only (verify_jwt = true, then resolveCaller).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/caller.ts";
import {
  type IngestAsset,
  INGEST_TIMEOUT_MS,
  mapPool,
  parseJobRunId,
  type PlateRequest,
  recordPayload,
  resolveSource,
  shortenError,
  SIGNED_URL_TTL_SECONDS,
  summarizeRun,
  validateIngestResponse,
} from "./lib.ts";

const CLAIM_LIMIT = 10;
// Three copies in flight keeps ten 30 s ingests inside the function's wall clock.
const CONCURRENCY = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Admin = SupabaseClient;
interface CopyEnv {
  supabaseUrl: string;
  workerUrl: string;
  secret: string;
}

async function signedUrl(admin: Admin, bucket: string, path: string): Promise<string> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(`signing ${bucket} failed: ${error.message}`);
  return data.signedUrl;
}

async function fetchUrl(admin: Admin, request: PlateRequest, supabaseUrl: string): Promise<string> {
  const source = resolveSource(request, supabaseUrl);
  if (!source) throw new Error(`no fetch address for a ${request.source_kind} source`);
  if (source.kind === "direct") return source.url;
  return await signedUrl(admin, source.bucket, source.path);
}

async function ingest(admin: Admin, request: PlateRequest, env: CopyEnv): Promise<IngestAsset> {
  const sourceUrl = await fetchUrl(admin, request, env.supabaseUrl);
  const response = await fetch(`${env.workerUrl}/plates/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: request.project_id,
      requestId: request.id,
      sourceKind: request.source_kind,
      sourceUrl,
    }),
    signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`ingest ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
  }
  const checked = validateIngestResponse(await response.json().catch(() => null), request.project_id);
  if (!checked.ok) throw new Error(checked.error);
  return checked.asset;
}

async function failRequest(admin: Admin, request: PlateRequest, cause: unknown): Promise<void> {
  const { error } = await admin.rpc("fail_client_plate_request", {
    p_request_id: request.id,
    p_lease_token: request.lease_token,
    p_error: shortenError(cause),
  });
  // A lease that ran out is re-queued by the dispatcher instead.
  if (error) console.error(`client-plate-copy: fail ${request.id}: ${shortenError(error.message)}`);
}

async function copyOne(admin: Admin, request: PlateRequest, env: CopyEnv): Promise<boolean> {
  try {
    const asset = await ingest(admin, request, env);
    const { error } = await admin.rpc("record_client_plate_asset", {
      p_request_id: request.id,
      p_lease_token: request.lease_token,
      p_asset: recordPayload(asset, request),
    });
    if (error) throw new Error(`record failed: ${error.message}`);
    return true;
  } catch (cause) {
    await failRequest(admin, request, cause);
    return false;
  }
}

async function finishRun(admin: Admin, runId: number, status: string, detail: unknown, error: string | null) {
  const { error: finishError } = await admin.rpc("finish_client_plate_copy_run", {
    p_run_id: runId,
    p_status: status,
    p_detail: detail,
    p_error: error,
  });
  if (finishError) console.error(`client-plate-copy: finish ${runId}: ${shortenError(finishError.message)}`);
}

// The cron dispatcher's run, or a manual run opened here.
async function openRun(admin: Admin, body: unknown): Promise<number | null> {
  const given = parseJobRunId(body);
  if (given !== null) return given;
  const { data, error } = await admin.rpc("begin_client_plate_copy_run");
  return !error && typeof data === "number" ? data : null;
}

function workerEnv(): { workerUrl: string; secret: string } | null {
  const workerUrl = (Deno.env.get("MEDIA_WORKER_URL") ?? "").replace(/\/+$/, "");
  const secret = Deno.env.get("PLATE_INGEST_SECRET") ?? "";
  return workerUrl && secret ? { workerUrl, secret } : null;
}

async function copyBatch(admin: Admin, runId: number, supabaseUrl: string): Promise<Response> {
  const worker = workerEnv();
  if (!worker) {
    // Nothing is claimed, so no attempt is spent while the lane is unconfigured.
    await finishRun(admin, runId, "failed", { claimed: 0 }, "MEDIA_WORKER_URL or PLATE_INGEST_SECRET is not set");
    return json({ error: "not_configured", job_run_id: runId }, 500);
  }
  const { data: claimed, error: claimError } = await admin.rpc("claim_client_plate_requests", {
    p_limit: CLAIM_LIMIT,
  });
  if (claimError) {
    await finishRun(admin, runId, "failed", { claimed: 0 }, shortenError(claimError.message));
    return json({ error: "claim_failed", job_run_id: runId }, 500);
  }
  const requests = (claimed ?? []) as PlateRequest[];
  const outcomes = await mapPool(requests, CONCURRENCY, (request) =>
    copyOne(admin, request, { supabaseUrl, ...worker }));
  const recorded = outcomes.filter(Boolean).length;
  const run = summarizeRun({ claimed: requests.length, recorded, failed: requests.length - recorded });
  await finishRun(admin, runId, run.status, run.detail, run.error);
  return json({ job_run_id: runId, ...run.detail });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const caller = await resolveCaller(req, admin);
  if (!caller.service) return json({ error: "forbidden" }, 403);
  const runId = await openRun(admin, await req.json().catch(() => null));
  if (runId === null) return json({ error: "run_not_started" }, 500);
  return await copyBatch(admin, runId, supabaseUrl);
});
