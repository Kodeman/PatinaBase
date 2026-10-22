// client-edition-compose (US-49): composes homeowner page editions from queued
// edition requests. Invoked by pg_cron through dispatch_client_edition_compose()
// → invoke_edge_function with {job_run_id}; service role only (verify_jwt =
// true, then resolveCaller).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/caller.ts";
import { callClaude, createLlmLedger } from "../_shared/claude.ts";
import { parseJobRunId, shortenError, SIGNED_URL_TTL_SECONDS } from "../client-plate-copy/lib.ts";
import { type BatchSummary, type Db, privacyPageLive, runBatch, runStatus } from "./lib.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Admin = SupabaseClient;

function database(admin: Admin): Db {
  return {
    async rpc(fn, args) {
      const { data, error } = await admin.rpc(fn, args);
      return { data, error };
    },
    async approvedEdition(projectId) {
      const { data, error } = await admin
        .from("client_editions")
        .select("id, source_hash, composition, facts")
        .eq("project_id", projectId)
        .eq("status", "approved")
        .maybeSingle();
      return { data, error };
    },
    async plateSources(projectId, assetIds) {
      const { data, error } = await admin
        .from("client_plate_requests")
        .select("project_id, source_kind, source_ref, source_url, asset_id")
        .eq("project_id", projectId)
        .eq("status", "done")
        .in("asset_id", assetIds);
      return { data, error };
    },
    async sign(bucket, path) {
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) throw new Error(`signing ${bucket} failed: ${error.message}`);
      return data.signedUrl;
    },
  };
}

async function finishRun(admin: Admin, runId: number, status: string, detail: unknown, error: string | null) {
  const { error: finishError } = await admin.rpc("finish_client_edition_compose_run", {
    p_run_id: runId,
    p_status: status,
    p_detail: detail,
    p_error: error,
  });
  if (finishError) console.error(`client-edition-compose: finish run ${runId}: ${shortenError(finishError.message)}`);
}

// The cron dispatcher's run, or a manual run opened here.
async function openRun(admin: Admin, body: unknown): Promise<number | null> {
  const given = parseJobRunId(body);
  if (given !== null) return given;
  const { data, error } = await admin.rpc("begin_client_edition_compose_run");
  return !error && typeof data === "number" ? data : null;
}

async function composeBatch(admin: Admin, runId: number, supabaseUrl: string): Promise<Response> {
  const ledger = createLlmLedger(admin);
  let summary: BatchSummary;
  try {
    summary = await runBatch({
      db: database(admin),
      claude: (opts) => callClaude({ ...opts, ledger }),
      privacyLive: privacyPageLive(),
      supabaseUrl,
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
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const caller = await resolveCaller(req, admin);
  if (!caller.service) return json({ error: "forbidden" }, 403);
  const runId = await openRun(admin, await req.json().catch(() => null));
  if (runId === null) return json({ error: "run_not_started" }, 500);
  return await composeBatch(admin, runId, supabaseUrl);
});
