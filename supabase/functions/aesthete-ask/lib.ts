// aesthete-ask/lib.ts — pure logic + orchestration for the Engine's ask path
// (design §3.2 #14, §12.1 degradation ladder rung 2; product law R31/R38).
//
// index.ts boots Deno.serve and wires real deps; everything testable lives
// here behind narrow structural interfaces (fake caller/admin/inference in
// the deno suite — the aesthete-embed-worker convention).
//
// One ask (caller JWT — RLS applies to every read):
//   1. In parallel:
//        a. aesthete_search(ask) via the CALLER client — FTS candidates
//           (00244 seam; SECURITY INVOKER ⇒ three-layer law transitively).
//        b. resolve the ask embedding: ask_embed_cache first (§12.3/00250 —
//           sha1(model_version+ask) key, 7 d TTL, service-role table; cache
//           errors are misses), else the inference worker (/embed/text,
//           kind=query) under a HARD 1.5 s budget (ASK_EMBED_TIMEOUT_MS —
//           the per-request timeout IS the circuit breaker, §12.1), storing
//           the fresh vector back best-effort.
//   2. Embed ok → aesthete_ask_knn(embedding) via the CALLER client (00247,
//      SECURITY INVOKER twin of the seam) — vector candidates.
//   3. Blend by Reciprocal Rank Fusion: score(p) = Σ_lists 1/(60 + pos).
//      Rank-based on purpose — ts_rank and cosine similarity never need a
//      shared scale, and either list may be absent. Both-lists presence is
//      itself the strongest signal (documented ranking, brief §10.2 union).
//   4. Fetch the top rows' display fields via the CALLER client (RLS again).
//   5. Embed failed/timed out/unconfigured → FTS-only, response flags
//      {degraded: true} and the UI says "the Engine is resting" (copy law:
//      never "error", never "AI").
//   6. Log ONE match_events row via the ADMIN client: source='engine_ask',
//      latency + result count + structured context ONLY. The event builder
//      NEVER RECEIVES THE ASK TEXT — no-persistence is enforced by shape
//      (R31/R38; 00244 table comment), and asserted in the deno suite.
//
// The ask itself is never persisted anywhere. Only a placement persists
// (added_via='engine', owned by the portal's use-place-in-document — not
// this function).

import {
  type EmbedTextInput,
  type InferenceClient,
  toPgVector,
} from '../_shared/aesthete.ts';

// ─── Constants (§12.1/§12.3) ─────────────────────────────────────────────────

/** Hard budget for embedding the ask text — past it, FTS-only (§12.1 rung 2). */
export const ASK_EMBED_TIMEOUT_MS = 1500;
/** Ask-embed cache TTL (§12.3: 7 d). Purge runs in aesthete_jobs_janitor (00250). */
export const ASK_CACHE_TTL_DAYS = 7;
/** Items returned to the surface by default (paper result-lines are few). */
export const DEFAULT_ASK_LIMIT = 8;
export const MAX_ASK_LIMIT = 24;
/** Candidate pool depth requested from each seam before blending. */
export const CANDIDATE_POOL = 50;
/** RRF constant — the standard k=60; small ranks dominate, tails still count. */
export const RRF_K = 60;

// ─── Request parsing ─────────────────────────────────────────────────────────

export interface AskRequest {
  ask: string;
  category: string | null;
  layer: string | null;
  limit: number;
}

/**
 * Body: { ask: string, context?: { category?, layer? }, limit? }.
 * Returns { error } for anything unusable — index.ts maps it to a 400.
 */
export function parseAskRequest(body: unknown): AskRequest | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;
  const ask = typeof b.ask === 'string' ? b.ask.trim() : '';
  if (!ask) return { error: 'ask must be a non-empty string' };
  if (ask.length > 500) return { error: 'ask too long (max 500 chars)' };

  const ctx = (typeof b.context === 'object' && b.context !== null
    ? b.context
    : {}) as Record<string, unknown>;
  const category = typeof ctx.category === 'string' && ctx.category.trim() ? ctx.category.trim() : null;
  const layer = typeof ctx.layer === 'string' && ctx.layer.trim() ? ctx.layer.trim() : null;

  const rawLimit = typeof b.limit === 'number' ? b.limit : typeof b.limit === 'string' ? Number(b.limit) : NaN;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), MAX_ASK_LIMIT)
    : DEFAULT_ASK_LIMIT;

  return { ask, category, layer, limit };
}

// ─── Candidate blending (documented ranking: RRF) ────────────────────────────

export type MatchSource = 'vector' | 'fts';

/** One row from either seam (aesthete_ask_knn / aesthete_search). */
export interface SeamHit {
  product_id: string;
  rank: number; // cosine similarity | ts_rank/similarity — NOT cross-comparable
}

export interface MergedCandidate {
  product_id: string;
  /** RRF score: Σ over lists of 1/(RRF_K + position), position 1-based. */
  score: number;
  matched_on: MatchSource[];
}

/**
 * Reciprocal Rank Fusion over the two candidate lists. Lists arrive already
 * ordered best-first by their own seam (both seams ORDER BY rank DESC / dist
 * ASC with an id tie-break, so positions are deterministic). A product in
 * both lists sums both reciprocal ranks — presence in both is the strongest
 * signal. Deterministic: ties break by product_id.
 */
export function mergeCandidates(
  vectorHits: SeamHit[],
  ftsHits: SeamHit[],
  limit: number,
): MergedCandidate[] {
  const merged = new Map<string, MergedCandidate>();
  const fold = (hits: SeamHit[], source: MatchSource) => {
    hits.forEach((h, i) => {
      const contribution = 1 / (RRF_K + i + 1);
      const existing = merged.get(h.product_id);
      if (existing) {
        existing.score += contribution;
        if (!existing.matched_on.includes(source)) existing.matched_on.push(source);
      } else {
        merged.set(h.product_id, {
          product_id: h.product_id,
          score: contribution,
          matched_on: [source],
        });
      }
    });
  };
  // Vector first so matched_on lists the Engine's read ahead of the keyword.
  fold(vectorHits, 'vector');
  fold(ftsHits, 'fts');

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || (a.product_id < b.product_id ? -1 : 1))
    .slice(0, Math.max(limit, 0));
}

// ─── The match_events row (R31/R38 — no ask text, BY SHAPE) ──────────────────

/**
 * Everything the event row is allowed to know. THE ASK TEXT IS NOT A FIELD —
 * this input type is the enforcement surface: the builder cannot leak what it
 * never receives (asserted structurally in the deno suite).
 */
export interface AskEventInput {
  userId: string | null;
  merged: MergedCandidate[];
  latencyMs: number;
  degraded: boolean;
  vectorCandidates: number;
  ftsCandidates: number;
  category: string | null;
  layer: string | null;
  limit: number;
  /** True when the ask embed came from ask_embed_cache (§12.3/00250). */
  cacheHit?: boolean;
}

/** One 00244 match_events row: source='engine_ask', latency + result count +
 *  structured context only. */
export function buildAskEvent(input: AskEventInput): Record<string, unknown> {
  const context: Record<string, unknown> = {
    degraded: input.degraded,
    vector_candidates: input.vectorCandidates,
    fts_candidates: input.ftsCandidates,
    result_count: input.merged.length,
    limit: input.limit,
  };
  if (input.category) context.category = input.category;
  if (input.layer) context.layer = input.layer;
  if (input.cacheHit) context.cache_hit = true;

  return {
    session_key: null, // no quiz session on the ask path
    user_id: input.userId,
    designer_id: input.userId, // the asker IS the designer (caller-JWT surface)
    source: 'engine_ask',
    context,
    results: input.merged.map((m) => ({
      product_id: m.product_id,
      score: m.score,
      matched_on: m.matched_on,
    })),
    latency_ms: input.latencyMs,
  };
}

// ─── Narrow client seams (fakeable — embed-worker convention) ────────────────

/** Caller-JWT client slice: seam RPCs + the display-field fetch. RLS applies
 *  to every one of these because the JWT rides the client. */
export interface CallerDb {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: string[],
      ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

/** Admin (service-role) slice: ONLY the match_events insert lives here —
 *  asserted in the suite (retrieval must never run service-role). */
export interface AdminDb {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

// ─── Ask-embed cache (§12.3 via 00250's ask_embed_cache — NOT Redis) ─────────
//
// §12.3 wanted this cache in the shared Redis; 00250 documents the decision
// to use an UNLOGGED postgres table instead (no Redis seam from the edge
// runtime, cross-stack networking unproven, same semantics). Rows carry
// sha1(model_version + ask) + the pgvector literal ONLY — the ask text is
// never persisted (R31/R38 hold: a one-way hash is not the ask).
//
// Model-version bootstrapping: the key needs the worker's model_version,
// which we only learn from a successful embed response. The factory tracks
// the last seen version per warm isolate, and a COLD isolate bootstraps it
// from the newest cache row (one tiny select, only when unknown — edge
// isolates recycle aggressively, hot-reload dev mode spins one per request).
// An empty table means no version is knowable → miss, exactly right. A
// model-version bump changes every hash; stale-version rows age out on the
// 7 d TTL. Bonus (documented, drilled): with a knowable version, repeated
// asks stay on the vector rung even while the worker is down.

/** Cache seam — injectable for tests. lookup returns the pgvector literal. */
export interface AskEmbedCache {
  lookup(ask: string): Promise<string | null>;
  store(ask: string, vector: number[], modelVersion: string): Promise<void>;
}

/** Service-role slice for the cache table (supabase-js chain shapes: the
 *  keyed read, the newest-row version bootstrap, and the upsert). */
export interface CacheDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        gt(column: string, value: string): {
          maybeSingle(): PromiseLike<
            { data: { embedding?: string } | null; error: { message: string } | null }
          >;
        };
      };
      order(column: string, opts: { ascending: boolean }): {
        limit(n: number): {
          maybeSingle(): PromiseLike<
            { data: { model_version?: string } | null; error: { message: string } | null }
          >;
        };
      };
    };
    upsert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

/** SHA-1 hex digest (the §12.3 cache key hash). */
export async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Key = sha1(model_version + '\n' + ask) — §12.3, ask text never stored. */
export function askCacheKey(modelVersion: string, ask: string): Promise<string> {
  return sha1Hex(`${modelVersion}\n${ask}`);
}

export function createAskEmbedCache(
  db: CacheDb,
  opts: { ttlDays?: number; initialModelVersion?: string | null } = {},
): AskEmbedCache {
  const ttlDays = opts.ttlDays ?? ASK_CACHE_TTL_DAYS;
  // Learned from the first successful embed of this warm isolate.
  let knownModelVersion: string | null = opts.initialModelVersion ?? null;

  return {
    async lookup(ask: string): Promise<string | null> {
      if (!knownModelVersion) {
        // Cold isolate: bootstrap the version from the newest cache row.
        const { data, error } = await db
          .from('ask_embed_cache')
          .select('model_version')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(`ask_embed_cache bootstrap failed: ${error.message}`);
        knownModelVersion = data?.model_version ?? null;
        if (!knownModelVersion) return null; // empty cache — nothing knowable yet
      }
      const key = await askCacheKey(knownModelVersion, ask);
      const { data, error } = await db
        .from('ask_embed_cache')
        .select('embedding')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (error) throw new Error(`ask_embed_cache lookup failed: ${error.message}`);
      return data?.embedding ?? null;
    },

    async store(ask: string, vector: number[], modelVersion: string): Promise<void> {
      knownModelVersion = modelVersion;
      const key = await askCacheKey(modelVersion, ask);
      const { error } = await db.from('ask_embed_cache').upsert({
        cache_key: key,
        embedding: toPgVector(vector),
        model_version: modelVersion,
        expires_at: new Date(Date.now() + ttlDays * 86_400_000).toISOString(),
      });
      if (error) throw new Error(`ask_embed_cache store failed: ${error.message}`);
    },
  };
}

/** Display fields — mirrors the portal's LayerProductRow subset. */
export const ASK_PRODUCT_FIELDS =
  'id, name, brand, price_retail, price_trade, images, category, layer';

export interface AskProductRow {
  id: string;
  name: string;
  brand: string | null;
  price_retail: number | null;
  price_trade: number | null;
  images: string[] | null;
  category: string | null;
  layer: string;
}

export interface AskItem extends AskProductRow {
  matched_on: MatchSource[];
  score: number;
}

export interface AskResult {
  items: AskItem[];
  degraded: boolean;
  latency_ms: number;
  result_count: number;
}

export interface AskDeps {
  caller: CallerDb;
  admin: AdminDb;
  /** null = INFERENCE_URL/TOKEN unconfigured → straight to the FTS rung. */
  inference: InferenceClient | null;
  /** §12.3 ask-embed cache (00250). Absent/null = uncached (pre-00250 behavior). */
  cache?: AskEmbedCache | null;
  request: AskRequest;
  userId: string | null;
  log?: (event: string, fields?: Record<string, unknown>) => void;
  now?: () => number;
}

// ─── Orchestration ───────────────────────────────────────────────────────────

async function embedAsk(
  deps: AskDeps,
): Promise<{ pgVector: string | null; degraded: boolean; cacheHit: boolean }> {
  // 1. Cache first (§12.3/00250). Cache errors are misses, never failures.
  if (deps.cache) {
    try {
      const hit = await deps.cache.lookup(deps.request.ask);
      if (hit) {
        deps.log?.('embed_cache_hit');
        return { pgVector: hit, degraded: false, cacheHit: true };
      }
    } catch (err) {
      deps.log?.('embed_cache_error', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!deps.inference) {
    deps.log?.('embed_unconfigured');
    return { pgVector: null, degraded: true, cacheHit: false };
  }
  const inputs: EmbedTextInput[] = [{ id: 'ask', text: deps.request.ask, kind: 'query' }];
  try {
    // The client's per-request timeout (wired to ASK_EMBED_TIMEOUT_MS in
    // index.ts) is the 1.5 s budget — an abort lands here as InferenceError.
    const res = await deps.inference.embedText(inputs);
    const v = res.vectors.find((x) => x.id === 'ask')?.v ?? null;
    if (!v) {
      deps.log?.('embed_no_vector', { errors: res.errors.length });
      return { pgVector: null, degraded: true, cacheHit: false };
    }
    // Best-effort store — a cache-write failure never fails the ask.
    if (deps.cache) {
      try {
        await deps.cache.store(deps.request.ask, v, res.model_version);
      } catch (err) {
        deps.log?.('embed_cache_error', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { pgVector: toPgVector(v), degraded: false, cacheHit: false };
  } catch (err) {
    // Timeout / 429 / worker down — all the same rung: FTS-only, quietly.
    deps.log?.('embed_degraded', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return { pgVector: null, degraded: true, cacheHit: false };
  }
}

function seamFilters(req: AskRequest): Record<string, unknown> {
  const f: Record<string, unknown> = { limit: CANDIDATE_POOL };
  if (req.category) f.category = req.category;
  if (req.layer) f.layer = req.layer;
  return f;
}

/**
 * The ask. Every retrieval goes through deps.caller (RLS); the ONLY admin
 * write is the single match_events row, and event-log failure never fails
 * the ask (observability must not break the surface).
 */
export async function runAsk(deps: AskDeps): Promise<AskResult> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const req = deps.request;
  const filters = seamFilters(req);

  // FTS + embed race in parallel — the FTS leg is useful on BOTH rungs.
  const [ftsSettled, embed] = await Promise.all([
    deps.caller.rpc('aesthete_search', { p_query: req.ask, p_filters: filters }),
    embedAsk(deps),
  ]);

  if (ftsSettled.error) {
    throw new Error(`aesthete_search failed: ${ftsSettled.error.message}`);
  }
  const ftsHits = (ftsSettled.data ?? []) as SeamHit[];

  let vectorHits: SeamHit[] = [];
  if (embed.pgVector) {
    const knn = await deps.caller.rpc('aesthete_ask_knn', {
      p_embedding: embed.pgVector,
      p_filters: filters,
    });
    if (knn.error) {
      // A missing/failed kNN seam degrades like a missing worker — the FTS
      // rung still answers (00247 not yet applied is a deploy-order state,
      // not an outage).
      deps.log?.('knn_degraded', { reason: knn.error.message });
      embed.degraded = true;
    } else {
      vectorHits = (knn.data ?? []) as SeamHit[];
    }
  }

  const merged = mergeCandidates(vectorHits, ftsHits, req.limit);

  // Display fields — through the CALLER client again (RLS on the read too;
  // a candidate id the caller can't see simply drops out here).
  let items: AskItem[] = [];
  if (merged.length > 0) {
    const { data, error } = await deps.caller
      .from('products')
      .select(ASK_PRODUCT_FIELDS)
      .in('id', merged.map((m) => m.product_id));
    if (error) throw new Error(`products fetch failed: ${error.message}`);
    const byId = new Map(((data ?? []) as AskProductRow[]).map((p) => [p.id, p]));
    items = merged.flatMap((m) => {
      const row = byId.get(m.product_id);
      return row ? [{ ...row, matched_on: m.matched_on, score: m.score }] : [];
    });
  }

  const latency = Math.max(0, now() - t0);
  const event = buildAskEvent({
    userId: deps.userId,
    merged,
    latencyMs: latency,
    degraded: embed.degraded,
    vectorCandidates: vectorHits.length,
    ftsCandidates: ftsHits.length,
    category: req.category,
    layer: req.layer,
    limit: req.limit,
    cacheHit: embed.cacheHit,
  });
  try {
    const { error } = await deps.admin.from('match_events').insert(event);
    if (error) deps.log?.('event_insert_failed', { reason: error.message });
  } catch (err) {
    deps.log?.('event_insert_failed', {
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  deps.log?.('ask_done', {
    degraded: embed.degraded,
    result_count: items.length,
    vector_candidates: vectorHits.length,
    fts_candidates: ftsHits.length,
    latency_ms: latency,
  });

  return {
    items,
    degraded: embed.degraded,
    latency_ms: latency,
    result_count: items.length,
  };
}

// ─── JWT payload peek (gateway already verified the signature) ───────────────

/**
 * Decode a JWT payload WITHOUT verification — the Kong/edge gateway has
 * already verified the signature (verify_jwt default-on). We only need the
 * role gate (authenticated, not anon) and the sub for the event row.
 */
export function peekJwt(authHeader: string | null): { sub: string | null; role: string | null } {
  const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
  const parts = token.split('.');
  if (parts.length !== 3) return { sub: null, role: null };
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      ),
    ) as Record<string, unknown>;
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : null,
      role: typeof payload.role === 'string' ? payload.role : null,
    };
  } catch {
    return { sub: null, role: null };
  }
}
