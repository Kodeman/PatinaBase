import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@patina/supabase/client';
import {
  badRequest,
  createAuditLog,
  getAuthenticatedAdmin,
  getClientIp,
  notFound,
  serverError,
} from '@/lib/supabase-admin';
import {
  applyFieldCorrections,
  isApproved,
  isBatchFullyResolved,
  isItemEligibleForCommit,
  selectEligibleBatchRows,
  type CatalogFeedItemForCommit,
} from '@/lib/catalog-commit';

type AdminClient = ReturnType<typeof createAdminClient>;

// POST /api/admin/catalog/commit-batch
//
// Gated write-back from catalog_feed_items (normalized by the
// catalog-normalizer edge function, WP-2.4) into the managed products
// catalog. TWO modes, mutually exclusive:
//
//   { batchId }  — commit every row in the batch that is auto-eligible
//                  (status='normalized', confidence>=0.9, not yet
//                  committed). Gated on the BATCH's commit_task_id
//                  agent_tasks row being status='approved'.
//   { itemId }   — commit ONE row that went through human review. Gated on
//                  that row's catalog_review agent_tasks row (found by
//                  idempotency_key `catalog_review:<itemId>`) being
//                  status='approved'. Any field_corrections the reviewer
//                  supplied as review payloadPatch land in
//                  task.payload.field_corrections and are merged over the
//                  normalizer's output before commit.
//
// Idempotent: a committed row's committed_product_id guards it out of both
// eligibility filters, so re-POSTing the same batchId/itemId is a no-op.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient, user } = auth;

  let body: { batchId?: string; itemId?: string };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (body.batchId && body.itemId) {
    return badRequest('Provide exactly one of batchId or itemId, not both');
  }
  if (body.batchId) return commitBatch(adminClient, user, body.batchId, request);
  if (body.itemId) return commitItem(adminClient, user, body.itemId, request);
  return badRequest('batchId or itemId is required');
}

async function commitBatch(
  adminClient: AdminClient,
  user: { id: string; email?: string },
  batchId: string,
  request: NextRequest,
) {
  const { data: batch, error: batchErr } = await adminClient
    .from('catalog_feed_batches')
    .select('id, vendor_id, commit_task_id, status')
    .eq('id', batchId)
    .maybeSingle();
  if (batchErr) return serverError(batchErr.message);
  if (!batch) return notFound('Batch not found');
  if (!batch.commit_task_id) {
    return NextResponse.json({ error: 'batch has no commit task yet — normalization has not completed' }, { status: 403 });
  }

  const { data: gateTask, error: gateErr } = await adminClient
    .from('agent_tasks')
    .select('id, status')
    .eq('id', batch.commit_task_id)
    .maybeSingle();
  if (gateErr) return serverError(gateErr.message);
  if (!isApproved(gateTask)) {
    return NextResponse.json({ error: 'approval task not approved' }, { status: 403 });
  }

  const { data: allItems, error: itemsErr } = await adminClient
    .from('catalog_feed_items')
    .select('id, batch_id, status, confidence, normalized, match_product_id, action, committed_product_id')
    .eq('batch_id', batchId);
  if (itemsErr) return serverError(itemsErr.message);

  const eligible = selectEligibleBatchRows((allItems ?? []) as CatalogFeedItemForCommit[]);

  let committed = 0;
  const errors: Array<{ itemId: string; error: string }> = [];

  for (const item of eligible) {
    try {
      const product = await commitOneProduct(adminClient, {
        vendorId: batch.vendor_id,
        item,
        normalized: item.normalized as Record<string, unknown>,
        actorUserId: user.id,
      });
      await adminClient
        .from('catalog_feed_items')
        .update({ status: 'auto_committed', committed_product_id: product.id })
        .eq('id', item.id);
      committed++;
    } catch (e) {
      errors.push({ itemId: item.id, error: (e as Error).message });
    }
  }

  await maybeMarkBatchCommitted(adminClient, batchId);

  if (committed > 0) {
    await createAuditLog(adminClient, {
      userId: user.id,
      action: 'catalog.commit_batch',
      resourceType: 'catalog_feed_batch',
      resourceId: batchId,
      newValues: { committed, failed: errors.length },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
  }

  return NextResponse.json({ data: { batchId, eligible: eligible.length, committed, errors } });
}

async function commitItem(
  adminClient: AdminClient,
  user: { id: string; email?: string },
  itemId: string,
  request: NextRequest,
) {
  const { data: item, error: itemErr } = await adminClient
    .from('catalog_feed_items')
    .select('id, batch_id, status, confidence, normalized, match_product_id, action, committed_product_id')
    .eq('id', itemId)
    .maybeSingle();
  if (itemErr) return serverError(itemErr.message);
  if (!item) return notFound('catalog_feed_items row not found');

  const { data: batch, error: batchErr } = await adminClient
    .from('catalog_feed_batches')
    .select('id, vendor_id')
    .eq('id', item.batch_id)
    .maybeSingle();
  if (batchErr) return serverError(batchErr.message);
  if (!batch) return notFound('Batch not found for item');

  const { data: gateTask, error: gateErr } = await adminClient
    .from('agent_tasks')
    .select('id, status, payload')
    .eq('idempotency_key', `catalog_review:${itemId}`)
    .maybeSingle();
  if (gateErr) return serverError(gateErr.message);

  if (!isItemEligibleForCommit(item as CatalogFeedItemForCommit, gateTask)) {
    if (!isApproved(gateTask)) {
      return NextResponse.json({ error: 'approval task not approved' }, { status: 403 });
    }
    // Already committed — idempotent no-op success.
    return NextResponse.json({ data: { itemId, committed: false, alreadyCommitted: true } });
  }

  const corrections = (gateTask?.payload as Record<string, unknown> | null | undefined)?.field_corrections as
    | Record<string, unknown>
    | null
    | undefined;
  const normalized = applyFieldCorrections(item.normalized as Record<string, unknown>, corrections);

  try {
    const product = await commitOneProduct(adminClient, {
      vendorId: batch.vendor_id,
      item: item as CatalogFeedItemForCommit,
      normalized,
      actorUserId: user.id,
    });
    await adminClient
      .from('catalog_feed_items')
      .update({ status: 'approved_committed', committed_product_id: product.id })
      .eq('id', itemId);

    await maybeMarkBatchCommitted(adminClient, item.batch_id);

    await createAuditLog(adminClient, {
      userId: user.id,
      action: 'catalog.commit_item',
      resourceType: 'catalog_feed_item',
      resourceId: itemId,
      newValues: { productId: product.id, corrected: !!corrections },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { itemId, committed: true, productId: product.id } });
  } catch (e) {
    return serverError((e as Error).message);
  }
}

/**
 * Upsert one product row (keyed by (vendor_id, vendor_sku) on the update
 * path via item.match_product_id, else by source_url on the create path) and
 * write the promotion_audit_log evidence row. Shared by both commit modes.
 */
async function commitOneProduct(
  adminClient: AdminClient,
  opts: {
    vendorId: string;
    item: CatalogFeedItemForCommit;
    normalized: Record<string, unknown>;
    actorUserId: string;
  },
): Promise<{ id: string }> {
  const { vendorId, item, normalized, actorUserId } = opts;
  const n = normalized as {
    name: string;
    description?: string | null;
    vendor_sku?: string | null;
    price_retail_cents?: number | null;
    price_trade_cents?: number | null;
    dimensions?: unknown;
    materials?: string[];
    finishes?: string[];
    freight_class?: string | null;
    lead_time_weeks?: number | null;
    category?: string | null;
    subcategory?: string | null;
    source_url?: string | null;
    images?: string[];
  };

  const fields = {
    name: n.name,
    description: n.description ?? null,
    vendor_sku: n.vendor_sku ?? null,
    price_retail: n.price_retail_cents ?? null,
    price_trade: n.price_trade_cents ?? null,
    dimensions: (n.dimensions ?? null) as any,
    materials: n.materials ?? [],
    finishes: n.finishes ?? [],
    freight_class: n.freight_class ?? null,
    lead_time_weeks: n.lead_time_weeks ?? null,
    category: n.category ?? null,
    subcategory: n.subcategory ?? null,
    vendor_id: vendorId,
    layer: 'catalog' as const,
    patina_managed: true,
  };

  let productId: string;

  if (item.action === 'update' && item.match_product_id) {
    const { data, error } = await adminClient
      .from('products')
      .update(fields)
      .eq('id', item.match_product_id)
      .select('id')
      .single();
    if (error) throw new Error(`product update failed: ${error.message}`);
    productId = data!.id;
  } else {
    // products.source_url is NOT NULL (00001). A feed row missing a URL
    // column still needs a stable, unique placeholder rather than failing
    // the whole commit.
    const sourceUrl = n.source_url ?? `urn:catalog-feed:${vendorId}:${item.id}`;
    const { data, error } = await adminClient
      .from('products')
      .insert({
        ...fields,
        source_url: sourceUrl,
        images: n.images ?? [],
        captured_by: actorUserId,
        captured_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`product create failed: ${error.message}`);
    productId = data!.id;
  }

  const { error: auditErr } = await adminClient.from('promotion_audit_log').insert({
    product_id: productId,
    from_layer: 'catalog',
    to_layer: 'catalog',
    actor_user_id: actorUserId,
    action_type: 'catalog_commit',
    field_snapshot: normalized as any,
  });
  if (auditErr) throw new Error(`promotion_audit_log write failed: ${auditErr.message}`);

  return { id: productId };
}

/** Flip the batch to 'committed' once every row is committed/rejected/skipped/errored. */
async function maybeMarkBatchCommitted(adminClient: AdminClient, batchId: string): Promise<void> {
  const { data: items, error } = await adminClient
    .from('catalog_feed_items')
    .select('status')
    .eq('batch_id', batchId);
  if (error || !items) return;
  if (isBatchFullyResolved(items as Array<{ status: string }>)) {
    await adminClient.from('catalog_feed_batches').update({ status: 'committed' }).eq('id', batchId);
  }
}
