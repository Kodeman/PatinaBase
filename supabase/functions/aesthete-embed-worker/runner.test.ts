// Deno tests for the embed drain orchestration (runEmbedBatch) and the shared
// inference client — fake db + fake inference / mocked fetch, no network.
// Run: deno test --allow-all supabase/functions/aesthete-embed-worker/

import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  type AestheteJob,
  createInferenceClient,
  type EmbedImageInput,
  type EmbedResponse,
  type EmbedTextInput,
  fuseVectors,
  type InferenceClient,
  InferenceError,
  toPgVector,
} from '../_shared/aesthete.ts';
import { type DnaRow, type ProductRow, runEmbedBatch } from './lib.ts';

// ─── fixtures ────────────────────────────────────────────────────────────────

let jobSeq = 0;
function job(kind: AestheteJob['kind'], productId: string | null): AestheteJob {
  return {
    id: ++jobSeq,
    kind,
    product_id: productId,
    payload: {},
    dedupe_key: productId ? `${productId}:${kind}:r1` : null,
    status: 'running',
    attempts: 1,
    run_after: null,
    last_error: null,
    created_at: null,
    completed_at: null,
  };
}

function product(id: string, over: Partial<ProductRow> = {}): ProductRow {
  return {
    id,
    name: `Product ${id}`,
    description: 'A quiet piece.',
    materials: ['walnut'],
    category: 'table',
    finish: 'natural oil',
    images: [`https://img.test/${id}-0.jpg`],
    ...over,
  };
}

interface FakeDbOptions {
  jobs: Partial<Record<'embed_text' | 'embed_fused', AestheteJob[]>>;
  products: ProductRow[];
  dna?: DnaRow[];
  failUpdateFor?: string[];
}

function makeFakeDb(opts: FakeDbOptions) {
  const events: string[] = [];
  const claims: { kind: string; batch: number }[] = [];
  const completions: { id: number; status: string; reason: string | null }[] = [];
  const updates: { table: string; id: string; patch: Record<string, unknown> }[] = [];

  const db = {
    rpc(fn: string, args?: Record<string, unknown>) {
      if (fn === 'claim_aesthete_jobs') {
        const kind = String(args?.p_kind);
        events.push(`claim:${kind}`);
        claims.push({ kind, batch: Number(args?.p_batch) });
        const jobs = (opts.jobs as Record<string, AestheteJob[]>)[kind] ?? [];
        return Promise.resolve({ data: jobs, error: null });
      }
      if (fn === 'complete_aesthete_job') {
        completions.push({
          id: Number(args?.p_id),
          status: String(args?.p_status),
          reason: (args?.p_error as string | null) ?? null,
        });
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    },
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            in(_col: string, ids: string[]) {
              const rows = table === 'products'
                ? opts.products.filter((p) => ids.includes(p.id))
                : (opts.dna ?? []).filter((d) => ids.includes(d.product_id));
              return Promise.resolve({ data: rows as unknown[], error: null });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              if (opts.failUpdateFor?.includes(id)) {
                return Promise.resolve({ error: { message: 'update boom' } });
              }
              updates.push({ table, id, patch });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { db, events, claims, completions, updates };
}

const CAPTION_VEC = [0, 0, 1];
const IMAGE_VEC = [1, 0, 0];
const TEXT_VEC = [0, 1, 0];
const MODEL = 'nomic-test-r1';

interface FakeInferenceOptions {
  textVec?: (input: EmbedTextInput) => number[] | { error: string };
  imageVec?: (input: EmbedImageInput) => number[] | { error: string };
  throwOnText?: boolean;
  throwOnImage?: boolean;
}

function makeFakeInference(opts: FakeInferenceOptions = {}) {
  const textCalls: EmbedTextInput[][] = [];
  const imageCalls: EmbedImageInput[][] = [];

  const respond = <T extends { id: string }>(
    inputs: T[],
    pick: (input: T) => number[] | { error: string },
  ): EmbedResponse => {
    const vectors = [];
    const errors = [];
    for (const input of inputs) {
      const out = pick(input);
      if (Array.isArray(out)) vectors.push({ id: input.id, dim: out.length, v: out });
      else errors.push({ id: input.id, reason: out.error });
    }
    return { model_version: MODEL, vectors, errors };
  };

  const inference: InferenceClient = {
    embedText(inputs) {
      textCalls.push(inputs);
      if (opts.throwOnText) {
        return Promise.reject(new InferenceError('inference /embed/text unreachable: down', true));
      }
      return Promise.resolve(respond(inputs, opts.textVec ?? (() => TEXT_VEC)));
    },
    embedImage(inputs) {
      imageCalls.push(inputs);
      if (opts.throwOnImage) {
        return Promise.reject(new InferenceError('inference /embed/image at capacity (429)', true, 429));
      }
      return Promise.resolve(respond(inputs, opts.imageVec ?? (() => IMAGE_VEC)));
    },
    healthz() {
      return Promise.resolve({
        status: 'ok',
        model_version: MODEL,
        text_dim: 3,
        image_dim: 3,
        warmed: true,
      });
    },
  };

  return { inference, textCalls, imageCalls };
}

const NOW = new Date('2026-07-01T12:00:00.000Z');

function run(fake: ReturnType<typeof makeFakeDb>, inf: ReturnType<typeof makeFakeInference>, batchSize = 16) {
  const logs: { event: string; fields?: Record<string, unknown> }[] = [];
  const result = runEmbedBatch({
    db: fake.db,
    inference: inf.inference,
    batchSize,
    now: () => NOW,
    log: (event, fields) => logs.push({ event, fields }),
  });
  return { result, logs };
}

// ─── orchestration ───────────────────────────────────────────────────────────

Deno.test('runEmbedBatch drains embed_text, then embed_fused, then portfolio_embed with the batch size', async () => {
  const fake = makeFakeDb({ jobs: {}, products: [] });
  const inf = makeFakeInference();
  const { result } = run(fake, inf, 7);
  const r = await result;
  assertEquals(fake.events, ['claim:embed_text', 'claim:embed_fused', 'claim:portfolio_embed']);
  assertEquals(fake.claims.map((c) => c.batch), [7, 7, 7]);
  assertEquals(r.claimed, 0);
  assertEquals(r.done, 0);
  assertEquals(r.failed, 0);
});

Deno.test('embed_text: embeds name‖description‖materials and updates products.embedding', async () => {
  const p = product('p1');
  const j = job('embed_text', 'p1');
  const fake = makeFakeDb({ jobs: { embed_text: [j] }, products: [p] });
  const inf = makeFakeInference();
  const r = await run(fake, inf).result;

  assertEquals(inf.textCalls.length, 1);
  assertEquals(inf.textCalls[0][0], {
    id: String(j.id),
    text: 'Product p1\nA quiet piece.\nwalnut',
    kind: 'document',
  });
  assertEquals(fake.updates, [{
    table: 'products',
    id: 'p1',
    patch: { embedding: toPgVector(TEXT_VEC), embedding_updated_at: NOW.toISOString() },
  }]);
  assertEquals(fake.completions, [{ id: j.id, status: 'done', reason: null }]);
  assertEquals(r.kinds.embed_text, { claimed: 1, done: 1, failed: 0 });
});

Deno.test('embed_fused: fuses 0.65·mean(images) + 0.35·caption, writes vector + caption + version + watermark', async () => {
  const p = product('p2', {
    images: ['https://img.test/a.jpg', 'https://img.test/b.jpg'],
    category: 'sofa',
    materials: ['walnut', 'boucle'],
    finish: 'waxed',
  });
  const dna: DnaRow = {
    product_id: 'p2',
    silhouette: 'low_slung',
    palette_family: 'warm_earth',
    mood_keywords: ['grounded', 'quiet'],
    ambiance: 'Refined Casual',
  };
  const j = job('embed_fused', 'p2');
  const fake = makeFakeDb({ jobs: { embed_fused: [j] }, products: [p], dna: [dna] });
  const inf = makeFakeInference({
    imageVec: (input) => (input.id.endsWith(':0') ? [1, 0, 0] : [0, 1, 0]),
    textVec: () => CAPTION_VEC,
  });
  const r = await run(fake, inf).result;

  const expectedCaption =
    'low slung sofa in walnut, boucle, waxed finish, warm earth, grounded, quiet, Refined Casual';
  const expected = fuseVectors([[1, 0, 0], [0, 1, 0]], CAPTION_VEC);

  assertEquals(fake.updates.length, 1);
  const patch = fake.updates[0].patch;
  assertEquals(fake.updates[0].id, 'p2');
  assertEquals(patch.style_caption, expectedCaption);
  assertEquals(patch.aesthete_model_version, MODEL);
  assertEquals(patch.aesthete_vector_at, NOW.toISOString());
  assertEquals(patch.aesthete_vector, toPgVector(expected));
  // the fused vector is unit-length
  const v = expected;
  assertAlmostEquals(Math.hypot(...v), 1, 1e-12);
  assertEquals(fake.completions, [{ id: j.id, status: 'done', reason: null }]);
  assertEquals(r.kinds.embed_fused, { claimed: 1, done: 1, failed: 0 });
});

Deno.test('embed_fused caps at 3 images per product', async () => {
  const p = product('p3', {
    images: ['u0', 'u1', 'u2', 'u3', 'u4'],
  });
  const j = job('embed_fused', 'p3');
  const fake = makeFakeDb({ jobs: { embed_fused: [j] }, products: [p] });
  const inf = makeFakeInference({ textVec: () => CAPTION_VEC });
  await run(fake, inf).result;
  assertEquals(inf.imageCalls[0].map((i) => i.url), ['u0', 'u1', 'u2']);
});

Deno.test('per-item inference error → that job fails with the reason, others complete', async () => {
  const p1 = product('p1');
  const p2 = product('p2');
  const j1 = job('embed_text', 'p1');
  const j2 = job('embed_text', 'p2');
  const fake = makeFakeDb({ jobs: { embed_text: [j1, j2] }, products: [p1, p2] });
  const inf = makeFakeInference({
    textVec: (input) => (input.id === String(j1.id) ? { error: 'empty text' } : TEXT_VEC),
  });
  const r = await run(fake, inf).result;

  const byId = new Map(fake.completions.map((c) => [c.id, c]));
  assertEquals(byId.get(j1.id)?.status, 'failed');
  assertStringIncludes(byId.get(j1.id)?.reason ?? '', 'empty text');
  assertEquals(byId.get(j2.id)?.status, 'done');
  assertEquals(r.kinds.embed_text, { claimed: 2, done: 1, failed: 1 });
});

Deno.test('whole embed_text request failure → all text jobs fail retryably, fused still drains', async () => {
  const p1 = product('p1');
  const p2 = product('p2', { images: ['https://img.test/x.jpg'] });
  const jText = job('embed_text', 'p1');
  const jFused = job('embed_fused', 'p2');
  const fake = makeFakeDb({
    jobs: { embed_text: [jText], embed_fused: [jFused] },
    products: [p1, p2],
  });
  // throwOnText kills BOTH the text drain and the fused caption embed — the
  // fused job must fail too (captions ride /embed/text), never half-write.
  const inf = makeFakeInference({ throwOnText: true });
  const r = await run(fake, inf).result;

  const byId = new Map(fake.completions.map((c) => [c.id, c]));
  assertEquals(byId.get(jText.id)?.status, 'failed');
  assertStringIncludes(byId.get(jText.id)?.reason ?? '', 'unreachable');
  assertEquals(byId.get(jFused.id)?.status, 'failed');
  assertStringIncludes(byId.get(jFused.id)?.reason ?? '', 'caption embed request failed');
  assertEquals(fake.updates.length, 0);
  assertEquals(r.failed, 2);
});

Deno.test('missing product (deleted mid-flight) → failed "product not found"', async () => {
  const j = job('embed_text', 'ghost');
  const fake = makeFakeDb({ jobs: { embed_text: [j] }, products: [] });
  const inf = makeFakeInference();
  const r = await run(fake, inf).result;
  assertEquals(fake.completions, [{ id: j.id, status: 'failed', reason: 'product not found' }]);
  assertEquals(inf.textCalls.length, 0);
  assertEquals(r.failed, 1);
});

Deno.test('embed_fused with zero images takes the caption-only degraded path', async () => {
  const p = product('p4', { images: [] });
  const j = job('embed_fused', 'p4');
  const fake = makeFakeDb({ jobs: { embed_fused: [j] }, products: [p] });
  const inf = makeFakeInference({ textVec: () => [0, 0, 2] }); // non-unit on purpose
  const { result, logs } = run(fake, inf);
  const r = await result;

  assertEquals(inf.imageCalls.length, 0); // no image request at all
  assertEquals(fake.updates[0].patch.aesthete_vector, toPgVector([0, 0, 1])); // L2-normalized
  assert(logs.some((l) => l.event === 'fused_caption_only'));
  assertEquals(r.kinds.embed_fused, { claimed: 1, done: 1, failed: 0 });
});

Deno.test('embed_fused with images that ALL fail → retryable failure, no write', async () => {
  const p = product('p5', { images: ['https://img.test/dead.jpg'] });
  const j = job('embed_fused', 'p5');
  const fake = makeFakeDb({ jobs: { embed_fused: [j] }, products: [p] });
  const inf = makeFakeInference({
    imageVec: () => ({ error: 'fetch failed: 404' }),
    textVec: () => CAPTION_VEC,
  });
  const r = await run(fake, inf).result;

  assertEquals(fake.updates.length, 0);
  assertEquals(fake.completions[0].status, 'failed');
  assertStringIncludes(fake.completions[0].reason ?? '', 'all 1 image(s) failed');
  assertStringIncludes(fake.completions[0].reason ?? '', '404');
  assertEquals(r.failed, 1);
});

Deno.test('embed_fused fuses the surviving images when only some fail', async () => {
  const p = product('p6', { images: ['ok.jpg', 'dead.jpg'] });
  const j = job('embed_fused', 'p6');
  const fake = makeFakeDb({ jobs: { embed_fused: [j] }, products: [p] });
  const inf = makeFakeInference({
    imageVec: (input) => (input.url === 'dead.jpg' ? { error: 'fetch failed' } : IMAGE_VEC),
    textVec: () => CAPTION_VEC,
  });
  const { result, logs } = run(fake, inf);
  const r = await result;

  assertEquals(fake.updates[0].patch.aesthete_vector, toPgVector(fuseVectors([IMAGE_VEC], CAPTION_VEC)));
  assert(logs.some((l) => l.event === 'fused_partial_images'));
  assertEquals(r.kinds.embed_fused, { claimed: 1, done: 1, failed: 0 });
});

Deno.test('image inputs are chunked at 16 per inference request', async () => {
  const products = [];
  const jobs = [];
  for (let i = 0; i < 6; i++) {
    products.push(product(`p${i}`, { images: [`${i}-a.jpg`, `${i}-b.jpg`, `${i}-c.jpg`] }));
    jobs.push(job('embed_fused', `p${i}`));
  }
  const fake = makeFakeDb({ jobs: { embed_fused: jobs }, products });
  const inf = makeFakeInference({ textVec: () => CAPTION_VEC });
  const r = await run(fake, inf).result;

  // 6 jobs × 3 images = 18 → [16, 2]
  assertEquals(inf.imageCalls.map((c) => c.length), [16, 2]);
  assertEquals(r.kinds.embed_fused, { claimed: 6, done: 6, failed: 0 });
});

Deno.test('a failed products UPDATE marks the job failed', async () => {
  const p = product('p7');
  const j = job('embed_text', 'p7');
  const fake = makeFakeDb({ jobs: { embed_text: [j] }, products: [p], failUpdateFor: ['p7'] });
  const inf = makeFakeInference();
  const r = await run(fake, inf).result;
  assertEquals(fake.completions[0].status, 'failed');
  assertStringIncludes(fake.completions[0].reason ?? '', 'update boom');
  assertEquals(r.failed, 1);
});

// ─── createInferenceClient (mocked fetch) ────────────────────────────────────

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const EMPTY_OK: EmbedResponse = { model_version: MODEL, vectors: [], errors: [] };

function sequencedFetch(makeResponses: (() => Response)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const make = makeResponses[Math.min(calls.length - 1, makeResponses.length - 1)];
    return Promise.resolve(make());
  }) as typeof fetch;
  return { fetchImpl, calls };
}

Deno.test('inference client sends Bearer auth and the raw inputs body', async () => {
  const { fetchImpl, calls } = sequencedFetch([() => jsonResponse(EMPTY_OK)]);
  const client = createInferenceClient({ url: 'http://worker:8000/', token: 'tok', fetchImpl });
  await client.embedText([{ id: 'a', text: 'hello', kind: 'document' }]);

  assertEquals(calls[0].url, 'http://worker:8000/embed/text');
  const headers = calls[0].init?.headers as Record<string, string>;
  assertEquals(headers['Authorization'], 'Bearer tok');
  assertEquals(
    calls[0].init?.body,
    JSON.stringify({ inputs: [{ id: 'a', text: 'hello', kind: 'document' }] }),
  );
});

Deno.test('inference client retries a 429 after Retry-After, then succeeds', async () => {
  const { fetchImpl, calls } = sequencedFetch([
    () => new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
    () => jsonResponse(EMPTY_OK),
  ]);
  const slept: number[] = [];
  const client = createInferenceClient({
    url: 'http://worker:8000',
    token: 'tok',
    fetchImpl,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  });
  const res = await client.embedImage([{ id: 'a', url: 'https://img.test/a.jpg' }]);
  assertEquals(res.model_version, MODEL);
  assertEquals(calls.length, 2);
  assertEquals(slept, [1000]); // Retry-After: 1 → 1000 ms
});

Deno.test('inference client gives up after max429Attempts and surfaces retryable', async () => {
  const { fetchImpl, calls } = sequencedFetch([
    () => new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
  ]);
  const slept: number[] = [];
  const client = createInferenceClient({
    url: 'http://worker:8000',
    token: 'tok',
    max429Attempts: 3,
    fetchImpl,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  });
  const err = await assertRejects(
    () => client.embedText([{ id: 'a', text: 'x', kind: 'query' }]),
    InferenceError,
    'at capacity',
  );
  assertEquals((err as InferenceError).retryable, true);
  assertEquals((err as InferenceError).status, 429);
  assertEquals(calls.length, 3);
  assertEquals(slept.length, 2); // sleeps between attempts only
});

Deno.test('inference client marks 401 non-retryable and 5xx retryable', async () => {
  const unauth = createInferenceClient({
    url: 'http://worker:8000',
    token: 'bad',
    fetchImpl: sequencedFetch([() => jsonResponse({ detail: 'invalid token' }, 401)]).fetchImpl,
  });
  const err401 = await assertRejects(
    () => unauth.embedText([{ id: 'a', text: 'x', kind: 'document' }]),
    InferenceError,
  );
  assertEquals((err401 as InferenceError).retryable, false);
  assertEquals((err401 as InferenceError).status, 401);

  const flaky = createInferenceClient({
    url: 'http://worker:8000',
    token: 'tok',
    fetchImpl: sequencedFetch([() => jsonResponse({ detail: 'oom' }, 503)]).fetchImpl,
  });
  const err503 = await assertRejects(
    () => flaky.embedText([{ id: 'a', text: 'x', kind: 'document' }]),
    InferenceError,
  );
  assertEquals((err503 as InferenceError).retryable, true);
});

Deno.test('inference client aborts on timeout and surfaces retryable', async () => {
  const hangingFetch = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The signal has been aborted', 'AbortError'));
      });
    })) as typeof fetch;

  const client = createInferenceClient({
    url: 'http://worker:8000',
    token: 'tok',
    timeoutMs: 5,
    fetchImpl: hangingFetch,
  });
  const err = await assertRejects(
    () => client.embedText([{ id: 'a', text: 'x', kind: 'document' }]),
    InferenceError,
    'unreachable',
  );
  assertEquals((err as InferenceError).retryable, true);
});

Deno.test('healthz parses a healthy worker and returns null when unreachable', async () => {
  const healthy = createInferenceClient({
    url: 'http://worker:8000',
    token: 'tok',
    fetchImpl: sequencedFetch([
      () =>
        jsonResponse({
          status: 'ok',
          model_version: MODEL,
          text_dim: 768,
          image_dim: 768,
          warmed: true,
        }),
    ]).fetchImpl,
  });
  const h = await healthy.healthz();
  assertEquals(h?.warmed, true);
  assertEquals(h?.model_version, MODEL);

  const dead = createInferenceClient({
    url: 'http://worker:8000',
    token: 'tok',
    fetchImpl: (() => Promise.reject(new TypeError('connection refused'))) as typeof fetch,
  });
  assertEquals(await dead.healthz(), null);
});
