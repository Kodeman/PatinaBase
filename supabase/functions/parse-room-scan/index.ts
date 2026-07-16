// parse-room-scan · index.ts — the shell (IO).
//
// Turns a CapturedRoom export stored in the `room-scans` bucket into normalized
// geometry rows via public.replace_room_scan_geometry (00337). Pure parsing
// lives in ./lib.ts; this file does auth, storage IO, idempotency, and the
// job_runs bookkeeping.
//
// Invocation (verify_jwt = true — see config.toml):
//   • pg_cron → public.invoke_edge_function('parse-room-scan', '{}')  → SWEEP
//     (POSTs apikey + service-role Bearer; the cron schedule itself is authored
//      by a sibling task in migration 00338, not here).
//   • server-to-server service-role call with {scanId, force?}         → TARGETED
//
// The gateway verifies the JWT signature; this function additionally decodes it
// and REQUIRES role == 'service_role' — a normal authenticated user must never
// be able to drive a fleet re-parse, and no browser calls this.

// The 00337 objects (room_scan_geometry table, its embed, and the two write
// RPCs) are not in the checked-in generated types yet, so the strict supabase-js
// generics would reject every call against them. Same posture as morning-brief.
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { objectKeyFromUrl, parseCapturedRoom, PARSER_VERSION } from "./lib.ts";

// Loose client alias — see the pragma above.
type Supa = any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "room-scans";
const SWEEP_LIMIT = 10;
const MAX_PARSE_ATTEMPTS = 5;

interface ProcessedResult {
  scanId: string;
  status: "parsed" | "skipped" | "error";
  elements?: number;
  warnings?: string[];
  error?: string;
}

Deno.serve(async (req: Request) => {
  // ── auth: gateway already verified the JWT; require role=service_role ──────
  const role = decodeJwtRole(req.headers.get("Authorization"));
  if (role !== "service_role") {
    return json({ ok: false, error: "forbidden: service_role required" }, 403);
  }

  const supabase: Supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // parse body (empty / non-JSON body = sweep)
  let body: { scanId?: string; force?: boolean } = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    body = {};
  }
  const targetedId = typeof body.scanId === "string" ? body.scanId : null;
  const force = body.force === true;

  // ── open the job_runs row (00300 idiom; service-role client bypasses RLS) ──
  const { data: runRow } = await supabase
    .from("job_runs")
    .insert({ job_name: "parse-room-scan", status: "running" })
    .select("id")
    .single();
  const runId = runRow?.id as number | undefined;

  const processed: ProcessedResult[] = [];

  try {
    const scans = targetedId
      ? await selectTargeted(supabase, targetedId)
      : await selectSweepCandidates(supabase);

    for (const scan of scans) {
      processed.push(await processScan(supabase, scan, force));
    }

    const detail = {
      mode: targetedId ? "targeted" : "sweep",
      candidates: scans.length,
      parsed: processed.filter((p) => p.status === "parsed").length,
      skipped: processed.filter((p) => p.status === "skipped").length,
      errored: processed.filter((p) => p.status === "error").length,
    };

    if (runId != null) {
      await supabase
        .from("job_runs")
        .update({ status: "succeeded", finished_at: new Date().toISOString(), detail })
        .eq("id", runId);
    }

    return json({ ok: true, processed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("parse-room-scan failed:", message);
    if (runId != null) {
      await supabase
        .from("job_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
        .eq("id", runId);
    }
    return json({ ok: false, error: message, processed }, 500);
  }
});

// ─── candidate selection ────────────────────────────────────────────────────

interface ScanRow {
  id: string;
  captured_room_json_url: string | null;
  room_scan_geometry:
    | { parse_status: string; parse_attempts: number; parser_version: number; source_etag: string | null }
    | null;
}

const SCAN_SELECT =
  "id, captured_room_json_url, room_scan_geometry(parse_status, parse_attempts, parser_version, source_etag)";

async function selectTargeted(
  supabase: Supa,
  scanId: string,
): Promise<ScanRow[]> {
  const { data, error } = await supabase
    .from("room_scans")
    .select(SCAN_SELECT)
    .eq("id", scanId)
    .maybeSingle();
  if (error) throw new Error(`targeted select failed: ${error.message}`);
  if (!data) return [];
  return [normalizeScanRow(data)];
}

async function selectSweepCandidates(
  supabase: Supa,
): Promise<ScanRow[]> {
  // Fetch ready scans with a CapturedRoom export, embed the geometry header,
  // then filter to true candidates in JS (the candidacy predicate spans the
  // embedded row with an OR that PostgREST can't express cleanly).
  const { data, error } = await supabase
    .from("room_scans")
    .select(SCAN_SELECT)
    .eq("status", "ready")
    .not("captured_room_json_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`sweep select failed: ${error.message}`);

  const candidates: ScanRow[] = [];
  for (const raw of (data ?? [])) {
    const row = normalizeScanRow(raw);
    if (isCandidate(row)) candidates.push(row);
    if (candidates.length >= SWEEP_LIMIT) break;
  }
  return candidates;
}

// PostgREST returns an embedded one-to-one relation as an array or object
// depending on cardinality inference — normalize to a single object or null.
function normalizeScanRow(raw: unknown): ScanRow {
  const r = raw as Record<string, unknown>;
  const g = r.room_scan_geometry;
  const geom = Array.isArray(g) ? (g[0] ?? null) : (g ?? null);
  return {
    id: String(r.id),
    captured_room_json_url: (r.captured_room_json_url as string | null) ?? null,
    room_scan_geometry: geom as ScanRow["room_scan_geometry"],
  };
}

function isCandidate(row: ScanRow): boolean {
  if (!row.captured_room_json_url) return false;
  const g = row.room_scan_geometry;
  if (!g) return true; // no geometry row yet
  if (g.parse_status === "pending") return true;
  if (g.parse_status === "error" && (g.parse_attempts ?? 0) < MAX_PARSE_ATTEMPTS) return true;
  if ((g.parser_version ?? 0) < PARSER_VERSION) return true; // parser bumped
  return false;
}

// ─── per-scan processing ────────────────────────────────────────────────────

async function processScan(
  supabase: Supa,
  scan: ScanRow,
  force: boolean,
): Promise<ProcessedResult> {
  const scanId = scan.id;
  try {
    if (!scan.captured_room_json_url) {
      throw new Error("captured_room_json_url is null");
    }
    const key = objectKeyFromUrl(scan.captured_room_json_url);
    if (!key) throw new Error(`cannot derive object key from url`);

    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(key);
    if (dlErr || !blob) throw new Error(`download failed for ${key}: ${dlErr?.message ?? "no data"}`);

    const buf = await blob.arrayBuffer();
    const etag = await sha256Hex(buf);

    // idempotency: same source bytes + same parser version, already parsed → skip
    const g = scan.room_scan_geometry;
    if (!force && g && g.parse_status === "parsed" &&
        g.source_etag === etag && (g.parser_version ?? 0) === PARSER_VERSION) {
      return { scanId, status: "skipped" };
    }

    const jsonText = new TextDecoder().decode(buf);
    const parsed = JSON.parse(jsonText); // a corrupt JSON here throws → mark error
    const { header, elements, warnings } = parseCapturedRoom(parsed);

    const { error: rpcErr } = await supabase.rpc("replace_room_scan_geometry", {
      p_scan_id: scanId,
      p_header: { ...header, source_etag: etag },
      p_elements: elements,
    });
    if (rpcErr) throw new Error(`replace_room_scan_geometry: ${rpcErr.message}`);

    return { scanId, status: "parsed", elements: elements.length, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // record the failure (increments parse_attempts → the 5-attempt cap)
    await supabase.rpc("mark_room_scan_geometry_error", { p_scan_id: scanId, p_error: message });
    return { scanId, status: "error", error: message };
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** SHA-256 of the source bytes → lowercase hex (source_etag idempotency key). */
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Decode a JWT payload (no verification — the gateway already verified it). */
function decodeJwtRole(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^bearer\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const payload = JSON.parse(atob(b64));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
