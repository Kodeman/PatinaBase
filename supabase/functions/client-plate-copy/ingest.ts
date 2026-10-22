import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { PlateRequest } from "./lib.ts";

/** Read geometry just before ingest: a requeued request retains its asset_id. */
export async function ingestPlate(
  admin: SupabaseClient,
  worker: { workerUrl: string; secret: string },
  request: PlateRequest,
  sourceUrl: string,
  signal: AbortSignal,
): Promise<Response> {
  let geometry = null;
  if (request.asset_id) {
    const { data, error } = await admin.from("client_plate_assets")
      .select("focal, subject_box")
      .eq("project_id", request.project_id)
      .eq("id", request.asset_id)
      .abortSignal(signal)
      .maybeSingle();
    if (error) throw new Error(`plate geometry lookup failed: ${error.message}`);
    geometry = data;
  }
  return fetch(`${worker.workerUrl}/plates/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${worker.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: request.project_id,
      requestId: request.id,
      sourceKind: request.source_kind,
      sourceUrl,
      focal: geometry?.focal ?? null,
      subjectBox: geometry?.subject_box ?? null,
    }),
    signal,
  });
}
