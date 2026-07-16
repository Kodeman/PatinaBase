// convert-room-scan-glb — Room View USDZ→GLB archival lane (R107).
//
// Drives the aesthete-inference /convert/usdz-to-glb endpoint to turn each
// ready room_scans USDZ (room_scans.model_url) into an archival binary glTF and
// records its public URL on room_scans.model_url_gltf (00020 — this function is
// that column's FIRST writer). NOTHING in v1 reads the GLB; it is "as captured"
// insurance for a later toggle. Conversion runs at ingest, off the client path.
//
// Invoked two ways:
//   • pg_cron every 15 min via public.invoke_edge_function('convert-room-scan-glb','{}')
//     (00338), which POSTs apikey + service-role Bearer — so verify_jwt stays
//     true (platform default; config.toml [functions.convert-room-scan-glb]).
//   • { scanId, force? } for a single targeted scan.
// Either way the caller MUST be service_role — no browser/user path exists.
//
// Sweep selects ≤ 5 scans: status='ready' AND model_url IS NOT NULL AND
// model_url_gltf IS NULL AND glb_convert_attempts < 5 (terminal park at 5).
//
// Storage: the GLB lands at glb/{ownerUid}/{sourceSeg3}/scan.glb in the
// room-scans bucket. Segment [2]=owner uid and segment [3]=whatever the source
// USDZ used (the iOS uploader writes the scan id there) keep the 00287 designer
// read policy valid with ZERO policy changes.
//
// Degradation (aesthete-embed-worker precedent): if INFERENCE_URL/INFERENCE_TOKEN
// are unset, or the worker is unreachable / not warmed / lacks the USD toolchain,
// we skip WITHOUT touching any scan — nothing burns a glb_convert_attempt against
// a dead worker; the scans stay queued for the next tick. A job_runs row records
// every invocation (00300 shape).
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (runtime-injected),
//      INFERENCE_URL, INFERENCE_TOKEN.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FN = 'convert-room-scan-glb';
const BUCKET = 'room-scans';
const SIGNED_URL_TTL_S = 600;
const SWEEP_LIMIT = 5;
const MAX_ATTEMPTS = 5;

interface ScanRow {
  id: string;
  user_id: string;
  model_url: string | null;
  model_url_gltf: string | null;
  glb_convert_attempts: number | null;
  status: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function logLine(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn: FN, event, ...fields }));
}

/** Decode (without verifying — the gateway's verify_jwt already did) the role
 *  claim from the Bearer token, to require a service-role caller (sms-dispatch
 *  idiom). */
function decodeBearerRole(authHeader: string | null): string | undefined {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const parts = authHeader.slice(7).split('.');
  if (parts.length !== 3) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return (JSON.parse(atob(padded)) as { role?: string }).role;
  } catch {
    return undefined;
  }
}

/** The USDZ object key inside the room-scans bucket, split out of the public
 *  model_url (…/room-scans/<key>). Null when model_url isn't a room-scans URL. */
function deriveUsdzKey(modelUrl: string): string | null {
  const marker = `/${BUCKET}/`;
  const i = modelUrl.indexOf(marker);
  if (i < 0) return null;
  const key = modelUrl.slice(i + marker.length).split('?')[0];
  return key.length > 0 ? key : null;
}

/** Probe the inference worker's /healthz. Returns null when unreachable. */
async function probeHealthz(
  baseUrl: string,
): Promise<{ status?: string; warmed?: boolean; usd_available?: boolean } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/healthz`, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Convert one scan: sign the USDZ, POST it to inference, upload the GLB, and
 *  stamp model_url_gltf. Throws on any failure (caller records the attempt). */
async function convertScan(
  admin: SupabaseClient,
  scan: ScanRow,
  inferenceUrl: string,
  inferenceToken: string,
): Promise<string> {
  const key = scan.model_url ? deriveUsdzKey(scan.model_url) : null;
  if (!key) throw new Error(`model_url is not a ${BUCKET} object url`);

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_S);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`createSignedUrl failed: ${signErr?.message ?? 'no url'}`);
  }

  const res = await fetch(`${inferenceUrl.replace(/\/+$/, '')}/convert/usdz-to-glb`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${inferenceToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ usdz_url: signed.signedUrl, scan_id: scan.id }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`inference ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const glb = new Uint8Array(await res.arrayBuffer());
  if (glb.length < 12 || String.fromCharCode(...glb.slice(0, 4)) !== 'glTF') {
    throw new Error('inference returned non-GLB bytes');
  }

  // glb/{ownerUid}/{sourceSeg3}/scan.glb — segments [2]/[3] mirror the source
  // so the 00287 designer-read policy still matches (owner uid + scan id).
  const srcSegments = key.split('/');
  const sourceSeg3 = srcSegments.length >= 3 ? srcSegments[2] : scan.id;
  const targetKey = `glb/${scan.user_id}/${sourceSeg3}/scan.glb`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(targetKey, glb, { contentType: 'model/gltf-binary', upsert: true });
  if (upErr) throw new Error(`glb upload failed: ${upErr.message}`);

  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(targetKey).data.publicUrl;

  const { error: patchErr } = await admin
    .from('room_scans')
    .update({ model_url_gltf: publicUrl })
    .eq('id', scan.id);
  if (patchErr) throw new Error(`model_url_gltf patch failed: ${patchErr.message}`);

  return publicUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Require a service_role caller. verify_jwt (gateway) already proved the token
  // is valid + unexpired; this rejects any non-service token (e.g. a user JWT).
  if (decodeBearerRole(req.headers.get('Authorization')) !== 'service_role') {
    return json({ error: 'service_role required' }, 403);
  }

  const body = (await req.json().catch(() => ({}))) as { scanId?: string; force?: boolean };

  const inferenceUrl = Deno.env.get('INFERENCE_URL');
  const inferenceToken = Deno.env.get('INFERENCE_TOKEN');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Graceful skip: unconfigured inference. Log a job_runs 'skipped' row and
  // exit 200 — nothing claimed, nothing lost (aesthete-embed-worker precedent).
  if (!inferenceUrl || !inferenceToken) {
    logLine('inference_unconfigured', { has_url: !!inferenceUrl, has_token: !!inferenceToken });
    await admin.from('job_runs').insert({
      job_name: FN,
      status: 'skipped',
      finished_at: new Date().toISOString(),
      detail: { reason: 'inference_unconfigured' },
    });
    return json({ skipped: 'inference_unconfigured', converted: 0, failed: 0 }, 200);
  }

  // Probe before touching any scan so a dead/un-warmed worker (or one without
  // the USD toolchain) never burns glb_convert_attempts across the whole sweep.
  const health = await probeHealthz(inferenceUrl);
  if (!health || health.status !== 'ok' || !health.warmed || health.usd_available === false) {
    logLine('inference_unavailable', { health });
    await admin.from('job_runs').insert({
      job_name: FN,
      status: 'skipped',
      finished_at: new Date().toISOString(),
      detail: { reason: 'inference_unavailable', health },
    });
    return json({ skipped: 'inference_unavailable', converted: 0, failed: 0 }, 200);
  }

  const startedAt = new Date().toISOString();
  const { data: runRow } = await admin
    .from('job_runs')
    .insert({ job_name: FN, status: 'running', started_at: startedAt })
    .select('id')
    .single();
  const runId = (runRow as { id: number | string } | null)?.id ?? null;

  let converted = 0;
  let failed = 0;
  let errorText: string | null = null;
  const mode = body.scanId ? 'single' : 'sweep';

  try {
    // Select the work set. Single-scan honors `force` (re-converts even when
    // gltf is already set / attempts are exhausted); the sweep never does.
    let scans: ScanRow[] = [];
    if (body.scanId) {
      let q = admin
        .from('room_scans')
        .select('id, user_id, model_url, model_url_gltf, glb_convert_attempts, status')
        .eq('id', body.scanId);
      if (!body.force) {
        q = q
          .eq('status', 'ready')
          .not('model_url', 'is', null)
          .is('model_url_gltf', null)
          .lt('glb_convert_attempts', MAX_ATTEMPTS);
      }
      const { data, error } = await q;
      if (error) throw new Error(`select scan: ${error.message}`);
      scans = (data ?? []) as ScanRow[];
    } else {
      const { data, error } = await admin
        .from('room_scans')
        .select('id, user_id, model_url, model_url_gltf, glb_convert_attempts, status')
        .eq('status', 'ready')
        .not('model_url', 'is', null)
        .is('model_url_gltf', null)
        .lt('glb_convert_attempts', MAX_ATTEMPTS)
        .order('scanned_at', { ascending: true })
        .limit(SWEEP_LIMIT);
      if (error) throw new Error(`sweep: ${error.message}`);
      scans = (data ?? []) as ScanRow[];
    }

    for (const scan of scans) {
      try {
        const url = await convertScan(admin, scan, inferenceUrl, inferenceToken);
        converted++;
        logLine('converted', { scan_id: scan.id, model_url_gltf: url });
      } catch (err) {
        failed++;
        const reason = err instanceof Error ? err.message : String(err);
        logLine('convert_failed', { scan_id: scan.id, error: reason });
        // Record the attempt on the scan so the sweep backs off and eventually
        // parks (attempts >= 5). Read-modify-write is safe here — a single
        // low-frequency runner, and duplicate work is idempotent (upsert).
        await admin
          .from('room_scans')
          .update({
            glb_convert_attempts: (scan.glb_convert_attempts ?? 0) + 1,
            glb_convert_error: reason.slice(0, 500),
          })
          .eq('id', scan.id);
      }
    }
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    logLine('run_error', { error: errorText });
  }

  if (runId != null) {
    await admin
      .from('job_runs')
      .update({
        status: errorText ? 'failed' : 'succeeded',
        finished_at: new Date().toISOString(),
        detail: { mode, converted, failed },
        error: errorText,
      })
      .eq('id', runId);
  }

  return json({ mode, converted, failed, error: errorText }, errorText ? 500 : 200);
});
