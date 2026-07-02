// Deno tests for the portfolio_embed drain (Wave 4B, 00249) — fake db +
// fake inference + fake signer, no network.
// Run: deno test --allow-all supabase/functions/aesthete-embed-worker/
//
// Covers:
//   • http(s) storage_path embeds verbatim (no signer call)
//   • bucket path goes through the signed-URL factory (private bucket)
//   • success → item embedding + status='embedded', job done, and
//     recompute_portfolio_centroid called ONCE per touched designer
//   • signer failure → job failed (retryable via 00241 ladder), item
//     untouched below the park threshold
//   • terminal park (attempts ≥ 5) additionally flips item status='failed'
//   • missing item row → job failed
//   • centroid RPC failure is logged, never fatal (nightly sweep recovers)
//   • directPortfolioUrl() edge cases

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { type AestheteJob, type EmbedImageInput, InferenceError, toPgVector } from '../_shared/aesthete.ts';
import {
  directPortfolioUrl,
  PORTFOLIO_BUCKET,
  type PortfolioItemRow,
  runEmbedBatch,
} from './lib.ts';

// ─── fixtures ────────────────────────────────────────────────────────────────

let jobSeq = 100;
function pJob(itemId: string, designerId: string, attempts = 1): AestheteJob {
  return {
    id: ++jobSeq,
    kind: 'portfolio_embed',
    product_id: null,
    payload: { portfolio_item_id: itemId, designer_id: designerId },
    dedupe_key: `${itemId}:portfolio_embed:r1`,
    status: 'running',
    attempts,
    run_after: null,
    last_error: null,
    created_at: null,
    completed_at: null,
  };
}

function item(id: string, designerId: string, storagePath: string): PortfolioItemRow {
  return { id, designer_id: designerId, storage_path: storagePath, status: 'pending' };
}

const IMAGE_VEC = [0.6, 0.8, 0];

interface FakeOpts {
  jobs: AestheteJob[];
  items: PortfolioItemRow[];
  imageVec?: (input: EmbedImageInput) => number[] | { error: string };
  throwOnImage?: boolean;
  failCentroidFor?: string[];
  signer?: 'ok' | 'fail' | 'absent';
}

function makeFake(opts: FakeOpts) {
  const completions: { id: number; status: string; reason: string | null }[] = [];
  const updates: { table: string; id: string; patch: Record<string, unknown> }[] = [];
  const centroidCalls: string[] = [];
  const signCalls: { bucket: string; path: string }[] = [];
  const imageCalls: EmbedImageInput[][] = [];
  const logs: { event: string; fields?: Record<string, unknown> }[] = [];

  const db = {
    rpc(fn: string, args?: Record<string, unknown>) {
      if (fn === 'claim_aesthete_jobs') {
        const kind = String(args?.p_kind);
        return Promise.resolve({
          data: kind === 'portfolio_embed' ? opts.jobs : [],
          error: null,
        });
      }
      if (fn === 'complete_aesthete_job') {
        completions.push({
          id: Number(args?.p_id),
          status: String(args?.p_status),
          reason: (args?.p_error as string | null) ?? null,
        });
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === 'recompute_portfolio_centroid') {
        const did = String(args?.p_designer_id);
        centroidCalls.push(did);
        if (opts.failCentroidFor?.includes(did)) {
          return Promise.resolve({ data: null, error: { message: 'centroid boom' } });
        }
        return Promise.resolve({
          data: { designer_id: did, updated: true, n_items: 2, method: 'mean' },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    },
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            in(_col: string, ids: string[]) {
              const rows = table === 'designer_portfolio_items'
                ? opts.items.filter((i) => ids.includes(i.id))
                : [];
              return Promise.resolve({ data: rows as unknown[], error: null });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              updates.push({ table, id, patch });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  const inference = {
    embedText(_inputs: unknown[]) {
      return Promise.resolve({ model_version: 'test', vectors: [], errors: [] });
    },
    embedImage(inputs: EmbedImageInput[]) {
      imageCalls.push(inputs);
      if (opts.throwOnImage) {
        return Promise.reject(new InferenceError('inference /embed/image at capacity (429)', true, 429));
      }
      const vectors = [];
      const errors = [];
      for (const input of inputs) {
        const out = (opts.imageVec ?? (() => IMAGE_VEC))(input);
        if (Array.isArray(out)) vectors.push({ id: input.id, dim: out.length, v: out });
        else errors.push({ id: input.id, reason: out.error });
      }
      return Promise.resolve({ model_version: 'test', vectors, errors });
    },
    healthz() {
      return Promise.resolve({
        status: 'ok',
        model_version: 'test',
        text_dim: 3,
        image_dim: 3,
        warmed: true,
      });
    },
  };

  const signUrl = opts.signer === 'absent' ? undefined : (
    bucket: string,
    path: string,
    _ttl: number,
  ) => {
    signCalls.push({ bucket, path });
    if (opts.signer === 'fail') {
      return Promise.resolve({ url: null, error: 'Object not found' });
    }
    return Promise.resolve({ url: `https://signed.test/${bucket}/${path}?token=x`, error: null });
  };

  const run = () =>
    runEmbedBatch({
      // deno-lint-ignore no-explicit-any
      db: db as any,
      // deno-lint-ignore no-explicit-any
      inference: inference as any,
      batchSize: 16,
      signUrl,
      log: (event, fields) => logs.push({ event, fields }),
    });

  return { run, completions, updates, centroidCalls, signCalls, imageCalls, logs };
}

// ─── directPortfolioUrl ──────────────────────────────────────────────────────

Deno.test('directPortfolioUrl: http(s) verbatim, bucket paths null', () => {
  assertEquals(directPortfolioUrl('https://images.test/a.jpg'), 'https://images.test/a.jpg');
  assertEquals(directPortfolioUrl('HTTP://images.test/a.jpg'), 'HTTP://images.test/a.jpg');
  assertEquals(directPortfolioUrl('uid-123/leah-01.jpg'), null);
  assertEquals(directPortfolioUrl('aesthete-demo/portfolio/leah-01.jpg'), null);
});

// ─── drain behavior ──────────────────────────────────────────────────────────

Deno.test('portfolio drain: http URL embeds verbatim, writes embedding + status, recomputes centroid once per designer', async () => {
  const f = makeFake({
    jobs: [
      pJob('item-1', 'designer-A'),
      pJob('item-2', 'designer-A'),
    ],
    items: [
      item('item-1', 'designer-A', 'https://images.test/one.jpg'),
      item('item-2', 'designer-A', 'https://images.test/two.jpg'),
    ],
    signer: 'ok',
  });

  const r = await f.run();
  assertEquals(r.kinds.portfolio_embed, { claimed: 2, done: 2, failed: 0 });
  // verbatim: signer never consulted for http paths
  assertEquals(f.signCalls.length, 0);
  assertEquals(f.imageCalls[0].map((i) => i.url), [
    'https://images.test/one.jpg',
    'https://images.test/two.jpg',
  ]);
  // both items embedded
  const itemUpdates = f.updates.filter((u) => u.table === 'designer_portfolio_items');
  assertEquals(itemUpdates.length, 2);
  assertEquals(itemUpdates[0].patch.status, 'embedded');
  assertEquals(itemUpdates[0].patch.embedding, toPgVector(IMAGE_VEC));
  // ONE centroid recompute for the single touched designer
  assertEquals(f.centroidCalls, ['designer-A']);
  assert(f.logs.some((l) => l.event === 'portfolio_centroid_recomputed'));
});

Deno.test('portfolio drain: bucket path goes through the signer', async () => {
  const f = makeFake({
    jobs: [pJob('item-1', 'designer-A')],
    items: [item('item-1', 'designer-A', 'designer-A/loft.jpg')],
    signer: 'ok',
  });

  const r = await f.run();
  assertEquals(r.kinds.portfolio_embed, { claimed: 1, done: 1, failed: 0 });
  assertEquals(f.signCalls, [{ bucket: PORTFOLIO_BUCKET, path: 'designer-A/loft.jpg' }]);
  assertStringIncludes(f.imageCalls[0][0].url, 'https://signed.test/portfolio-items/');
});

Deno.test('portfolio drain: signer failure fails the job, item row untouched below park threshold', async () => {
  const f = makeFake({
    jobs: [pJob('item-1', 'designer-A', 1)],
    items: [item('item-1', 'designer-A', 'designer-A/loft.jpg')],
    signer: 'fail',
  });

  const r = await f.run();
  assertEquals(r.kinds.portfolio_embed, { claimed: 1, done: 0, failed: 1 });
  assertEquals(f.completions[0].status, 'failed');
  assertStringIncludes(f.completions[0].reason ?? '', 'signed URL failed');
  // item stays 'pending' — the 00241 ladder will retry
  assertEquals(f.updates.filter((u) => u.table === 'designer_portfolio_items').length, 0);
  assertEquals(f.centroidCalls.length, 0);
});

Deno.test('portfolio drain: terminal park (attempts ≥ 5) flips the item to failed', async () => {
  const f = makeFake({
    jobs: [pJob('item-1', 'designer-A', 5)],
    items: [item('item-1', 'designer-A', 'designer-A/loft.jpg')],
    signer: 'fail',
  });

  const r = await f.run();
  assertEquals(r.kinds.portfolio_embed, { claimed: 1, done: 0, failed: 1 });
  const statusUpdates = f.updates.filter((u) => u.table === 'designer_portfolio_items');
  assertEquals(statusUpdates.length, 1);
  assertEquals(statusUpdates[0].patch, { status: 'failed' });
});

Deno.test('portfolio drain: missing item row fails the job', async () => {
  const f = makeFake({
    jobs: [pJob('gone-item', 'designer-A')],
    items: [],
    signer: 'ok',
  });

  const r = await f.run();
  assertEquals(r.kinds.portfolio_embed, { claimed: 1, done: 0, failed: 1 });
  assertStringIncludes(f.completions[0].reason ?? '', 'portfolio item not found');
});

Deno.test('portfolio drain: absent signer is a config failure for bucket paths only', async () => {
  const f = makeFake({
    jobs: [
      pJob('item-1', 'designer-A'),
      pJob('item-2', 'designer-B'),
    ],
    items: [
      item('item-1', 'designer-A', 'designer-A/loft.jpg'),
      item('item-2', 'designer-B', 'https://images.test/two.jpg'),
    ],
    signer: 'absent',
  });

  const r = await f.run();
  assertEquals(r.kinds.portfolio_embed, { claimed: 2, done: 1, failed: 1 });
  const failed = f.completions.find((c) => c.status === 'failed');
  assertStringIncludes(failed?.reason ?? '', 'no signed-url factory');
  assertEquals(f.centroidCalls, ['designer-B']);
});

Deno.test('portfolio drain: whole-request 429 fails every job retryably; nothing embedded', async () => {
  const f = makeFake({
    jobs: [pJob('item-1', 'designer-A'), pJob('item-2', 'designer-A')],
    items: [
      item('item-1', 'designer-A', 'https://images.test/one.jpg'),
      item('item-2', 'designer-A', 'https://images.test/two.jpg'),
    ],
    throwOnImage: true,
    signer: 'ok',
  });

  const r = await f.run();
  assertEquals(r.kinds.portfolio_embed, { claimed: 2, done: 0, failed: 2 });
  assertEquals(f.updates.filter((u) => u.table === 'designer_portfolio_items').length, 0);
  assertEquals(f.centroidCalls.length, 0);
});

Deno.test('portfolio drain: centroid RPC failure is logged, never fatal', async () => {
  const f = makeFake({
    jobs: [pJob('item-1', 'designer-A')],
    items: [item('item-1', 'designer-A', 'https://images.test/one.jpg')],
    failCentroidFor: ['designer-A'],
    signer: 'ok',
  });

  const r = await f.run();
  // the embed itself still counts as done — the nightly sweep recovers the centroid
  assertEquals(r.kinds.portfolio_embed, { claimed: 1, done: 1, failed: 0 });
  assert(f.logs.some((l) => l.event === 'portfolio_centroid_error'));
});
