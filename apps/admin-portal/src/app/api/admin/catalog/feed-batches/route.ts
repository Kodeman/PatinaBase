import { NextRequest, NextResponse } from 'next/server';
import { createAgentQueue } from '@patina/agent-queue';
import {
  badRequest,
  createAuditLog,
  getAuthenticatedAdmin,
  getClientIp,
  serverError,
} from '@/lib/supabase-admin';

const BUCKET = 'catalog-feeds';
const MAX_BYTES = 25 * 1024 * 1024; // matches the catalog-feeds bucket's file_size_limit (00306)
const ALLOWED_TYPES = new Set(['text/csv', 'application/json', 'application/vnd.ms-excel', 'text/plain']);

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extensionFor(filename: string, mimeType: string): string {
  const fromName = filename.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (mimeType === 'application/json') return 'json';
  return 'csv';
}

// POST /api/admin/catalog/feed-batches — upload a vendor catalog feed file.
// Stores it in the catalog-feeds bucket, inserts a catalog_feed_batches row,
// and enqueues a normalize_feed agent_task (WP-2.4) the catalog-normalizer
// edge function later claims. Byte-identical re-uploads (same vendor +
// content) are a no-op: a matching (vendor_id, content_hash) row already
// exists and is returned as-is, with no re-upload and no duplicate task
// (enqueue is idempotency-keyed by batch id regardless).
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient, user } = auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest('Expected multipart/form-data');
  }

  const file = formData.get('file');
  const vendorId = formData.get('vendorId');
  const pipelineVendorId = formData.get('pipelineVendorId');
  const source = (formData.get('source') as string | null) ?? 'upload';

  if (!(file instanceof File)) return badRequest('file is required');
  if (typeof vendorId !== 'string' || !vendorId) return badRequest('vendorId is required');
  if (!['upload', 'url', 'cowork_bridge'].includes(source)) return badRequest(`invalid source: ${source}`);
  if (file.size === 0) return badRequest('file is empty');
  if (file.size > MAX_BYTES) return badRequest(`file exceeds ${MAX_BYTES} bytes`);
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    // Some browsers send an empty/octet-stream type for .csv — don't hard-fail
    // on an unset/generic type, only on a KNOWN wrong one.
    if (file.type !== 'application/octet-stream' && file.type !== '') {
      return badRequest(`unsupported file type: ${file.type}`);
    }
  }

  const bytes = await file.arrayBuffer();
  const contentHash = await sha256Hex(bytes);

  const { data: existing, error: existingErr } = await adminClient
    .from('catalog_feed_batches')
    .select('id, status, storage_path, content_hash, row_count, auto_count, review_count')
    .eq('vendor_id', vendorId)
    .eq('content_hash', contentHash)
    .maybeSingle();
  if (existingErr) return serverError(existingErr.message);

  if (existing) {
    return NextResponse.json({ data: { batch: existing, deduped: true } });
  }

  const ext = extensionFor(file.name, file.type);
  const id = crypto.randomUUID();
  const storagePath = `${vendorId}/${id}.${ext}`;

  const { error: uploadErr } = await adminClient.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || 'text/csv',
      upsert: false,
    });
  if (uploadErr) return serverError(`storage upload failed: ${uploadErr.message}`);

  const { data: batch, error: insertErr } = await adminClient
    .from('catalog_feed_batches')
    .insert({
      id,
      vendor_id: vendorId,
      pipeline_vendor_id: typeof pipelineVendorId === 'string' && pipelineVendorId ? pipelineVendorId : null,
      source,
      storage_path: storagePath,
      content_hash: contentHash,
      status: 'received',
    })
    .select('id, status, storage_path, content_hash, row_count, auto_count, review_count')
    .maybeSingle();

  if (insertErr) {
    // A concurrent upload of the identical file can race past the SELECT
    // above; UNIQUE(vendor_id, content_hash) makes this the only failure
    // mode here. Fall back to the row the other request created.
    const { data: raced } = await adminClient
      .from('catalog_feed_batches')
      .select('id, status, storage_path, content_hash, row_count, auto_count, review_count')
      .eq('vendor_id', vendorId)
      .eq('content_hash', contentHash)
      .maybeSingle();
    if (raced) return NextResponse.json({ data: { batch: raced, deduped: true } });
    return serverError(insertErr.message);
  }

  await createAgentQueue(adminClient).enqueue({
    taskType: 'normalize_feed',
    status: 'queued',
    source: 'admin:feed-upload',
    entityType: 'catalog_feed_batch',
    entityId: id,
    idempotencyKey: `normalize_feed:${id}`,
    summary: `Normalize feed batch ${id}`,
    payload: { batch_id: id },
    actor: user.email ?? user.id,
  });

  await createAuditLog(adminClient, {
    userId: user.id,
    action: 'catalog.feed_batch_upload',
    resourceType: 'catalog_feed_batch',
    resourceId: id,
    newValues: { vendorId, source, filename: file.name, sizeBytes: file.size },
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({ data: { batch, deduped: false } }, { status: 201 });
}
