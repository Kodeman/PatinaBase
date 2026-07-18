// Service-only Site Request media worker. It reuses the existing Cloudflare
// inference conversion rail to create 512px/1600px JPEG variants and enforces
// the 90-day retention deadline for unapproved evidence. No guest or browser
// calls this function; pg_cron invokes it with the service-role Bearer.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  b64Bytes,
  bearerRole,
  derivativeObjectPaths,
  derivativePaths,
  DERIVE_LIMIT,
  isJpeg,
  isProcessableImage,
  MAX_DERIVE_ATTEMPTS,
  PROCESSABLE_IMAGE_MIME_TYPES,
  PURGE_REQUEST_LIMIT,
  SITE_REQUEST_MEDIA_BUCKET,
  type SiteMediaRow,
  validImmutableObjectPath,
} from "./core.ts";

const FUNCTION_NAME = "site-request-media-maintenance";
const SIGNED_URL_TTL_SECONDS = 600;
const THUMBNAIL_MAX_PX = 512;
const PREVIEW_MAX_PX = 1600;
const JPEG_QUALITY = 0.8;

interface Variant {
  b64?: string;
  width?: number;
  height?: number;
  bytes?: number;
}

interface WorkerBody {
  mediaId?: string;
  requestId?: string;
  now?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function inferenceReady(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/healthz`, {
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const value = await response.json() as {
      status?: string;
      warmed?: boolean;
    };
    return value.status === "ok" && value.warmed === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function deriveOne(
  admin: SupabaseClient,
  row: SiteMediaRow,
  inferenceUrl: string,
  inferenceToken: string,
): Promise<void> {
  if (!validImmutableObjectPath(row.object_path)) {
    throw new Error("source object escaped immutable request path");
  }
  if (!isProcessableImage(row.mime_type)) {
    throw new Error(`unsupported derivative input ${row.mime_type}`);
  }

  const claimed = await admin.from("site_deliverable_media").update({
    upload_state: "processing",
    derive_attempts: row.derive_attempts + 1,
    processing_error: null,
  }).eq("id", row.id).in("upload_state", ["uploaded", "failed"])
    .eq("derive_attempts", row.derive_attempts).select("id").maybeSingle();
  if (claimed.error) throw new Error(`claim failed: ${claimed.error.message}`);
  if (!claimed.data) return;

  try {
    const signed = await admin.storage.from(SITE_REQUEST_MEDIA_BUCKET)
      .createSignedUrl(row.object_path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(
        `source signing failed: ${signed.error?.message ?? "no URL"}`,
      );
    }

    const response = await fetch(
      `${inferenceUrl.replace(/\/+$/, "")}/convert/heic-to-jpeg`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${inferenceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: signed.data.signedUrl,
          image_id: row.id,
          thumb_max_px: THUMBNAIL_MAX_PX,
          preview_max_px: PREVIEW_MAX_PX,
          jpeg_quality: JPEG_QUALITY,
        }),
      },
    );
    if (!response.ok) {
      // Do not persist the upstream body: a proxy error may echo the signed
      // source URL. Status is sufficient for retry/operations evidence.
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`inference HTTP ${response.status}`);
    }
    const payload = await response.json() as {
      thumb?: Variant;
      preview?: Variant;
    };
    if (!payload.thumb?.b64 || !payload.preview?.b64) {
      throw new Error("inference omitted JPEG variants");
    }
    const thumbnail = b64Bytes(payload.thumb.b64);
    const preview = b64Bytes(payload.preview.b64);
    if (!isJpeg(thumbnail) || !isJpeg(preview)) {
      throw new Error("inference returned a non-JPEG derivative");
    }

    const paths = derivativePaths(row);
    const thumbUpload = await admin.storage.from(SITE_REQUEST_MEDIA_BUCKET)
      .upload(paths.thumbnail, thumbnail, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: true,
      });
    if (thumbUpload.error) {
      throw new Error(`thumbnail upload failed: ${thumbUpload.error.message}`);
    }
    const previewUpload = await admin.storage.from(SITE_REQUEST_MEDIA_BUCKET)
      .upload(paths.preview, preview, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: true,
      });
    if (previewUpload.error) {
      throw new Error(`preview upload failed: ${previewUpload.error.message}`);
    }

    const completed = await admin.from("site_deliverable_media").update({
      upload_state: "ready",
      processing_error: null,
      derivatives: {
        thumbnail_path: paths.thumbnail,
        thumbnail_width: payload.thumb.width ?? null,
        thumbnail_height: payload.thumb.height ?? null,
        thumbnail_bytes: payload.thumb.bytes ?? thumbnail.byteLength,
        preview_path: paths.preview,
        preview_width: payload.preview.width ?? null,
        preview_height: payload.preview.height ?? null,
        preview_bytes: payload.preview.bytes ?? preview.byteLength,
        mime_type: "image/jpeg",
        processed_at: new Date().toISOString(),
      },
    }).eq("id", row.id).eq("upload_state", "processing");
    if (completed.error) {
      throw new Error(`derivative receipt failed: ${completed.error.message}`);
    }
  } catch (error) {
    await admin.from("site_deliverable_media").update({
      upload_state: "failed",
      processing_error: (error instanceof Error ? error.message : String(error))
        .slice(0, 500),
    }).eq("id", row.id).eq("upload_state", "processing");
    throw error;
  }
}

async function purgeExpiredUnapproved(
  admin: SupabaseClient,
  now: string,
  requestId?: string,
): Promise<{ purged: number; failed: number }> {
  let requestQuery = admin.from("site_requests")
    .select("id")
    .in("status", ["closed", "expired"])
    .not("unapproved_media_delete_after", "is", null)
    .lte("unapproved_media_delete_after", now)
    .order("unapproved_media_delete_after", { ascending: true })
    .limit(PURGE_REQUEST_LIMIT);
  if (requestId) requestQuery = requestQuery.eq("id", requestId);
  const requests = await requestQuery;
  if (requests.error) {
    throw new Error(`retention query failed: ${requests.error.message}`);
  }

  let purged = 0;
  let failed = 0;
  for (const request of requests.data ?? []) {
    const deliveryResult = await admin.from("site_deliverables")
      .select("id").eq("request_id", request.id);
    if (deliveryResult.error) {
      failed += 1;
      continue;
    }
    const deliveryIds = (deliveryResult.data ?? []).map((row) => row.id);
    if (deliveryIds.length === 0) continue;

    const approvedResult = await admin.from("site_binder_entries")
      .select("deliverable_id").in("deliverable_id", deliveryIds);
    if (approvedResult.error) {
      failed += 1;
      continue;
    }
    const approved = new Set(
      (approvedResult.data ?? []).map((row) => row.deliverable_id),
    );
    const unapproved = deliveryIds.filter((id) => !approved.has(id));
    if (unapproved.length === 0) continue;

    const mediaResult = await admin.from("site_deliverable_media")
      .select(
        "id,deliverable_id,object_path,mime_type,upload_state,derivatives,derive_attempts,purged_at",
      )
      .in("deliverable_id", unapproved).is("purged_at", null);
    if (mediaResult.error) {
      failed += 1;
      continue;
    }

    for (const media of (mediaResult.data ?? []) as SiteMediaRow[]) {
      if (!validImmutableObjectPath(media.object_path)) {
        failed += 1;
        continue;
      }
      const paths = [
        media.object_path,
        ...derivativeObjectPaths(media.derivatives),
      ];
      const removal = await admin.storage.from(SITE_REQUEST_MEDIA_BUCKET)
        .remove(paths);
      if (removal.error) {
        failed += 1;
        continue;
      }
      const marked = await admin.from("site_deliverable_media").update({
        purged_at: now,
        derivatives: { ...(media.derivatives ?? {}), purged_at: now },
        processing_error: null,
      }).eq("id", media.id).is("purged_at", null);
      if (marked.error) failed += 1;
      else purged += 1;
    }
  }
  return { purged, failed };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (bearerRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "service_role_required" }, 403);
  }
  const body = await req.json().catch(() => ({})) as WorkerBody;
  if (body.now && Number.isNaN(Date.parse(body.now))) {
    return json({ error: "invalid_now" }, 422);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const startedAt = new Date().toISOString();
  const { data: run } = await admin.from("job_runs").insert({
    job_name: FUNCTION_NAME,
    status: "running",
    started_at: startedAt,
  }).select("id").maybeSingle();

  try {
    const retention = await purgeExpiredUnapproved(
      admin,
      body.now ?? new Date().toISOString(),
      body.requestId,
    );
    const inferenceUrl = Deno.env.get("INFERENCE_URL");
    const inferenceToken = Deno.env.get("INFERENCE_TOKEN");
    const ready = !!inferenceUrl && !!inferenceToken &&
      await inferenceReady(inferenceUrl);

    let derived = 0;
    let deriveFailed = 0;
    if (ready) {
      let query = admin.from("site_deliverable_media").select(
        "id,deliverable_id,object_path,mime_type,upload_state,derivatives,derive_attempts,purged_at",
      ).in("upload_state", ["uploaded", "failed"])
        .in("mime_type", [...PROCESSABLE_IMAGE_MIME_TYPES])
        .lt("derive_attempts", MAX_DERIVE_ATTEMPTS).is("purged_at", null)
        .order("created_at", { ascending: true }).limit(DERIVE_LIMIT);
      if (body.mediaId) query = query.eq("id", body.mediaId);
      const candidates = await query;
      if (candidates.error) {
        throw new Error(`derive query failed: ${candidates.error.message}`);
      }
      for (const media of (candidates.data ?? []) as SiteMediaRow[]) {
        if (Object.keys(media.derivatives ?? {}).length > 0) continue;
        try {
          await deriveOne(admin, media, inferenceUrl!, inferenceToken!);
          derived += 1;
        } catch {
          deriveFailed += 1;
        }
      }
    }

    const result = {
      ok: true,
      derivatives: ready ? { derived, failed: deriveFailed } : {
        skipped: "inference_unavailable",
        derived: 0,
        failed: 0,
      },
      retention,
    };
    if (run?.id) {
      await admin.from("job_runs").update({
        status: retention.failed + deriveFailed > 0 ? "failed" : "succeeded",
        finished_at: new Date().toISOString(),
        detail: result,
      }).eq("id", run.id);
    }
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (run?.id) {
      await admin.from("job_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: message.slice(0, 500),
      }).eq("id", run.id);
    }
    return json({ error: "maintenance_failed" }, 500);
  }
});
