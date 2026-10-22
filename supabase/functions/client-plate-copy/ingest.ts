import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type IngestAsset, type PlateRequest, recordPayload } from "./lib.ts";

export interface PlateFraming {
  focal: number[] | null;
  subjectBox: number[] | null;
}

/** Read geometry just before ingest: a requeued request retains its asset_id. */
export async function ingestPlate(
  admin: SupabaseClient,
  worker: { workerUrl: string; secret: string },
  request: PlateRequest,
  sourceUrl: string,
  signal: AbortSignal,
): Promise<{ response: Response; framing: PlateFraming }> {
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
  const framing: PlateFraming = { focal: geometry?.focal ?? null, subjectBox: geometry?.subject_box ?? null };
  const response = await fetch(`${worker.workerUrl}/plates/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${worker.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: request.project_id,
      requestId: request.id,
      sourceKind: request.source_kind,
      sourceUrl,
      ...framing,
    }),
    signal,
  });
  return { response, framing };
}

/** Settle with the framing sent to ingest, never a second geometry lookup. */
export async function recordPlate(
  admin: SupabaseClient,
  request: PlateRequest,
  asset: IngestAsset,
  framing: PlateFraming | null,
  signal: AbortSignal,
): Promise<void> {
  const { error } = await admin.rpc("record_client_plate_asset", {
    p_request_id: request.id,
    p_lease_token: request.lease_token,
    p_asset: recordPayload(asset, request),
    p_framing: framing,
  }).abortSignal(signal);
  if (error) throw new Error(`record failed: ${error.message}`);
}
