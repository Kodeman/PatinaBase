// catalog-normalizer/core.ts — orchestration for the Catalog Normalizer job
// (WP-2.4). All sequencing lives here behind injectable deps so it
// unit-tests offline (golden-file suite); index.ts is only the service-role
// + inference-client wiring + serve() shell, matching the field-daily /
// cowork-intake-bridge core.ts/index.ts split.
//
// Run flow:
//   1. sweep — enqueue a normalize_feed agent_task (00297) for any
//      catalog_feed_batches row stuck at status='received' with no live
//      task referencing it (idempotency_key normalize_feed:<batch_id>, so
//      re-sweeping is a no-op once a task exists).
//   2. claim up to 5 normalize_feed tasks.
//   3. per claimed task: normalize its batch (see processBatch below),
//      then complete_agent_task('done'|'failed').
//   4. one job_runs row per invocation.
//
// processBatch, per row:
//   a. download the feed file from storage, parse (feed-parse.ts).
//   b. hash each raw row (stableRowHash); skip any row whose hash already
//      exists in catalog_feed_items for this batch — idempotent re-run.
//   c. deterministic normalize (normalize-row.ts): dimensions, currency,
//      materials/finishes vocabulary, freight class, lead time. A row
//      missing `name` is unprocessable -> status='error', no further work.
//   d. batch-embed (<=16 per call) the survivors' name+description text via
//      the inference sidecar, classify category/subcategory against the
//      taxonomy (embedded once per batch), and dedupe: vendor_sku exact
//      match against this vendor's existing products first (-> 'update' +
//      field diff); else embedding cosine similarity > 0.92 against the
//      same set (-> 'update' + diff); else 'create'.
//   e. confidence = min(name, price, category) field confidences.
//      >=0.9 -> status='normalized' (auto-commit eligible via the gated
//      commit route). <0.9 -> status='review_queued' + one catalog_review
//      agent_task per row.
//   f. ONE catalog_commit agent_task per batch, created AFTER all rows are
//      scored (so its payload carries final auto/review counts), and BEFORE
//      the catalog_review tasks (so each review task's parent_task_id can
//      point at it).

import {
  parseFeed,
  stableRowHash,
} from './feed-parse.ts';
import {
  normalizeRowDeterministic,
  classifyCategory,
  cosineSimilarity,
  buildFieldDiff,
  CATALOG_TAXONOMY,
  type NormalizedFields,
  type ExistingProductFields,
} from './normalize-row.ts';

// ─── Injected surface ─────────────────────────────────────────────────────

export interface ClaimedTask {
  id: string;
  payload: Record<string, unknown>;
}

export interface FeedBatchRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  storage_path: string;
  status: string;
  row_count: number | null;
  auto_count: number | null;
  review_count: number | null;
  commit_task_id?: string | null;
  error?: string | null;
}

export interface FeedItemToInsert {
  batch_id: string;
  row_index: number;
  source_row_hash: string;
  raw: Record<string, unknown>;
  normalized?: Record<string, unknown> | null;
  confidence?: number | null;
  field_confidence?: Record<string, number> | null;
  match_product_id?: string | null;
  action?: 'create' | 'update' | 'skip' | null;
  diff?: Record<string, unknown> | null;
  status: string;
  error?: string | null;
}

export interface InsertedFeedItem {
  id: string;
  source_row_hash: string;
}

export interface EnqueueTaskInput {
  taskType: string;
  status: 'queued' | 'awaiting_review';
  source: string;
  entityType?: string | null;
  entityId?: string | null;
  parentTaskId?: string | null;
  idempotencyKey: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface EnqueuedTask {
  id: string;
}

export interface EmbeddingVector {
  id: string;
  v: number[];
}

export interface NormalizerDeps {
  now(): Date;

  // queue
  claimNormalizeTasks(): Promise<ClaimedTask[]>;
  completeTask(
    id: string,
    outcome: 'done' | 'failed',
    patch: { artifacts?: Record<string, unknown>; error?: string; fatal?: boolean },
  ): Promise<boolean>;
  enqueueTask(input: EnqueueTaskInput): Promise<EnqueuedTask>;
  sweepStrandedBatchIds(): Promise<string[]>;

  // batches / items
  getBatch(id: string): Promise<FeedBatchRow | null>;
  updateBatch(id: string, patch: Record<string, unknown>): Promise<void>;
  listExistingFeedItemHashes(batchId: string): Promise<Set<string>>;
  insertFeedItems(rows: FeedItemToInsert[]): Promise<InsertedFeedItem[]>;

  // vendor products (dedupe universe)
  listVendorProducts(vendorId: string): Promise<Array<ExistingProductFields & { id: string }>>;

  // storage
  downloadFeed(storagePath: string): Promise<string>;

  // inference (batched <=16 per call upstream; this fn may be called
  // multiple times — see embedInBatches below)
  embedTexts(inputs: Array<{ id: string; text: string }>): Promise<EmbeddingVector[]>;

  // job log
  insertJobRun(values: Record<string, unknown>): Promise<string | number | null>;
  finishJobRun(id: string | number | null, patch: Record<string, unknown>): Promise<void>;
}

export interface BatchResult {
  itemsProcessed: number;
  autoCount: number;
  reviewCount: number;
  errorCount: number;
}

export interface NormalizerSummary {
  claimed: number;
  batchesOk: number;
  batchesFailed: number;
  itemsProcessed: number;
  autoTotal: number;
  reviewTotal: number;
  error: string | null;
}

const INFERENCE_MAX_BATCH = 16;
const AUTO_COMMIT_THRESHOLD = 0.9;
const DEDUPE_SIMILARITY_THRESHOLD = 0.92;

/** Embed a list of {id,text} inputs in chunks of INFERENCE_MAX_BATCH. */
async function embedInBatches(
  deps: NormalizerDeps,
  inputs: Array<{ id: string; text: string }>,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (inputs.length === 0) return out;
  for (let i = 0; i < inputs.length; i += INFERENCE_MAX_BATCH) {
    const chunk = inputs.slice(i, i + INFERENCE_MAX_BATCH);
    const vectors = await deps.embedTexts(chunk);
    for (const v of vectors) out.set(v.id, v.v);
  }
  return out;
}

/** Embed the taxonomy labels once (per call to processBatch). */
async function embedTaxonomy(deps: NormalizerDeps): Promise<Map<string, number[]>> {
  const inputs = CATALOG_TAXONOMY.map((t) => ({
    id: `${t.category}::${t.subcategory}`,
    text: t.label,
  }));
  return embedInBatches(deps, inputs);
}

const TEXT_FOR_EMBED = (n: Pick<NormalizedFields, 'name' | 'description'>) =>
  `${n.name} ${n.description ?? ''}`.trim();

const productText = (p: ExistingProductFields) => `${p.name} ${p.description ?? ''}`.trim();

/**
 * Normalize one feed batch. Reads + writes catalog_feed_items and
 * catalog_feed_batches, plus enqueues catalog_commit / catalog_review agent
 * tasks. Fully idempotent: a re-call against a batch whose rows are all
 * already present (by source_row_hash) performs ZERO writes and returns a
 * zero-count result — no re-download side effects beyond the read itself.
 */
export async function processBatch(deps: NormalizerDeps, batchId: string): Promise<BatchResult> {
  const batch = await deps.getBatch(batchId);
  if (!batch) throw new Error(`catalog-normalizer: batch ${batchId} not found`);

  const content = await deps.downloadFeed(batch.storage_path);
  const { rows } = parseFeed(content);

  const existingHashes = await deps.listExistingFeedItemHashes(batchId);
  const candidates: Array<{ rowIndex: number; raw: Record<string, string>; hash: string }> = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const hash = await stableRowHash(rows[idx]);
    if (existingHashes.has(hash)) continue; // already processed in a prior run — idempotent skip
    candidates.push({ rowIndex: idx, raw: rows[idx], hash });
  }

  if (candidates.length === 0) {
    // Nothing new. No writes at all — this is the idempotency guarantee a
    // second full run relies on.
    return { itemsProcessed: 0, autoCount: 0, reviewCount: 0, errorCount: 0 };
  }

  await deps.updateBatch(batchId, { status: 'normalizing' });

  const existingProducts = await deps.listVendorProducts(batch.vendor_id);

  const determined = candidates.map((c) => ({ ...c, det: normalizeRowDeterministic(c.raw) }));

  const classifiable = determined.filter(
    (d): d is typeof d & { det: Extract<typeof d.det, { ok: true }> } => d.det.ok,
  );

  const taxonomyVectors = await embedTaxonomy(deps);
  const rowVectors = await embedInBatches(
    deps,
    classifiable.map((d) => ({ id: d.hash, text: TEXT_FOR_EMBED(d.det.value) })),
  );
  const existingProductVectors = await embedInBatches(
    deps,
    existingProducts.map((p) => ({ id: p.id, text: productText(p) })),
  );

  const itemRows: FeedItemToInsert[] = [];
  const reviewTargets: Array<{
    hash: string;
    itemName: string;
    normalized: Record<string, unknown>;
    fieldConfidence: Record<string, number>;
    diff: Record<string, unknown> | null;
  }> = [];
  let autoCount = 0;
  let reviewCount = 0;
  let errorCount = 0;

  for (const d of determined) {
    if (!d.det.ok) {
      itemRows.push({
        batch_id: batchId,
        row_index: d.rowIndex,
        source_row_hash: d.hash,
        raw: d.raw,
        status: 'error',
        error: d.det.error,
      });
      errorCount++;
      continue;
    }

    const normalized = d.det.value;
    const rowVector = rowVectors.get(d.hash);
    const cls = classifyCategory(rowVector, taxonomyVectors);

    // Dedupe: vendor_sku exact match first, then embedding similarity.
    let action: 'create' | 'update' = 'create';
    let matchProductId: string | null = null;
    let diff: Record<string, unknown> | null = null;

    const skuMatch = normalized.vendor_sku
      ? existingProducts.find((p) => p.vendor_sku != null && p.vendor_sku === normalized.vendor_sku)
      : undefined;

    if (skuMatch) {
      action = 'update';
      matchProductId = skuMatch.id;
      diff = buildFieldDiff(skuMatch, normalized, d.det.fieldConfidence, cls.category);
    } else if (rowVector) {
      let best: { id: string; sim: number } | null = null;
      for (const p of existingProducts) {
        const pv = existingProductVectors.get(p.id);
        if (!pv) continue;
        const sim = cosineSimilarity(rowVector, pv);
        if (!best || sim > best.sim) best = { id: p.id, sim };
      }
      if (best && best.sim > DEDUPE_SIMILARITY_THRESHOLD) {
        action = 'update';
        matchProductId = best.id;
        const matched = existingProducts.find((p) => p.id === best!.id)!;
        diff = buildFieldDiff(matched, normalized, d.det.fieldConfidence, cls.category);
      }
    }

    const fieldConfidence: Record<string, number> = {
      ...d.det.fieldConfidence,
      category: cls.confidence,
    };
    const confidence = Math.min(
      fieldConfidence.name ?? 0,
      fieldConfidence.price ?? 0,
      fieldConfidence.category ?? 0,
    );

    const normalizedOut = {
      ...normalized,
      category: cls.category,
      subcategory: cls.subcategory,
    };

    if (confidence >= AUTO_COMMIT_THRESHOLD) {
      itemRows.push({
        batch_id: batchId,
        row_index: d.rowIndex,
        source_row_hash: d.hash,
        raw: d.raw,
        normalized: normalizedOut,
        confidence,
        field_confidence: fieldConfidence,
        match_product_id: matchProductId,
        action,
        diff,
        status: 'normalized',
      });
      autoCount++;
    } else {
      itemRows.push({
        batch_id: batchId,
        row_index: d.rowIndex,
        source_row_hash: d.hash,
        raw: d.raw,
        normalized: normalizedOut,
        confidence,
        field_confidence: fieldConfidence,
        match_product_id: matchProductId,
        action,
        diff,
        status: 'review_queued',
      });
      reviewCount++;
      reviewTargets.push({
        hash: d.hash,
        itemName: normalized.name,
        normalized: normalizedOut,
        fieldConfidence,
        diff,
      });
    }
  }

  const inserted = await deps.insertFeedItems(itemRows);
  const idByHash = new Map(inserted.map((i) => [i.source_row_hash, i.id]));

  const sampleRows = itemRows.slice(0, 3).map((r) => ({
    row_index: r.row_index,
    raw: r.raw,
    normalized: r.normalized ?? null,
    status: r.status,
  }));

  const commitTask = await deps.enqueueTask({
    taskType: 'catalog_commit',
    status: 'awaiting_review',
    source: 'job:catalog-normalizer',
    entityType: 'catalog_feed_batch',
    entityId: batchId,
    idempotencyKey: `catalog_commit:${batchId}`,
    summary: `Commit batch ${batch.vendor_name}: ${autoCount} auto / ${reviewCount} review`,
    payload: { batch_id: batchId, auto_count: autoCount, review_count: reviewCount, sample_rows: sampleRows },
  });

  for (const rt of reviewTargets) {
    const itemId = idByHash.get(rt.hash);
    if (!itemId) continue; // row already existed (shouldn't happen post-filter, but stay defensive)
    const lowFields = Object.entries(rt.fieldConfidence)
      .filter(([, v]) => (v as number) < AUTO_COMMIT_THRESHOLD)
      .map(([k]) => k);
    await deps.enqueueTask({
      taskType: 'catalog_review',
      status: 'awaiting_review',
      source: 'job:catalog-normalizer',
      entityType: 'catalog_feed_item',
      entityId: itemId,
      parentTaskId: commitTask.id,
      idempotencyKey: `catalog_review:${itemId}`,
      summary: `${rt.itemName} — low-confidence fields: ${lowFields.join(', ') || 'unknown'}`,
      payload: {
        batch_id: batchId,
        item_id: itemId,
        normalized: rt.normalized,
        field_confidence: rt.fieldConfidence,
        diff: rt.diff,
      },
    });
  }

  await deps.updateBatch(batchId, {
    status: 'awaiting_approval',
    commit_task_id: commitTask.id,
    row_count: (batch.row_count ?? 0) + candidates.length,
    auto_count: (batch.auto_count ?? 0) + autoCount,
    review_count: (batch.review_count ?? 0) + reviewCount,
  });

  return { itemsProcessed: candidates.length, autoCount, reviewCount, errorCount };
}

/** The full claim -> process -> complete -> job_runs loop. index.ts's entrypoint. */
export async function runNormalizer(deps: NormalizerDeps): Promise<NormalizerSummary> {
  const startedAt = deps.now().toISOString();
  const runId = await deps.insertJobRun({ job_name: 'catalog-normalizer', status: 'running', started_at: startedAt });

  let claimed = 0;
  let batchesOk = 0;
  let batchesFailed = 0;
  let itemsProcessed = 0;
  let autoTotal = 0;
  let reviewTotal = 0;
  let errorText: string | null = null;

  try {
    // Sweep stranded batches into the queue (idempotent via idempotency_key).
    const stranded = await deps.sweepStrandedBatchIds();
    for (const batchId of stranded) {
      await deps.enqueueTask({
        taskType: 'normalize_feed',
        status: 'queued',
        source: 'job:catalog-normalizer',
        entityType: 'catalog_feed_batch',
        entityId: batchId,
        idempotencyKey: `normalize_feed:${batchId}`,
        summary: `Normalize feed batch ${batchId}`,
        payload: { batch_id: batchId },
      });
    }

    const tasks = await deps.claimNormalizeTasks();
    claimed = tasks.length;

    for (const task of tasks) {
      const batchId = task.payload?.batch_id as string | undefined;
      if (!batchId) {
        const completed = await deps.completeTask(task.id, 'failed', {
          error: 'normalize_feed task missing payload.batch_id',
          fatal: true,
        });
        if (completed) batchesFailed++;
        continue;
      }
      try {
        const result = await processBatch(deps, batchId);
        const completed = await deps.completeTask(task.id, 'done', {
          artifacts: { batch_id: batchId, ...result },
        });
        if (completed) {
          itemsProcessed += result.itemsProcessed;
          autoTotal += result.autoCount;
          reviewTotal += result.reviewCount;
          batchesOk++;
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        await deps.updateBatch(batchId, { status: 'failed', error: msg });
        const completed = await deps.completeTask(task.id, 'failed', { error: msg });
        if (completed) batchesFailed++;
      }
    }
  } catch (e) {
    errorText = (e as Error)?.message ?? String(e);
  }

  await deps.finishJobRun(runId, {
    status: errorText ? 'failed' : 'succeeded',
    finished_at: deps.now().toISOString(),
    detail: { claimed, batchesOk, batchesFailed, itemsProcessed, autoTotal, reviewTotal },
    error: errorText,
  });

  return { claimed, batchesOk, batchesFailed, itemsProcessed, autoTotal, reviewTotal, error: errorText };
}
