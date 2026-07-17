// Confirm Scan Bundle Edge Function
// Verifies that every artifact URL recorded on a room_scans row is reachable
// and (when present) that the photos_metadata.ndjson sidecar line count
// matches the room_scan_images row count for the scan. On success, invokes
// the mark_scan_upload_complete RPC which flips status to 'ready'.
//
// Auth: caller JWT is forwarded to PostgREST so RLS + SECURITY INVOKER RPCs
// run as the scan owner. No service-role key is used.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ConfirmRequest {
  // Both iOS apps send snake_case `scan_id`; older callers send `scanId`. Accept
  // either (I80 — every call had 400'd on the scanId-only read since 00082).
  scanId?: string;
  scan_id?: string;
}

// Columns on room_scans that, when non-null, represent an expected uploaded
// artifact. depth_archive_url is optional — validated only if present.
const ARTIFACT_URL_COLUMNS = [
  "model_url",
  "captured_room_json_url",
  "world_map_url",
  "mesh_url",
  "scan_bundle_url",
  "thumbnail_url",
  "hero_frame_url",
  "bundle_manifest_url",
  "photos_manifest_url",
  "coverage_heatmap_url",
] as const;

const SELECT_COLUMNS = [
  "id",
  "user_id",
  ...ARTIFACT_URL_COLUMNS,
  "depth_archive_url",
].join(", ");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ ok: false, error: "missing bearer token" }, 401);
    }

    let body: ConfirmRequest;
    try {
      body = (await req.json()) as ConfirmRequest;
    } catch {
      return jsonResponse({ ok: false, error: "invalid json body" }, 400);
    }
    const scanId = body?.scanId ?? body?.scan_id;
    if (!scanId || typeof scanId !== "string") {
      return jsonResponse({ ok: false, error: "scanId required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // JWT-forwarding client: PostgREST enforces RLS + SECURITY INVOKER RPCs
    // run with auth.uid() = caller.
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // RLS restricts this SELECT to the owner, so a missing row means either
    // the scan id doesn't exist or the caller isn't the owner.
    const { data: scan, error: fetchError } = await supabase
      .from("room_scans")
      .select(SELECT_COLUMNS)
      .eq("id", scanId)
      .single();

    if (fetchError || !scan) {
      return jsonResponse(
        { ok: false, error: "scan not found or not owned by caller" },
        404,
      );
    }

    const scanRow = scan as Record<string, unknown>;

    // Verify every expected artifact exists. A null column is treated as "not
    // yet patched" rather than missing — the uploader fills columns as each PUT
    // completes, and this endpoint only cares about URLs that ARE set.
    const missing: string[] = [];
    const headChecks = await Promise.all(
      ARTIFACT_URL_COLUMNS.map(async (col) => {
        const url = scanRow[col];
        if (typeof url !== "string" || url.length === 0) return null;
        const ok = await headOK(url, authHeader, supabaseUrl, anonKey);
        return ok ? null : col;
      }),
    );
    for (const c of headChecks) if (c) missing.push(c);

    // Optional depth archive — validated only if present.
    const depthUrl = scanRow.depth_archive_url;
    if (typeof depthUrl === "string" && depthUrl.length > 0) {
      if (!(await headOK(depthUrl, authHeader, supabaseUrl, anonKey))) {
        missing.push("depth_archive_url");
      }
    }

    // Photo-count cross-check: compare photos_manifest ndjson lines to
    // room_scan_images rows. Non-fatal — surfaced in the response so the
    // uploader can decide whether to retry missing rows.
    let photosVerified = 0;
    const photosManifest = scanRow.photos_manifest_url;
    if (typeof photosManifest === "string" && photosManifest.length > 0) {
      try {
        const res = await fetch(photosManifest, {
          headers: { Authorization: authHeader },
        });
        if (res.ok) {
          const text = await res.text();
          photosVerified = text
            .split(/\r?\n/)
            .filter((l) => l.trim().length > 0).length;
        }
      } catch {
        // Swallow — manifest fetch failure shows up as photosVerified === 0.
      }
    }

    const { count: imageRows } = await supabase
      .from("room_scan_images")
      .select("id", { count: "exact", head: true })
      .eq("scan_id", scanId);

    const photosRowCount = imageRows ?? 0;

    if (missing.length > 0) {
      return jsonResponse(
        {
          ok: false,
          error: "missing artifacts",
          missingArtifacts: missing,
          photosVerified,
          photosRowCount,
        },
        409,
      );
    }

    // All expected artifacts present — flip the flag via owner-scoped RPC.
    const { error: rpcError } = await supabase.rpc(
      "mark_scan_upload_complete",
      { p_scan_id: scanId },
    );
    if (rpcError) {
      return jsonResponse(
        {
          ok: false,
          error: `mark_scan_upload_complete: ${rpcError.message}`,
        },
        500,
      );
    }

    return jsonResponse({
      ok: true,
      scanId: scanId,
      artifactsVerified: ARTIFACT_URL_COLUMNS.length - missing.length,
      photosVerified,
      photosRowCount,
      photosCountMatches: photosVerified === photosRowCount,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: (err as Error).message ?? "unknown error" },
      500,
    );
  }
});

/**
 * Derive the bucket-relative object key from a stored artifact URL. Mirrors
 * parse-room-scan's objectKeyFromUrl: split on the LAST `/room-scans/`, keep the
 * tail, strip any query string. A value that is already a bare key (no marker)
 * is used as-is.
 */
function objectKeyFromUrl(url: string): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const marker = "/room-scans/";
  const idx = url.lastIndexOf(marker);
  let key = idx >= 0 ? url.slice(idx + marker.length) : url;
  const q = key.indexOf("?");
  if (q >= 0) key = key.slice(0, q);
  key = key.replace(/^\/+/, "");
  return key.length > 0 ? key : null;
}

/**
 * Confirm an artifact object exists AND is readable by the caller.
 *
 * `room-scans` is a PRIVATE bucket, but both iOS apps write PUBLIC-shaped
 * (`/object/public/room-scans/...`) URLs into the artifact columns as mere
 * path-carriers — an ecosystem convention (see
 * packages/supabase/src/hooks/use-room-scans.ts and parse-room-scan's
 * objectKeyFromUrl). A raw HEAD against that public path 400s "Bucket not found"
 * for a private bucket, so every artifact would read as missing and the function
 * would 409 even when all objects are present.
 *
 * Instead we derive the bucket key and probe the RLS-gated info endpoint
 * (`/object/info/authenticated/...`) with the caller's JWT + apikey, so RLS runs
 * as the caller. It returns 200 only when the object exists AND the caller may
 * read it — keeping the verdict honest: a truly-missing (or unauthorized) object
 * still fails, so the 409 semantics are unchanged.
 */
async function headOK(
  url: string,
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
): Promise<boolean> {
  const key = objectKeyFromUrl(url);
  if (!key) return false;
  try {
    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/info/authenticated/room-scans/${key}`,
      { headers: { Authorization: authHeader, apikey: anonKey } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
