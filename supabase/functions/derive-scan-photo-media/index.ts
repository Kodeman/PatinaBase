// derive-scan-photo-media — Room View HEIC→JPEG derivative lane (I78).
//
// Every room_scan_images row lands as image/heic — undecodable in Chrome/Firefox
// — and iOS never uploads the thumbnail it builds locally, so thumbnail_url is
// NULL on every prod row. This function mirrors the GLB lane (convert-room-scan-glb):
// it drives the aesthete-inference /convert/heic-to-jpeg endpoint to turn each
// HEIC into a 512px thumbnail + a 1600px preview and stamps thumbnail_url +
// preview_url (00340). Derivatives are getPublicUrl strings; the portal signs
// them at read (I79). Runs at ingest, off the client path.
//
// Invoked three ways:
//   • pg_cron every 5 min via public.invoke_edge_function('derive-scan-photo-media','{}')
//     (00340), which POSTs apikey + service-role Bearer — so verify_jwt stays
//     true (platform default; config.toml [functions.derive-scan-photo-media]).
//   • { scanId, force? } for one scan's rows.
//   • { imageId, force? } for a single row.
// Either way the caller MUST be service_role — no browser/user path exists.
//
// Sweep predicate: thumbnail_url IS NULL AND mime_type='image/heic' AND
// derive_attempts < 5 (terminal park at 5), created_at asc, LIMIT 25.
//
// Dedupe short-circuit (I82): the client's stale image_count patch left many
// duplicate rows (same scan_id + image_url). If a sibling row already carries a
// derivative, copy its thumbnail_url/preview_url onto this row — no container
// call. Combined with the filename-stem storage key, duplicates converge.
//
// Storage: derivatives land at photo_derivatives/{uid}/{seg3}/{stem}_512.jpg and
// _1600.jpg in the room-scans bucket. uid = source key segment [1], seg3 =
// segment [2] (the scan/room id slot), copied VERBATIM from the source object
// key so the 00287 designer-read policy (owner uid = foldername[2], scan id =
// foldername[3]) + owner policies stay valid with ZERO policy changes.
//
// Degradation (convert-room-scan-glb precedent): if INFERENCE_URL/INFERENCE_TOKEN
// are unset, or the worker is unreachable / not warmed / lacks the HEIF toolchain,
// we skip WITHOUT touching any row — nothing burns a derive_attempt against a
// dead worker; rows stay queued for the next tick. A job_runs row records every
// invocation (00300 shape).
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (runtime-injected),
//      INFERENCE_URL, INFERENCE_TOKEN.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FN = 'derive-scan-photo-media';
const BUCKET = 'room-scans';
const SIGNED_URL_TTL_S = 600;
const SWEEP_LIMIT = 25;
const MAX_ATTEMPTS = 5;
const THUMB_MAX_PX = 512;
const PREVIEW_MAX_PX = 1600;
const JPEG_QUALITY = 0.8;

interface ImageRow {
  id: string;
  scan_id: string;
  image_url: string | null;
  thumbnail_url: string | null;
  preview_url: string | null;
  derive_attempts: number | null;
  mime_type: string | null;
}

interface PhotoVariant {
  b64: string;
  width: number;
  height: number;
  bytes: number;
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
 *  claim from the Bearer token, to require a service-role caller (convert-room-scan-glb
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

/** The object key inside the room-scans bucket, split out of the public
 *  image_url (…/room-scans/<key>). Null when image_url isn't a room-scans URL
 *  or the key has fewer than 4 segments ({type}/{uid}/{scanId}/{file}). */
function deriveSourceKey(imageUrl: string): string | null {
  const marker = `/${BUCKET}/`;
  const i = imageUrl.indexOf(marker);
  if (i < 0) return null;
  const key = imageUrl.slice(i + marker.length).split('?')[0];
  if (key.split('/').length < 4) return null;
  return key.length > 0 ? key : null;
}

/** Probe the inference worker's /healthz. Returns null when unreachable. */
async function probeHealthz(
  baseUrl: string,
): Promise<{ status?: string; warmed?: boolean; heif_available?: boolean } | null> {
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

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Convert one row: sign the HEIC, POST it to inference, upload both JPEG
 *  derivatives, and stamp thumbnail_url + preview_url. Throws on any failure
 *  (caller records the attempt). */
async function deriveRow(
  admin: SupabaseClient,
  row: ImageRow,
  inferenceUrl: string,
  inferenceToken: string,
): Promise<{ thumbnail_url: string; preview_url: string }> {
  const key = row.image_url ? deriveSourceKey(row.image_url) : null;
  if (!key) throw new Error(`image_url is not a ${BUCKET} object url with ≥4 segments`);

  const seg = key.split('/');
  const uid = seg[1];
  const seg3 = seg[2];
  const filename = seg[seg.length - 1];
  const stem = filename.replace(/\.[^./]+$/, '');

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_S);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`createSignedUrl failed: ${signErr?.message ?? 'no url'}`);
  }

  const res = await fetch(`${inferenceUrl.replace(/\/+$/, '')}/convert/heic-to-jpeg`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${inferenceToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: signed.signedUrl,
      image_id: row.id,
      thumb_max_px: THUMB_MAX_PX,
      preview_max_px: PREVIEW_MAX_PX,
      jpeg_quality: JPEG_QUALITY,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`inference ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const payload = (await res.json()) as { thumb?: PhotoVariant; preview?: PhotoVariant };
  if (!payload.thumb?.b64 || !payload.preview?.b64) {
    throw new Error('inference response missing thumb/preview b64');
  }

  const thumbBytes = b64ToBytes(payload.thumb.b64);
  const previewBytes = b64ToBytes(payload.preview.b64);
  if (!isJpeg(thumbBytes) || !isJpeg(previewBytes)) {
    throw new Error('inference returned non-JPEG bytes');
  }

  // photo_derivatives/{uid}/{seg3}/{stem}_{size}.jpg — segments [1]/[2] mirror
  // the source so the 00287 designer-read policy still matches; the stem keeps
  // duplicate rows (same image_url) converging on one pair of objects.
  const base = `photo_derivatives/${uid}/${seg3}/${stem}`;
  const thumbKey = `${base}_512.jpg`;
  const previewKey = `${base}_1600.jpg`;

  const up1 = await admin.storage
    .from(BUCKET)
    .upload(thumbKey, thumbBytes, { contentType: 'image/jpeg', upsert: true });
  if (up1.error) throw new Error(`thumb upload failed: ${up1.error.message}`);
  const up2 = await admin.storage
    .from(BUCKET)
    .upload(previewKey, previewBytes, { contentType: 'image/jpeg', upsert: true });
  if (up2.error) throw new Error(`preview upload failed: ${up2.error.message}`);

  const thumbnail_url = admin.storage.from(BUCKET).getPublicUrl(thumbKey).data.publicUrl;
  const preview_url = admin.storage.from(BUCKET).getPublicUrl(previewKey).data.publicUrl;

  const { error: patchErr } = await admin
    .from('room_scan_images')
    .update({ thumbnail_url, preview_url })
    .eq('id', row.id);
  if (patchErr) throw new Error(`row patch failed: ${patchErr.message}`);

  return { thumbnail_url, preview_url };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Require a service_role caller. verify_jwt (gateway) already proved the token
  // is valid + unexpired; this rejects any non-service token (e.g. a user JWT).
  if (decodeBearerRole(req.headers.get('Authorization')) !== 'service_role') {
    return json({ error: 'service_role required' }, 403);
  }

  const body = (await req.json().catch(() => ({}))) as {
    scanId?: string;
    imageId?: string;
    force?: boolean;
  };

  const inferenceUrl = Deno.env.get('INFERENCE_URL');
  const inferenceToken = Deno.env.get('INFERENCE_TOKEN');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Graceful skip: unconfigured inference. Log a job_runs 'skipped' row and exit
  // 200 — nothing claimed, nothing lost (convert-room-scan-glb precedent).
  if (!inferenceUrl || !inferenceToken) {
    logLine('inference_unconfigured', { has_url: !!inferenceUrl, has_token: !!inferenceToken });
    await admin.from('job_runs').insert({
      job_name: FN,
      status: 'skipped',
      finished_at: new Date().toISOString(),
      detail: { reason: 'inference_unconfigured' },
    });
    return json({ skipped: 'inference_unconfigured', derived: 0, copied: 0, failed: 0 }, 200);
  }

  // Probe before touching any row so a dead/un-warmed worker (or one without the
  // HEIF toolchain) never burns derive_attempts across the whole sweep.
  const health = await probeHealthz(inferenceUrl);
  if (!health || health.status !== 'ok' || !health.warmed || health.heif_available === false) {
    logLine('inference_unavailable', { health });
    await admin.from('job_runs').insert({
      job_name: FN,
      status: 'skipped',
      finished_at: new Date().toISOString(),
      detail: { reason: 'inference_unavailable', health },
    });
    return json({ skipped: 'inference_unavailable', derived: 0, copied: 0, failed: 0 }, 200);
  }

  const startedAt = new Date().toISOString();
  const { data: runRow } = await admin
    .from('job_runs')
    .insert({ job_name: FN, status: 'running', started_at: startedAt })
    .select('id')
    .single();
  const runId = (runRow as { id: number | string } | null)?.id ?? null;

  const SELECT = 'id, scan_id, image_url, thumbnail_url, preview_url, derive_attempts, mime_type';
  let derived = 0;
  let copied = 0;
  let failed = 0;
  let skipped = 0;
  let errorText: string | null = null;
  const mode = body.imageId ? 'image' : body.scanId ? 'scan' : 'sweep';

  try {
    // Select the work set. Targeted modes honor `force` (re-derive even when a
    // thumbnail is already set / attempts are exhausted); the sweep never does.
    let rows: ImageRow[] = [];
    if (body.imageId) {
      let q = admin.from('room_scan_images').select(SELECT).eq('id', body.imageId);
      if (!body.force) {
        q = q.is('thumbnail_url', null).eq('mime_type', 'image/heic').lt('derive_attempts', MAX_ATTEMPTS);
      }
      const { data, error } = await q;
      if (error) throw new Error(`select image: ${error.message}`);
      rows = (data ?? []) as ImageRow[];
    } else if (body.scanId) {
      let q = admin.from('room_scan_images').select(SELECT).eq('scan_id', body.scanId);
      if (!body.force) {
        q = q.is('thumbnail_url', null).eq('mime_type', 'image/heic').lt('derive_attempts', MAX_ATTEMPTS);
      }
      const { data, error } = await q.order('created_at', { ascending: true }).limit(SWEEP_LIMIT);
      if (error) throw new Error(`select scan images: ${error.message}`);
      rows = (data ?? []) as ImageRow[];
    } else {
      const { data, error } = await admin
        .from('room_scan_images')
        .select(SELECT)
        .is('thumbnail_url', null)
        .eq('mime_type', 'image/heic')
        .lt('derive_attempts', MAX_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(SWEEP_LIMIT);
      if (error) throw new Error(`sweep: ${error.message}`);
      rows = (data ?? []) as ImageRow[];
    }

    for (const row of rows) {
      // Only HEIC rows have anything to derive. Reachable only on a forced
      // targeted call; skip without burning an attempt.
      if (row.mime_type !== 'image/heic') {
        skipped++;
        logLine('skipped_non_heic', { image_id: row.id, mime_type: row.mime_type });
        continue;
      }

      // Dedupe short-circuit (I82): a sibling row (same scan_id + image_url) that
      // already has a derivative → copy it, no container call. Force re-derives
      // instead of copying, so an operator's { imageId, force } regenerates.
      if (!body.force && row.image_url) {
        const { data: sib } = await admin
          .from('room_scan_images')
          .select('thumbnail_url, preview_url')
          .eq('scan_id', row.scan_id)
          .eq('image_url', row.image_url)
          .not('thumbnail_url', 'is', null)
          .neq('id', row.id)
          .limit(1)
          .maybeSingle();
        if (sib?.thumbnail_url) {
          const { error: copyErr } = await admin
            .from('room_scan_images')
            .update({ thumbnail_url: sib.thumbnail_url, preview_url: sib.preview_url ?? null })
            .eq('id', row.id);
          if (!copyErr) {
            copied++;
            logLine('copied', { image_id: row.id, from_thumbnail: sib.thumbnail_url });
            continue;
          }
          // A failed copy is not terminal — fall through to a real conversion.
          logLine('copy_failed', { image_id: row.id, error: copyErr.message });
        }
      }

      try {
        const urls = await deriveRow(admin, row, inferenceUrl, inferenceToken);
        derived++;
        logLine('derived', { image_id: row.id, thumbnail_url: urls.thumbnail_url });
      } catch (err) {
        failed++;
        const reason = err instanceof Error ? err.message : String(err);
        logLine('derive_failed', { image_id: row.id, error: reason });
        // Record the attempt so the sweep backs off and eventually parks (>= 5).
        await admin
          .from('room_scan_images')
          .update({
            derive_attempts: (row.derive_attempts ?? 0) + 1,
            derive_error: reason.slice(0, 500),
          })
          .eq('id', row.id);
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
        detail: { mode, derived, copied, failed, skipped },
        error: errorText,
      })
      .eq('id', runId);
  }

  return json({ mode, derived, copied, failed, skipped, error: errorText }, errorText ? 500 : 200);
});
