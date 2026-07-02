// Deno tests for aesthete-ask (Wave 3C).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/aesthete-ask/
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve
// (po-send/embed-worker convention). Fake caller/admin/inference record every
// call so the suite can assert the load-bearing laws:
//   • R31/R38 — the ask text NEVER reaches the match_events row (structural:
//     the event builder can't receive it; behavioral: a sentinel ask string
//     never appears in anything the admin client writes).
//   • RLS-client usage — ALL retrieval (both seams + the product fetch) runs
//     on the caller client; the admin client's only call is the event insert.
//   • §12.1 rung 2 — embed timeout/failure/unconfigured ⇒ FTS-only with
//     degraded: true (and the event row says so).

import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { InferenceError, type InferenceClient, toPgVector } from '../_shared/aesthete.ts';
import {
  ASK_CACHE_TTL_DAYS,
  ASK_EMBED_TIMEOUT_MS,
  askCacheKey,
  type AskDeps,
  type AskEmbedCache,
  type AskRequest,
  buildAskEvent,
  type CacheDb,
  CANDIDATE_POOL,
  createAskEmbedCache,
  DEFAULT_ASK_LIMIT,
  MAX_ASK_LIMIT,
  mergeCandidates,
  parseAskRequest,
  peekJwt,
  RRF_K,
  runAsk,
  type SeamHit,
} from './lib.ts';

// A distinctive ask no fixture field could contain by accident.
const SENTINEL_ASK = 'MAGENTA WALRUS CREDENZA with barnacle inlay';

// ─── parseAskRequest ─────────────────────────────────────────────────────────

Deno.test('parseAskRequest rejects garbage bodies and empty asks', () => {
  for (const body of [null, undefined, 42, 'x', [], {}, { ask: '' }, { ask: '   ' }, { ask: 7 }]) {
    const r = parseAskRequest(body);
    assert('error' in r, `expected error for ${JSON.stringify(body)}`);
  }
});

Deno.test('parseAskRequest trims, defaults, and clamps', () => {
  const r = parseAskRequest({ ask: '  warm oak sideboard  ' });
  assert(!('error' in r));
  assertEquals(r.ask, 'warm oak sideboard');
  assertEquals(r.limit, DEFAULT_ASK_LIMIT);
  assertEquals(r.category, null);
  assertEquals(r.layer, null);

  const clampedHigh = parseAskRequest({ ask: 'x', limit: 999 }) as AskRequest;
  assertEquals(clampedHigh.limit, MAX_ASK_LIMIT);
  const clampedLow = parseAskRequest({ ask: 'x', limit: -3 }) as AskRequest;
  assertEquals(clampedLow.limit, 1);
  const floored = parseAskRequest({ ask: 'x', limit: 5.9 }) as AskRequest;
  assertEquals(floored.limit, 5);
});

Deno.test('parseAskRequest reads structured context only', () => {
  const r = parseAskRequest({
    ask: 'x',
    context: { category: 'seating', layer: 'studio', evil: 'ignored' },
  }) as AskRequest;
  assertEquals(r.category, 'seating');
  assertEquals(r.layer, 'studio');
  assert(!('evil' in r));
});

Deno.test('parseAskRequest caps ask length', () => {
  const r = parseAskRequest({ ask: 'a'.repeat(501) });
  assert('error' in r);
});

// ─── mergeCandidates (the documented ranking: RRF) ───────────────────────────

const hit = (id: string, rank = 0.5): SeamHit => ({ product_id: id, rank });

Deno.test('mergeCandidates: both-lists presence outranks single-list tops', () => {
  const vector = [hit('a'), hit('b'), hit('c')];
  const fts = [hit('d'), hit('b')];
  const merged = mergeCandidates(vector, fts, 10);
  // b: 1/(60+2) + 1/(60+2) ≈ 0.0323 — beats a (1/61) and d (1/61).
  assertEquals(merged[0].product_id, 'b');
  assertEquals(merged[0].matched_on, ['vector', 'fts']);
  assertAlmostEquals(merged[0].score, 1 / (RRF_K + 2) + 1 / (RRF_K + 2), 1e-12);
});

Deno.test('mergeCandidates: single-source hits carry their source chip', () => {
  const merged = mergeCandidates([hit('v')], [hit('f')], 10);
  const v = merged.find((m) => m.product_id === 'v')!;
  const f = merged.find((m) => m.product_id === 'f')!;
  assertEquals(v.matched_on, ['vector']);
  assertEquals(f.matched_on, ['fts']);
  // Same position (1) in each list → same score → deterministic id tie-break.
  assertEquals(merged.map((m) => m.product_id), ['f', 'v']);
});

Deno.test('mergeCandidates: respects limit and empty lists', () => {
  assertEquals(mergeCandidates([], [], 5), []);
  const vector = [hit('a'), hit('b'), hit('c'), hit('d')];
  assertEquals(mergeCandidates(vector, [], 2).length, 2);
  // FTS-only (the degraded rung) preserves the seam's order.
  const ftsOnly = mergeCandidates([], [hit('x'), hit('y')], 10);
  assertEquals(ftsOnly.map((m) => m.product_id), ['x', 'y']);
});

Deno.test('mergeCandidates is deterministic across calls', () => {
  const vector = [hit('a'), hit('b')];
  const fts = [hit('b'), hit('c')];
  assertEquals(mergeCandidates(vector, fts, 10), mergeCandidates(vector, fts, 10));
});

// ─── buildAskEvent (R31/R38 by shape) ────────────────────────────────────────

Deno.test('buildAskEvent: engine_ask row carries latency + counts, no text field', () => {
  const row = buildAskEvent({
    userId: 'user-1',
    merged: [{ product_id: 'p1', score: 0.03, matched_on: ['vector', 'fts'] }],
    latencyMs: 87,
    degraded: false,
    vectorCandidates: 12,
    ftsCandidates: 4,
    category: 'seating',
    layer: null,
    limit: 8,
  });
  assertEquals(row.source, 'engine_ask');
  assertEquals(row.latency_ms, 87);
  assertEquals(row.user_id, 'user-1');
  assertEquals(row.designer_id, 'user-1');
  assertEquals(row.session_key, null);
  const context = row.context as Record<string, unknown>;
  assertEquals(context.result_count, 1);
  assertEquals(context.degraded, false);
  assertEquals(context.vector_candidates, 12);
  assertEquals(context.fts_candidates, 4);
  assertEquals(context.category, 'seating');
  assertFalse('layer' in context); // nulls dropped, structured keys only
  // The whole row, serialized: only known keys, no query/ask/text fields.
  assertEquals(
    Object.keys(row).sort(),
    ['context', 'designer_id', 'latency_ms', 'results', 'session_key', 'source', 'user_id'].sort(),
  );
});

// ─── Fakes ───────────────────────────────────────────────────────────────────

interface FakeCallerConfig {
  fts?: SeamHit[];
  knn?: SeamHit[];
  products?: Record<string, unknown>[];
  knnError?: string;
}

function fakeCaller(cfg: FakeCallerConfig) {
  const calls: { rpcs: Array<{ fn: string; args: Record<string, unknown> }>; fetches: string[][] } = {
    rpcs: [],
    fetches: [],
  };
  const db = {
    rpc(fn: string, args: Record<string, unknown> = {}) {
      calls.rpcs.push({ fn, args });
      if (fn === 'aesthete_search') {
        return Promise.resolve({ data: cfg.fts ?? [], error: null });
      }
      if (fn === 'aesthete_ask_knn') {
        return cfg.knnError
          ? Promise.resolve({ data: null, error: { message: cfg.knnError } })
          : Promise.resolve({ data: cfg.knn ?? [], error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    },
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            in(_col: string, ids: string[]) {
              calls.fetches.push(ids);
              const rows = (cfg.products ?? []).filter((p) => ids.includes(p.id as string));
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

function fakeAdmin() {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { db, inserts };
}

function fakeInference(vector: number[] | 'timeout' | 'down'): InferenceClient {
  return {
    embedText(inputs) {
      if (vector === 'timeout') {
        return Promise.reject(
          new InferenceError('inference /embed/text unreachable: aborted (timeout)', true),
        );
      }
      if (vector === 'down') {
        return Promise.reject(new InferenceError('inference /embed/text → 503', true, 503));
      }
      return Promise.resolve({
        model_version: 'test-model',
        vectors: inputs.map((i) => ({ id: i.id, dim: vector.length, v: vector })),
        errors: [],
      });
    },
    embedImage() {
      return Promise.reject(new Error('not used by aesthete-ask'));
    },
    healthz() {
      return Promise.resolve(null);
    },
  };
}

const productRow = (id: string, layer = 'catalog') => ({
  id,
  name: `Piece ${id}`,
  brand: 'Fixture & Co',
  price_retail: 120000,
  price_trade: 90000,
  images: [`https://img.example/${id}.jpg`],
  category: 'storage',
  layer,
});

function baseRequest(overrides: Partial<AskRequest> = {}): AskRequest {
  return { ask: SENTINEL_ASK, category: null, layer: null, limit: 6, ...overrides };
}

// ─── runAsk: happy path (vector + FTS union) ─────────────────────────────────

Deno.test('runAsk happy path: blends both seams, fetches display rows, degraded=false', async () => {
  const caller = fakeCaller({
    fts: [hit('p2'), hit('p3')],
    knn: [hit('p1'), hit('p2')],
    products: [productRow('p1'), productRow('p2', 'studio'), productRow('p3', 'personal')],
  });
  const admin = fakeAdmin();
  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([0.1, 0.2, 0.3]),
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertEquals(result.degraded, false);
  assertEquals(result.result_count, 3);
  // p2 is in both lists → first; carries both chips.
  assertEquals(result.items[0].id, 'p2');
  assertEquals(result.items[0].matched_on, ['vector', 'fts']);
  assertEquals(result.items[0].name, 'Piece p2');
  assert(result.latency_ms >= 0);

  // Both seams were asked with the pooled filters.
  const rpcNames = caller.calls.rpcs.map((r) => r.fn);
  assertEquals(rpcNames.sort(), ['aesthete_ask_knn', 'aesthete_search'].sort());
  const ftsArgs = caller.calls.rpcs.find((r) => r.fn === 'aesthete_search')!.args;
  assertEquals((ftsArgs.p_filters as Record<string, unknown>).limit, CANDIDATE_POOL);
  // Exactly ONE event insert, into match_events.
  assertEquals(admin.inserts.length, 1);
  assertEquals(admin.inserts[0].table, 'match_events');
  assertEquals(admin.inserts[0].row.source, 'engine_ask');
});

// ─── R31/R38: the ask text never reaches the event row ───────────────────────

Deno.test('runAsk NEVER writes the ask text anywhere the admin client touches', async () => {
  const caller = fakeCaller({
    fts: [hit('p1')],
    knn: [hit('p1')],
    products: [productRow('p1')],
  });
  const admin = fakeAdmin();
  await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([1, 0]),
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertEquals(admin.inserts.length, 1);
  const serialized = JSON.stringify(admin.inserts[0]);
  assertFalse(serialized.includes(SENTINEL_ASK));
  assertFalse(serialized.toLowerCase().includes('walrus')); // no fragment either
  // …and the row's shape carries only structured keys (belt and braces).
  const context = admin.inserts[0].row.context as Record<string, unknown>;
  for (const key of Object.keys(context)) {
    assert(
      [
        'degraded',
        'vector_candidates',
        'fts_candidates',
        'result_count',
        'limit',
        'category',
        'layer',
        'cache_hit', // §12.3/00250 — structural flag only, never text
      ].includes(key),
      `unexpected context key: ${key}`,
    );
  }
});

// ─── RLS-client usage: retrieval on caller, only the event on admin ──────────

Deno.test('runAsk retrieval runs on the CALLER client; admin does only the event insert', async () => {
  const caller = fakeCaller({
    fts: [hit('p1')],
    knn: [hit('p2')],
    products: [productRow('p1'), productRow('p2')],
  });
  const admin = fakeAdmin();
  await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([0.4]),
    request: baseRequest(),
    userId: 'designer-1',
  });

  // Caller did both seam RPCs + the display fetch.
  assertEquals(caller.calls.rpcs.length, 2);
  assertEquals(caller.calls.fetches.length, 1);
  assertEquals(new Set(caller.calls.fetches[0]), new Set(['p1', 'p2']));
  // Admin did exactly one thing.
  assertEquals(admin.inserts.length, 1);
  assertEquals(admin.inserts[0].table, 'match_events');
});

// ─── §12.1 rung 2: degraded paths ────────────────────────────────────────────

Deno.test('runAsk embed timeout → FTS-only, degraded:true, kNN never called', async () => {
  const caller = fakeCaller({
    fts: [hit('p1'), hit('p2')],
    products: [productRow('p1'), productRow('p2')],
  });
  const admin = fakeAdmin();
  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference('timeout'),
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertEquals(result.degraded, true);
  assertEquals(result.items.map((i) => i.id), ['p1', 'p2']);
  assertEquals(result.items[0].matched_on, ['fts']);
  // kNN seam untouched.
  assertEquals(caller.calls.rpcs.map((r) => r.fn), ['aesthete_search']);
  // The event row records the degraded rung — still no text.
  const context = admin.inserts[0].row.context as Record<string, unknown>;
  assertEquals(context.degraded, true);
  assertEquals(context.vector_candidates, 0);
  assertFalse(JSON.stringify(admin.inserts[0]).includes(SENTINEL_ASK));
});

Deno.test('runAsk inference unconfigured (null) → FTS-only, degraded:true', async () => {
  const caller = fakeCaller({ fts: [hit('p1')], products: [productRow('p1')] });
  const admin = fakeAdmin();
  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: null,
    request: baseRequest(),
    userId: 'designer-1',
  });
  assertEquals(result.degraded, true);
  assertEquals(result.result_count, 1);
});

Deno.test('runAsk worker 5xx → degraded, still answers from FTS', async () => {
  const caller = fakeCaller({ fts: [hit('p1')], products: [productRow('p1')] });
  const admin = fakeAdmin();
  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference('down'),
    request: baseRequest(),
    userId: 'designer-1',
  });
  assertEquals(result.degraded, true);
  assertEquals(result.items.length, 1);
});

Deno.test('runAsk kNN seam error (00247 not applied) → degraded FTS answer, not a failure', async () => {
  const caller = fakeCaller({
    fts: [hit('p1')],
    knnError: 'function aesthete_ask_knn(unknown, unknown) does not exist',
    products: [productRow('p1')],
  });
  const admin = fakeAdmin();
  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([0.9]),
    request: baseRequest(),
    userId: 'designer-1',
  });
  assertEquals(result.degraded, true);
  assertEquals(result.items.length, 1);
});

// ─── Resilience details ──────────────────────────────────────────────────────

Deno.test('runAsk event-insert failure never fails the ask', async () => {
  const caller = fakeCaller({ fts: [hit('p1')], products: [productRow('p1')] });
  const admin = {
    from(_: string) {
      return {
        insert(_row: Record<string, unknown>) {
          return Promise.resolve({ error: { message: 'RLS says no' } });
        },
      };
    },
  };
  const result = await runAsk({
    caller: caller.db,
    admin,
    inference: null,
    request: baseRequest(),
    userId: 'designer-1',
  });
  assertEquals(result.result_count, 1);
});

Deno.test('runAsk with zero candidates returns empty items and still logs one event', async () => {
  const caller = fakeCaller({ fts: [], knn: [] });
  const admin = fakeAdmin();
  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([0.5]),
    request: baseRequest(),
    userId: 'designer-1',
  });
  assertEquals(result.items, []);
  assertEquals(result.result_count, 0);
  assertEquals(caller.calls.fetches.length, 0); // no pointless fetch
  assertEquals(admin.inserts.length, 1);
  assertEquals((admin.inserts[0].row.context as Record<string, unknown>).result_count, 0);
});

Deno.test('runAsk drops candidates RLS hides at the display fetch', async () => {
  // kNN surfaced p1+p2 but the products read (RLS) only returns p1.
  const caller = fakeCaller({
    knn: [hit('p1'), hit('p2')],
    fts: [],
    products: [productRow('p1')],
  });
  const admin = fakeAdmin();
  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([0.5]),
    request: baseRequest(),
    userId: 'designer-1',
  });
  assertEquals(result.items.map((i) => i.id), ['p1']);
});

// ─── Wiring constants + JWT peek ─────────────────────────────────────────────

Deno.test('the embed budget is 1.5 s (§12.1 rung 2)', () => {
  assertEquals(ASK_EMBED_TIMEOUT_MS, 1500);
});

Deno.test('peekJwt reads sub + role; rejects malformed tokens', () => {
  const payload = btoa(JSON.stringify({ sub: 'u-1', role: 'authenticated' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `x.${payload}.y`;
  assertEquals(peekJwt(`Bearer ${token}`), { sub: 'u-1', role: 'authenticated' });
  assertEquals(peekJwt(null), { sub: null, role: null });
  assertEquals(peekJwt('Bearer nonsense'), { sub: null, role: null });
  const anonPayload = btoa(JSON.stringify({ role: 'anon' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assertEquals(peekJwt(`Bearer x.${anonPayload}.y`).role, 'anon');
});

// ─── §12.3 ask-embed cache (00250 — Wave 4C) ─────────────────────────────────

function fakeAskCache(cfg: { hit?: string | null; lookupError?: string; storeError?: string }) {
  const lookups: string[] = [];
  const stores: Array<{ ask: string; vector: number[]; modelVersion: string }> = [];
  const cache: AskEmbedCache = {
    lookup(ask: string) {
      lookups.push(ask);
      if (cfg.lookupError) return Promise.reject(new Error(cfg.lookupError));
      return Promise.resolve(cfg.hit ?? null);
    },
    store(ask: string, vector: number[], modelVersion: string) {
      stores.push({ ask, vector, modelVersion });
      if (cfg.storeError) return Promise.reject(new Error(cfg.storeError));
      return Promise.resolve();
    },
  };
  return { cache, lookups, stores };
}

function fakeCacheDb() {
  const rows = new Map<string, { embedding: string; model_version: string }>();
  const upserts: Array<Record<string, unknown>> = [];
  let selects = 0;
  const db: CacheDb = {
    from(_table: string) {
      return {
        select(_cols: string) {
          selects++;
          return {
            eq(_col: string, key: string) {
              return {
                gt(_col2: string, _iso: string) {
                  return {
                    maybeSingle() {
                      const row = rows.get(key);
                      return Promise.resolve({
                        data: row ? { embedding: row.embedding } : null,
                        error: null,
                      });
                    },
                  };
                },
              };
            },
            order(_col: string, _opts: { ascending: boolean }) {
              return {
                limit(_n: number) {
                  return {
                    maybeSingle() {
                      // newest row = last inserted (created_at DESC stand-in)
                      const newest = [...rows.values()].at(-1);
                      return Promise.resolve({
                        data: newest ? { model_version: newest.model_version } : null,
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
        upsert(row: Record<string, unknown>) {
          upserts.push(row);
          rows.set(row.cache_key as string, {
            embedding: row.embedding as string,
            model_version: row.model_version as string,
          });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { db, upserts, rows, stats: { get selects() { return selects; } } };
}

Deno.test('askCacheKey: deterministic, version-scoped, ask-scoped', async () => {
  const a = await askCacheKey('nomic-v1.5', SENTINEL_ASK);
  const b = await askCacheKey('nomic-v1.5', SENTINEL_ASK);
  const c = await askCacheKey('nomic-v2.0', SENTINEL_ASK);
  const d = await askCacheKey('nomic-v1.5', 'a different ask');
  assertEquals(a, b);
  assert(a !== c, 'model version must scope the key');
  assert(a !== d, 'ask text must scope the key');
  assertEquals(a.length, 40); // sha1 hex
});

Deno.test('createAskEmbedCache: cold isolate on an EMPTY cache bootstraps, finds no version, misses', async () => {
  const { db } = fakeCacheDb();
  const cache = createAskEmbedCache(db);
  assertEquals(await cache.lookup(SENTINEL_ASK), null);
});

Deno.test('createAskEmbedCache: a FRESH isolate hits rows stored by a previous one (version bootstrap)', async () => {
  // Edge isolates recycle aggressively (dev serve: one per request) — the
  // model version must be re-learnable from the table, not only from a warm
  // module global. This is the exact live-walk regression of 2026-07-02.
  const { db } = fakeCacheDb();
  const first = createAskEmbedCache(db);
  await first.store(SENTINEL_ASK, [0.1, 0.9], 'test-model');

  const fresh = createAskEmbedCache(db); // cold: no in-memory version
  assertEquals(await fresh.lookup(SENTINEL_ASK), toPgVector([0.1, 0.9]));
});

Deno.test('createAskEmbedCache: store persists hash+literal ONLY (no ask text), then lookup hits', async () => {
  const { db, upserts } = fakeCacheDb();
  const cache = createAskEmbedCache(db);
  const vector = [0.25, -0.5, 0.75];

  await cache.store(SENTINEL_ASK, vector, 'test-model');

  assertEquals(upserts.length, 1);
  const row = upserts[0];
  assertEquals(
    Object.keys(row).sort(),
    ['cache_key', 'embedding', 'expires_at', 'model_version'].sort(),
  );
  assertEquals(row.cache_key, await askCacheKey('test-model', SENTINEL_ASK));
  assertEquals(row.embedding, toPgVector(vector));
  assertEquals(row.model_version, 'test-model');
  // R31/R38: nothing in the persisted row contains the ask text.
  const serialized = JSON.stringify(row);
  assertFalse(serialized.includes(SENTINEL_ASK));
  assertFalse(serialized.toLowerCase().includes('walrus'));
  // TTL ≈ 7 days out (§12.3).
  const ttlMs = Date.parse(row.expires_at as string) - Date.now();
  assertAlmostEquals(ttlMs / 86_400_000, ASK_CACHE_TTL_DAYS, 0.01);

  // The store taught the isolate the model version → same ask now hits.
  assertEquals(await cache.lookup(SENTINEL_ASK), toPgVector(vector));
  // A different ask under the same version misses.
  assertEquals(await cache.lookup('some other ask'), null);
});

Deno.test('runAsk cache hit: inference NEVER called, kNN gets the cached literal, degraded=false', async () => {
  const cachedLiteral = toPgVector([0.9, 0.1]);
  const caller = fakeCaller({ fts: [hit('p2')], knn: [hit('p1')], products: [productRow('p1'), productRow('p2')] });
  const admin = fakeAdmin();
  const { cache, lookups, stores } = fakeAskCache({ hit: cachedLiteral });
  let inferenceCalled = false;
  const inference: InferenceClient = {
    embedText() {
      inferenceCalled = true;
      return Promise.reject(new Error('must not be called on a cache hit'));
    },
    embedImage() {
      return Promise.reject(new Error('not used'));
    },
    healthz() {
      return Promise.resolve(null);
    },
  };

  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference,
    cache,
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertFalse(inferenceCalled);
  assertEquals(lookups, [SENTINEL_ASK]);
  assertEquals(stores.length, 0);
  assertEquals(result.degraded, false);
  const knn = caller.calls.rpcs.find((r) => r.fn === 'aesthete_ask_knn');
  assert(knn, 'kNN seam must run on a cache hit');
  assertEquals(knn!.args.p_embedding, cachedLiteral);
  // Observability: the event context flags the hit (structured, no text).
  const context = admin.inserts[0].row.context as Record<string, unknown>;
  assertEquals(context.cache_hit, true);
  assertEquals(context.degraded, false);
});

Deno.test('runAsk cache miss: worker embeds, vector stored with its model_version', async () => {
  const caller = fakeCaller({ fts: [], knn: [hit('p1')], products: [productRow('p1')] });
  const admin = fakeAdmin();
  const { cache, lookups, stores } = fakeAskCache({ hit: null });
  const vector = [0.3, 0.4];

  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference(vector),
    cache,
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertEquals(lookups, [SENTINEL_ASK]);
  assertEquals(stores.length, 1);
  assertEquals(stores[0].vector, vector);
  assertEquals(stores[0].modelVersion, 'test-model'); // learned from the embed response
  assertEquals(result.degraded, false);
  const knn = caller.calls.rpcs.find((r) => r.fn === 'aesthete_ask_knn');
  assertEquals(knn!.args.p_embedding, toPgVector(vector));
  const context = admin.inserts[0].row.context as Record<string, unknown>;
  assertFalse('cache_hit' in context); // miss → flag absent (nulls-dropped shape)
});

Deno.test('runAsk cache lookup error is a miss, never a failure', async () => {
  const caller = fakeCaller({ fts: [hit('p1')], knn: [hit('p1')], products: [productRow('p1')] });
  const admin = fakeAdmin();
  const { cache } = fakeAskCache({ lookupError: 'cache table on fire' });

  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([1, 0]),
    cache,
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertEquals(result.degraded, false); // worker still answered
  assertEquals(result.result_count, 1);
});

Deno.test('runAsk cache store error never fails the ask', async () => {
  const caller = fakeCaller({ fts: [hit('p1')], knn: [hit('p1')], products: [productRow('p1')] });
  const admin = fakeAdmin();
  const { cache, stores } = fakeAskCache({ hit: null, storeError: 'disk full' });

  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([1, 0]),
    cache,
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertEquals(stores.length, 1); // attempted
  assertEquals(result.degraded, false);
  assertEquals(result.result_count, 1);
});

Deno.test('runAsk worker DOWN + warm cache hit stays on the vector rung (documented 00250 bonus)', async () => {
  const cachedLiteral = toPgVector([0.5, 0.5]);
  const caller = fakeCaller({ fts: [hit('p2')], knn: [hit('p1')], products: [productRow('p1'), productRow('p2')] });
  const admin = fakeAdmin();
  const { cache } = fakeAskCache({ hit: cachedLiteral });

  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference('down'), // would 503 — but the hit short-circuits it
    cache,
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertEquals(result.degraded, false);
  assert(caller.calls.rpcs.some((r) => r.fn === 'aesthete_ask_knn'));
});

Deno.test('runAsk without a cache (pre-00250 deploy state) behaves exactly as before', async () => {
  const caller = fakeCaller({ fts: [hit('p1')], knn: [hit('p1')], products: [productRow('p1')] });
  const admin = fakeAdmin();

  const result = await runAsk({
    caller: caller.db,
    admin: admin.db,
    inference: fakeInference([1, 0]),
    cache: null,
    request: baseRequest(),
    userId: 'designer-1',
  });

  assertEquals(result.degraded, false);
  assertEquals(result.result_count, 1);
  const context = admin.inserts[0].row.context as Record<string, unknown>;
  assertFalse('cache_hit' in context);
});
