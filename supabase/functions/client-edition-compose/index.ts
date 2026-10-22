// client-edition-compose (US-49): composes homeowner page editions from queued
// edition requests. Invoked by pg_cron through dispatch_client_edition_compose()
// → invoke_edge_function with {job_run_id}; service role only (verify_jwt =
// true, then resolveCaller). Model pictures come from the media worker's plate
// read route (MEDIA_WORKER_URL, PLATE_INGEST_SECRET).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/caller.ts";
import { callClaude, type CallClaudeOptions, createLlmLedger } from "../_shared/claude.ts";
import { parseJobRunId, shortenError } from "../client-plate-copy/lib.ts";
import { type BatchSummary, type Db, privacyPageLive, RUN_BUDGET_MS, runBatch, runStatus, sleepFor } from "./lib.ts";
import { type Media, mediaWorker, noMedia } from "./renditions.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Admin = SupabaseClient;

/** finish_client_edition_compose_run and begin_client_edition_compose_run, at most. */
const RUN_CALL_MS = 5_000;

// Each call's signal aborts its fetch once lib's window for it has passed.
function database(admin: Admin): Db {
  return {
    async rpc(fn, args, signal) {
      const { data, error } = await admin.rpc(fn, args).abortSignal(signal);
      return { data, error };
    },
    async approvedEdition(projectId, signal) {
      const { data, error } = await admin
        .from("client_editions")
        .select("id, source_hash, composition, facts, overrides")
        .eq("project_id", projectId)
        .eq("status", "approved")
        .abortSignal(signal)
        .maybeSingle();
      return { data, error };
    },
    // Every request row in any status (a queued or leased recrop still names
    // the kind its bytes came from), in id order so pages never overlap; the
    // first page counts them all, so a short read cannot pass for a whole one.
    async provenancePage(projectId, assetIds, after, limit, signal) {
      const rows = admin
        .from("client_plate_requests")
        .select("id, asset_id, source_kind", { count: after === null ? "exact" : undefined })
        .eq("project_id", projectId)
        .in("asset_id", assetIds);
      const { data, error, count } = await (after === null ? rows : rows.gt("id", after))
        .order("id")
        .limit(limit)
        .abortSignal(signal);
      return { data: data ? { rows: data, total: count ?? null } : null, error };
    },
    async editionStatus(editionId, signal) {
      const { data, error } = await admin
        .from("client_editions")
        .select("status")
        .eq("id", editionId)
        .abortSignal(signal)
        .maybeSingle();
      return { data: data?.status ?? null, error };
    },
  };
}

/** The caller's window and the call's own timeout: the whole call, SDK retries included, ends by the sooner. */
function callSignal(opts: CallClaudeOptions & { timeoutMs: number }): AbortSignal {
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
}

function media(): Media {
  const url = Deno.env.get("MEDIA_WORKER_URL") ?? "";
  const secret = Deno.env.get("PLATE_INGEST_SECRET") ?? "";
  if (url && secret) return mediaWorker(url, secret);
  console.error("client-edition-compose: MEDIA_WORKER_URL or PLATE_INGEST_SECRET is not set; no pictures are sent");
  return noMedia;
}

async function finishRun(admin: Admin, runId: number, status: string, detail: unknown, error: string | null) {
  const args = { p_run_id: runId, p_status: status, p_detail: detail, p_error: error };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { error: finishError } = await admin
      .rpc("finish_client_edition_compose_run", args)
      .abortSignal(AbortSignal.timeout(RUN_CALL_MS));
    if (!finishError) return;
    if (attempt === 2) console.error(`client-edition-compose: finish run ${runId}: ${shortenError(finishError.message)}`);
  }
}

// The cron dispatcher's run, or a manual run opened here.
async function openRun(admin: Admin, body: unknown): Promise<number | null> {
  const given = parseJobRunId(body);
  if (given !== null) return given;
  const { data, error } = await admin.rpc("begin_client_edition_compose_run").abortSignal(AbortSignal.timeout(RUN_CALL_MS));
  return !error && typeof data === "number" ? data : null;
}

async function composeBatch(admin: Admin, runId: number, deadline: number): Promise<Response> {
  const ledger = createLlmLedger(admin);
  let summary: BatchSummary;
  try {
    summary = await runBatch({
      db: database(admin),
      claude: (opts) => callClaude({ ...opts, ledger, signal: callSignal(opts) }),
      privacyLive: privacyPageLive(),
      media: media(),
      now: Date.now,
      deadline,
      sleep: sleepFor,
    });
  } catch (cause) {
    await finishRun(admin, runId, "failed", { claimed: 0 }, shortenError(cause));
    return json({ error: "claim_failed", job_run_id: runId }, 500);
  }
  const run = runStatus(summary);
  await finishRun(admin, runId, run.status, summary, run.error);
  return json({ job_run_id: runId, ...summary });
}

Deno.serve(async (req) => {
  // One budget for the whole invocation, counted from its arrival.
  const deadline = Date.now() + RUN_BUDGET_MS;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const caller = await resolveCaller(req, admin);
  if (!caller.service) return json({ error: "forbidden" }, 403);
  const runId = await openRun(admin, await req.json().catch(() => null));
  if (runId === null) return json({ error: "run_not_started" }, 500);
  return await composeBatch(admin, runId, deadline);
});
