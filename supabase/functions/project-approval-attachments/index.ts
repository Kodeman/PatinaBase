// Supabase Edge Function: project-approval-attachments (NI-06, story US-11)
//
// Contract of record: CONTRACT-C revision 4 §C.3.1 (immutable edition copies), §C.3.2
// (signing) and the NI-06 line of §C.9; the database half is 00670.
//
//   POST {decisionId}  verify_jwt on. get_project_decision_edition runs with the
//     CALLER's JWT; only `ok` continues. Unrecorded attachments are materialized
//     (staged copy → hash → move to the attempt's own path → first-writer-wins record);
//     then the recorded paths are signed for 300 s. Answers:
//       200 {urls: [{attachmentId, signedUrl, sizeBytes}], expiresInSeconds: 300}
//       202 {status: "materializing", ready, total, retryAfterSeconds}
//       404 {error: <revoked | not_found | unauthorized>}   (no storage work)
//       409 {error: "media_integrity_failed"}               (staged bytes ≠ frozen sha256)
//       503 {error: "edition_unavailable"}                  (RPC error / undecodable answer)
//       503 {error: "media_unavailable"}                    (any object missing or unsigned)
//   POST {mode: "sweep"}  the hourly pg_cron job (00670 §7, invoke_edge_function):
//     removes `_staging/` objects and unrecorded final objects older than 24 h. Only the
//     platform service-role principal may run it (isServiceRoleCaller: never a bare
//     string compare of the bearer). One job_runs row per sweep.
//
// Never returns a storage path; the sign path never downloads bytes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isServiceRoleCaller } from "../client-invite/lib.ts";
import { handleDecisionRequest, parseRequest, sweepAll } from "./lib.ts";
import { buildPort } from "./port.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
const PORT_CONFIG = {
  url: SUPABASE_URL,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
};
const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
})();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function runSweep(authorization: string): Promise<Response> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: runRow, error: runRowError } = await admin
    .from("job_runs")
    .insert({ job_name: "project-approval-editions-sweep", status: "running" })
    .select("id")
    .single();
  if (runRowError) {
    console.error("project-approval-attachments: failed to open job_runs row", runRowError);
  }
  const runId = runRow?.id as number | undefined;
  try {
    const result = await sweepAll(buildPort(PORT_CONFIG, authorization));
    if (runId != null) {
      await admin.from("job_runs").update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        detail: result,
      }).eq("id", runId);
    }
    return json(result);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("project-approval-attachments: sweep failed", detail);
    if (runId != null) {
      await admin.from("job_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: detail,
      }).eq("id", runId);
    }
    return json({ error: "sweep_failed" }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "unauthorized" }, 401);
  const request = parseRequest(await req.json().catch(() => null));
  if (!request) return json({ error: "invalid_body" }, 400);

  if (request.kind === "sweep") {
    if (
      !isServiceRoleCaller(
        authorization,
        SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_SECRET_KEYS,
        PROJECT_REF,
      )
    ) {
      return json({ error: "forbidden" }, 403);
    }
    return await runSweep(authorization);
  }

  try {
    const result = await handleDecisionRequest(
      buildPort(PORT_CONFIG, authorization),
      request.decisionId,
    );
    return json(result.body, result.status);
  } catch (error) {
    console.error("project-approval-attachments: request failed", error);
    return json({ error: "media_unavailable" }, 503);
  }
});
