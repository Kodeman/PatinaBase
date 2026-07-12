/// <reference lib="deno.ns" />
// ^ The monorepo root tsconfig.json sets lib: [ES2022, DOM] which Deno >= 2.4
// picks up, clobbering the `Deno` global during type-check — the reference
// restores it (same issue documented in aesthete-dna-draft/index.test.ts).
//
// Golden-file test for the Catalog Normalizer (WP-2.4) orchestration
// (catalog-normalizer/core.ts: processBatch + runNormalizer). Inference is
// fully mocked with canned vectors (see the embedding-space section below);
// storage/DB are a small in-memory fake tailored to core.ts's NormalizerDeps
// contract. No live stack, no network, no real supabase-js. Run:
//   deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/catalog-normalizer.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  processBatch,
  runNormalizer,
  type EnqueueTaskInput,
  type EnqueuedTask,
  type FeedBatchRow,
  type FeedItemToInsert,
  type InsertedFeedItem,
  type NormalizerDeps,
} from '../catalog-normalizer/core.ts';
import { CATALOG_TAXONOMY, type ExistingProductFields } from '../catalog-normalizer/normalize-row.ts';
import expected from '../catalog-normalizer/fixtures/expected.json' with { type: 'json' };

const FIXTURES_DIR = new URL('../catalog-normalizer/fixtures/', import.meta.url);
const GOLDEN_CSV = await Deno.readTextFile(new URL('golden-feed.csv', FIXTURES_DIR));

const VENDOR_ID = 'vendor-acme';
const VENDOR_NAME = 'Acme Furniture Co';
const BATCH_ID = 'batch-golden-1';

// ─── Deterministic mock embedding space ────────────────────────────────────
//
// dim 20: [0..14] = one-hot "category signal" (index matches CATALOG_TAXONOMY
// order), [15..19] = a 5-slot "identity fingerprint" so two listings can be
// made to cosine-match on purpose. CAT_WEIGHT/FP_WEIGHT are tuned so that,
// for any row vector v = CAT_WEIGHT*e_cat + FP_WEIGHT*e_fp and pure one-hot
// taxonomy vectors t_cat = e_cat:
//   (a) cosine(v, t_cat) = CAT_WEIGHT/sqrt(CAT_WEIGHT^2+FP_WEIGHT^2) >= 0.9
//       — keeps the 6 "clean" rows' category confidence auto-eligible.
//   (b) cosine(two DIFFERENT products, same category, different fp slot)
//       = CAT_WEIGHT^2/(CAT_WEIGHT^2+FP_WEIGHT^2) < 0.92
//       — no accidental embedding-dedupe between unrelated same-category rows.
//   (c) cosine(two representations sharing a category AND an fp slot) = 1.0
//       — the intentional embedding-based dupe (row 10 / existing product P2).
// With CAT_WEIGHT=2.8, FP_WEIGHT=1.0: (a) = 0.9418, (b) = 0.8869, (c) = 1.0.
const DIM = 20;
const CAT_WEIGHT = 2.8;
const FP_WEIGHT = 1.0;

function categoryIndex(category: string, subcategory: string): number {
  const idx = CATALOG_TAXONOMY.findIndex((t) => t.category === category && t.subcategory === subcategory);
  if (idx < 0) throw new Error(`fixture bug: unknown taxonomy leaf ${category}::${subcategory}`);
  return idx;
}

function productVector(category: string, subcategory: string, fpSlot: number | null): number[] {
  const v = new Array(DIM).fill(0);
  v[categoryIndex(category, subcategory)] = CAT_WEIGHT;
  if (fpSlot != null) v[15 + fpSlot] = FP_WEIGHT;
  return v;
}

function taxonomyVector(category: string, subcategory: string): number[] {
  const v = new Array(DIM).fill(0);
  v[categoryIndex(category, subcategory)] = 1;
  return v;
}

const vectorByText = new Map<string, number[]>();
for (const t of CATALOG_TAXONOMY) {
  vectorByText.set(t.label, taxonomyVector(t.category, t.subcategory));
}

// Row texts are exactly `${name} ${description}`.trim() (core.ts's
// TEXT_FOR_EMBED), which must match the golden-feed.csv name/description
// columns verbatim.
vectorByText.set('Chesterfield Sofa Deep-seat leather sofa with rolled arms', productVector('seating', 'sofas', 0));
vectorByText.set('Windsor Dining Chair Turned-leg dining chair', productVector('seating', 'dining-chairs', 1));
vectorByText.set('Oslo Coffee Table Live-edge walnut coffee table', productVector('tables', 'coffee-tables', 2));
vectorByText.set('Marlowe Pendant Light Brass dome pendant', productVector('lighting', 'pendants', 3));
vectorByText.set('Harlow Sideboard Oak sideboard with brass pulls', productVector('storage', 'cabinets', 4));
vectorByText.set('Sutton Area Rug Hand-knotted wool rug', productVector('textiles', 'rugs', 0));
vectorByText.set('Bergen Accent Chair Upholstered swivel chair', productVector('seating', 'chairs', 1));
vectorByText.set('Prairie Console Table Narrow entry console', productVector('tables', 'side-tables', 2));
vectorByText.set('Denver Floor Lamp Adjustable arc floor lamp', productVector('lighting', 'lamps', 3));
vectorByText.set('Chesterfield Sofa II Restock of the classic chesterfield', productVector('seating', 'sofas', 4));
vectorByText.set(
  'Oslo Coffee Table Mk2 Second edition of the Oslo coffee table',
  productVector('tables', 'coffee-tables', 0),
);

// Existing vendor products (the dedupe universe). P1 is matched via exact
// vendor_sku; P2 is matched via embedding similarity (shares fp slot 0 with
// "Oslo Coffee Table Mk2" above) — deliberately NOT via sku (P2.vendor_sku is
// null). Descriptions are null so productText() trims to just the name.
vectorByText.set('Chesterfield Sofa II', productVector('seating', 'sofas', 1)); // P1 — different fp slot than the row; sku match short-circuits embedding anyway
vectorByText.set('Oslo Coffee Table Classic', productVector('tables', 'coffee-tables', 0)); // P2 — same fp slot as row 10

const EXISTING_PRODUCTS: Array<ExistingProductFields & { id: string; vendor_id: string }> = [
  {
    id: 'prod-p1-chesterfield-ii',
    vendor_id: VENDOR_ID,
    name: 'Chesterfield Sofa II',
    description: null,
    vendor_sku: 'ACME-SOFA-010',
    price_retail: 129900, // old $1,299.00 -> feed row bumps to $1,349.00
    price_trade: 99900, // old $999.00 -> feed row bumps to $1,049.00
    dimensions: { width: 84, height: 34, depth: 38, unit: 'in' },
    materials: ['leather'],
    finishes: [],
    freight_class: 'class-150',
    lead_time_weeks: 8,
    category: 'seating',
  },
  {
    id: 'prod-p2-oslo-classic',
    vendor_id: VENDOR_ID,
    name: 'Oslo Coffee Table Classic', // differs from the feed row's name -> expect a name diff too
    description: null,
    vendor_sku: null,
    price_retail: 59900, // old $599.00 -> feed row bumps to $649.00
    price_trade: null,
    dimensions: { width: 48, height: 16, depth: 24, unit: 'in' },
    materials: ['walnut'],
    finishes: [],
    freight_class: 'class-125',
    lead_time_weeks: 6,
    category: 'tables',
  },
];

// ─── In-memory fake store + NormalizerDeps ─────────────────────────────────

interface FakeTask {
  id: string;
  task_type: string;
  status: string;
  entity_type: string | null;
  entity_id: string | null;
  parent_task_id: string | null;
  idempotency_key: string;
  summary: string;
  payload: Record<string, unknown>;
}

interface Store {
  batch: FeedBatchRow;
  items: Array<FeedItemToInsert & { id: string }>;
  tasks: FakeTask[];
}

function makeStore(): Store {
  return {
    batch: {
      id: BATCH_ID,
      vendor_id: VENDOR_ID,
      vendor_name: VENDOR_NAME,
      storage_path: `${VENDOR_ID}/${BATCH_ID}.csv`,
      status: 'received',
      row_count: null,
      auto_count: null,
      review_count: null,
    },
    items: [],
    tasks: [],
  };
}

function makeDeps(store: Store): NormalizerDeps {
  let nextItemId = 1;
  return {
    now: () => new Date('2026-07-12T09:45:00Z'),

    claimNormalizeTasks: async () => [],
    completeTask: async () => {},
    enqueueTask: async (input: EnqueueTaskInput): Promise<EnqueuedTask> => {
      const dup = store.tasks.find((t) => t.idempotency_key === input.idempotencyKey);
      if (dup) return { id: dup.id };
      const id = `task-${store.tasks.length + 1}`;
      store.tasks.push({
        id,
        task_type: input.taskType,
        status: input.status,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        parent_task_id: input.parentTaskId ?? null,
        idempotency_key: input.idempotencyKey,
        summary: input.summary,
        payload: input.payload,
      });
      return { id };
    },
    sweepStrandedBatchIds: async () => [],

    getBatch: async (id) => (id === store.batch.id ? { ...store.batch } : null),
    updateBatch: async (id, patch) => {
      if (id !== store.batch.id) throw new Error(`updateBatch: unknown batch ${id}`);
      Object.assign(store.batch, patch);
    },
    listExistingFeedItemHashes: async (batchId) =>
      new Set(store.items.filter((i) => i.batch_id === batchId).map((i) => i.source_row_hash)),
    insertFeedItems: async (rows: FeedItemToInsert[]): Promise<InsertedFeedItem[]> => {
      const out: InsertedFeedItem[] = [];
      for (const r of rows) {
        const id = `item-${nextItemId++}`;
        store.items.push({ ...r, id });
        out.push({ id, source_row_hash: r.source_row_hash });
      }
      return out;
    },

    listVendorProducts: async (vendorId) =>
      vendorId === VENDOR_ID ? EXISTING_PRODUCTS.map((p) => ({ ...p })) : [],

    downloadFeed: async (path) => {
      if (path !== store.batch.storage_path) throw new Error(`downloadFeed: unexpected path ${path}`);
      return GOLDEN_CSV;
    },

    embedTexts: async (inputs) =>
      inputs.map((i) => {
        const v = vectorByText.get(i.text);
        if (!v) throw new Error(`no mocked vector for embed text: ${JSON.stringify(i.text)}`);
        return { id: i.id, v };
      }),

    insertJobRun: async () => null,
    finishJobRun: async () => {},
  };
}

// ─── Golden-file assertions ─────────────────────────────────────────────────

Deno.test('catalog-normalizer golden feed: exact auto/review split, normalized values, diff shapes, task intents', async () => {
  const store = makeStore();
  const deps = makeDeps(store);

  const result = await processBatch(deps, BATCH_ID);

  assertEquals(result.itemsProcessed, expected.itemsProcessed, 'itemsProcessed');
  assertEquals(result.autoCount, expected.autoCount, 'autoCount');
  assertEquals(result.reviewCount, expected.reviewCount, 'reviewCount');
  assertEquals(result.errorCount, expected.errorCount, 'errorCount');
  assertEquals(store.items.length, expected.itemsProcessed, 'catalog_feed_items row count');

  for (const exp of expected.rows) {
    const item = store.items.find((i) => i.row_index === exp.rowIndex);
    assert(item, `missing catalog_feed_items row for rowIndex ${exp.rowIndex}`);
    assertEquals(item!.status, exp.status, `rowIndex ${exp.rowIndex} status`);

    if (exp.status === 'error') continue;

    assertEquals(item!.action, exp.action, `rowIndex ${exp.rowIndex} action`);

    const normalized = item!.normalized as Record<string, unknown>;
    assertEquals(normalized.name, exp.name, `rowIndex ${exp.rowIndex} normalized.name`);
    assertEquals(
      normalized.price_retail_cents,
      exp.priceRetailCents,
      `rowIndex ${exp.rowIndex} normalized.price_retail_cents`,
    );

    if ('dimensionsNull' in exp) {
      assertEquals(
        normalized.dimensions === null,
        exp.dimensionsNull,
        `rowIndex ${exp.rowIndex} normalized.dimensions null-ness`,
      );
    }

    const fieldConfidence = item!.field_confidence as Record<string, number>;
    const lowFields = Object.entries(fieldConfidence)
      .filter(([, v]) => v < 0.9)
      .map(([k]) => k)
      .sort();
    assertEquals(
      lowFields,
      [...(exp.lowConfidenceFields ?? [])].sort(),
      `rowIndex ${exp.rowIndex} low-confidence fields`,
    );

    if (exp.matchKind === 'sku') {
      assertEquals(item!.match_product_id, 'prod-p1-chesterfield-ii', `rowIndex ${exp.rowIndex} sku match`);
    } else if (exp.matchKind === 'embedding') {
      assertEquals(item!.match_product_id, 'prod-p2-oslo-classic', `rowIndex ${exp.rowIndex} embedding match`);
    } else {
      assertEquals(item!.match_product_id, null, `rowIndex ${exp.rowIndex} should have no match`);
    }

    if (exp.diffFields) {
      const diff = item!.diff as Record<string, { old: unknown; new: unknown; confidence: number }>;
      assertEquals(Object.keys(diff).sort(), [...exp.diffFields].sort(), `rowIndex ${exp.rowIndex} diff field set`);
      for (const [field, entry] of Object.entries(diff)) {
        assert(entry.confidence >= 0 && entry.confidence <= 1, `rowIndex ${exp.rowIndex} diff.${field}.confidence in range`);
        assert(JSON.stringify(entry.old) !== JSON.stringify(entry.new), `rowIndex ${exp.rowIndex} diff.${field} old!=new`);
      }
    } else if (exp.action === 'create') {
      assertEquals(item!.diff, null, `rowIndex ${exp.rowIndex} create rows carry no diff`);
    }
  }

  // ── catalog_commit — exactly one per batch, created after row processing. ──
  const commitTasks = store.tasks.filter((t) => t.task_type === 'catalog_commit');
  assertEquals(commitTasks.length, 1, 'exactly one catalog_commit task');
  const commitTask = commitTasks[0];
  assertEquals(commitTask.status, 'awaiting_review');
  assertEquals(commitTask.idempotency_key, `catalog_commit:${BATCH_ID}`);
  assertEquals(commitTask.entity_type, 'catalog_feed_batch');
  assertEquals(commitTask.entity_id, BATCH_ID);
  assert(commitTask.summary.includes(VENDOR_NAME), commitTask.summary);
  assert(commitTask.summary.includes(`${expected.autoCount} auto`), commitTask.summary);
  assert(commitTask.summary.includes(`${expected.reviewCount} review`), commitTask.summary);
  assertEquals((commitTask.payload as Record<string, unknown>).auto_count, expected.autoCount);
  assertEquals((commitTask.payload as Record<string, unknown>).review_count, expected.reviewCount);
  assert(Array.isArray((commitTask.payload as Record<string, unknown>).sample_rows));

  // ── catalog_review — one per review_queued row, parented to the commit task. ──
  const reviewTasks = store.tasks.filter((t) => t.task_type === 'catalog_review');
  assertEquals(reviewTasks.length, expected.reviewCount, 'one catalog_review task per review_queued row');
  const reviewRow = store.items.find((i) => i.status === 'review_queued')!;
  const reviewTask = reviewTasks[0];
  assertEquals(reviewTask.entity_type, 'catalog_feed_item');
  assertEquals(reviewTask.entity_id, reviewRow.id);
  assertEquals(reviewTask.parent_task_id, commitTask.id, 'catalog_review parent is the batch commit task');
  assertEquals(reviewTask.idempotency_key, `catalog_review:${reviewRow.id}`);
  assertEquals(reviewTask.status, 'awaiting_review');
  assert(reviewTask.summary.includes('Denver Floor Lamp'), reviewTask.summary);
  assert(reviewTask.summary.includes('price'), reviewTask.summary);
  assertEquals((reviewTask.payload as Record<string, unknown>).batch_id, BATCH_ID);
  assertEquals((reviewTask.payload as Record<string, unknown>).item_id, reviewRow.id);

  // ── Batch bookkeeping. ──
  assertEquals(store.batch.status, 'awaiting_approval');
  assertEquals(store.batch.commit_task_id, commitTask.id);
  assertEquals(store.batch.row_count, expected.itemsProcessed);
  assertEquals(store.batch.auto_count, expected.autoCount);
  assertEquals(store.batch.review_count, expected.reviewCount);

  // ── Idempotency: a second FULL run performs ZERO new writes/tasks. ──
  const itemsBefore = store.items.length;
  const tasksBefore = store.tasks.length;
  const batchSnapshotBefore = { ...store.batch };

  const rerun = await processBatch(deps, BATCH_ID);

  assertEquals(rerun.itemsProcessed, 0, 'rerun itemsProcessed');
  assertEquals(rerun.autoCount, 0, 'rerun autoCount');
  assertEquals(rerun.reviewCount, 0, 'rerun reviewCount');
  assertEquals(rerun.errorCount, 0, 'rerun errorCount');
  assertEquals(store.items.length, itemsBefore, 'rerun must not insert new catalog_feed_items rows');
  assertEquals(store.tasks.length, tasksBefore, 'rerun must not enqueue new agent tasks');
  assertEquals(store.batch, batchSnapshotBefore, 'rerun must not touch the batch row');
});

// ─── runNormalizer: sweep -> claim -> process -> complete plumbing ─────────

Deno.test('runNormalizer: sweeps a stranded batch, claims it, processes it, completes the task', async () => {
  const store = makeStore();
  const baseDeps = makeDeps(store);
  let claimedCount = 0;
  const completedOutcomes: string[] = [];

  const deps: NormalizerDeps = {
    ...baseDeps,
    sweepStrandedBatchIds: async () => [store.batch.id],
    claimNormalizeTasks: async () => {
      const task = store.tasks.find((t) => t.task_type === 'normalize_feed' && t.status === 'queued');
      if (!task) return [];
      claimedCount++;
      return [{ id: task.id, payload: { batch_id: store.batch.id } }];
    },
    completeTask: async (_id, outcome) => {
      completedOutcomes.push(outcome);
    },
  };

  const summary = await runNormalizer(deps);

  assertEquals(claimedCount, 1, 'the swept normalize_feed task should be claimed exactly once');
  assertEquals(completedOutcomes, ['done']);
  assertEquals(summary.claimed, 1);
  assertEquals(summary.batchesOk, 1);
  assertEquals(summary.batchesFailed, 0);
  assertEquals(summary.error, null);
  assertEquals(summary.autoTotal, expected.autoCount);
  assertEquals(summary.reviewTotal, expected.reviewCount);

  // Sweep enqueues exactly one normalize_feed task (idempotency_key dedupe).
  const normalizeFeedTasks = store.tasks.filter((t) => t.task_type === 'normalize_feed');
  assertEquals(normalizeFeedTasks.length, 1);
});

Deno.test('runNormalizer: a task missing payload.batch_id fails fatally without throwing', async () => {
  const store = makeStore();
  const baseDeps = makeDeps(store);
  const failed: Array<{ error?: string; fatal?: boolean }> = [];

  const deps: NormalizerDeps = {
    ...baseDeps,
    claimNormalizeTasks: async () => [{ id: 'task-broken', payload: {} }],
    completeTask: async (_id, outcome, patch) => {
      assertEquals(outcome, 'failed');
      failed.push(patch);
    },
  };

  const summary = await runNormalizer(deps);
  assertEquals(summary.batchesFailed, 1);
  assertEquals(summary.batchesOk, 0);
  assertEquals(failed.length, 1);
  assertEquals(failed[0].fatal, true);
});
