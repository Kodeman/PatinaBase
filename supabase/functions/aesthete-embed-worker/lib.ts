// aesthete-embed-worker/lib.ts — pure logic + orchestration for the embed
// drain (design §6.1 pipeline, §12.2 embed row, §4.3 vector production).
//
// index.ts boots Deno.serve and wires real deps; everything testable lives
// here behind narrow structural interfaces (fake db + fake inference in the
// deno suite — no transport mocking needed).
//
// One invocation (pg_cron every minute, body {batch_size?}):
//   0. index.ts probes /healthz first — if the inference worker is down the
//      invocation returns WITHOUT claiming, so queued jobs never burn 00241
//      attempts on a dead worker ("queue and drain on recovery — nothing
//      lost", §12.1 degradation ladder rung 3).
//   1. Claim up to batch_size embed_text jobs (drained FIRST — fused needs
//      captions but NOT text-embed results; text is the cheap kind).
//      Embed `name ‖ description ‖ materials` (kind=document) →
//      UPDATE products.embedding (+ embedding_updated_at) — brings the 00008
//      similarity RPCs and semantic search alive (§4.3).
//   2. Claim up to batch_size embed_fused jobs. Per product: build the §4.3
//      deterministic style caption from product_dna + products fields, fetch
//      up to 3 image URLs → /embed/image (chunked ≤ 16/request), caption →
//      /embed/text, fuse 0.65/0.35 with L2 normalize IN THIS FN (plain array
//      math) → UPDATE products.aesthete_vector + style_caption +
//      aesthete_vector_at + aesthete_model_version.
//   3. Claim up to batch_size portfolio_embed jobs (Wave 4B, 00249). Per
//      item: resolve the image URL — a storage_path that is already
//      http(s):// is used verbatim (the dev/demo affordance documented in
//      00249), otherwise a short-lived signed URL on the private
//      `portfolio-items` bucket — → /embed/image → UPDATE
//      designer_portfolio_items.embedding + status='embedded'. After the
//      batch, recompute_portfolio_centroid runs once per touched designer
//      (§4.3: v_D0 geometric median; the RPC owns the math).
//   4. Per-item failures → complete_aesthete_job('failed', reason) — the
//      00241 RPC owns backoff (1 m/5 m/25 m) and the terminal park at
//      attempts ≥ 5 (portfolio items additionally flip status='failed' when
//      their job parks). Batch sizing keeps one invocation well inside the
//      60 s pg_net window (16 fused jobs ≈ ≤ 48 image embeds ≈ 5–20 s).

import {
  type AestheteJob,
  chunk,
  claimJobs,
  completeJob,
  type EmbedImageInput,
  type EmbedTextInput,
  fuseVectors,
  INFERENCE_MAX_BATCH,
  type InferenceClient,
  InferenceError,
  l2Normalize,
  type RpcClient,
  toPgVector,
} from '../_shared/aesthete.ts';

// ─── Body parsing ────────────────────────────────────────────────────────────

export const DEFAULT_BATCH_SIZE = 16;

/** {batch_size?} → clamped [1, 16]; anything unparseable → 16. */
export function parseBatchSize(body: unknown): number {
  if (typeof body !== 'object' || body === null) return DEFAULT_BATCH_SIZE;
  const raw = (body as Record<string, unknown>).batch_size;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.max(Math.floor(n), 1), INFERENCE_MAX_BATCH);
}

// ─── Text builders (deterministic — §4.3) ────────────────────────────────────

export interface ProductTextFields {
  name: string | null;
  description: string | null;
  materials: string[] | null;
}

/**
 * embed_text content: `name ‖ description ‖ materials` (kind=document) —
 * the plain text embedding for products.embedding. Missing parts drop out;
 * separator is a newline (the document encoder is context-friendly).
 */
export function buildEmbedText(p: ProductTextFields): string {
  const parts = [
    p.name?.trim() || null,
    p.description?.trim() || null,
    p.materials && p.materials.length > 0 ? p.materials.join(', ') : null,
  ];
  return parts.filter((s): s is string => !!s).join('\n');
}

export interface StyleCaptionFields {
  // product_dna (may be entirely absent pre-teaching/pre-draft)
  silhouette: string | null;
  palette_family: string | null;
  mood_keywords: string[] | null;
  ambiance: string | null;
  // products
  category: string | null;
  materials: string[] | null;
  finish: string | null;
  name: string | null; // last-resort fallback only
}

/** dna_vocab values are snake_case ('warm_earth') — captions read as prose. */
function deSnake(s: string): string {
  return s.replaceAll('_', ' ');
}

/**
 * The §4.3 deterministic style caption:
 *   "{silhouette} {category} in {materials}, {finish} finish,
 *    {palette_family}, {mood_keywords}, {ambiance}"
 * NOT the raw retailer description (SEO noise pulls vectors into wrong
 * neighborhoods). Missing fields drop out of the template; before any DNA
 * exists the caption degrades to the products-only fields (category /
 * materials / finish), and to the bare name as a last resort — the caption
 * is regenerated (and the vector re-embedded) when DNA lands, via the 00241
 * re-embed triggers. Stored on products.style_caption for reproducibility.
 */
export function buildStyleCaption(f: StyleCaptionFields): string {
  const head = [f.silhouette?.trim(), f.category?.trim()]
    .filter((s): s is string => !!s)
    .map(deSnake)
    .join(' ');
  const materials = f.materials && f.materials.length > 0 ? f.materials.join(', ') : null;
  const headWithMaterials = head && materials
    ? `${head} in ${materials}`
    : head || (materials ? `in ${materials}` : '');

  const segments = [
    headWithMaterials || null,
    f.finish?.trim() ? `${deSnake(f.finish.trim())} finish` : null,
    f.palette_family?.trim() ? deSnake(f.palette_family.trim()) : null,
    f.mood_keywords && f.mood_keywords.length > 0 ? f.mood_keywords.map(deSnake).join(', ') : null,
    f.ambiance?.trim() || null,
  ].filter((s): s is string => !!s);

  const caption = segments.join(', ');
  return caption || f.name?.trim() || '';
}

// ─── Narrow db surface (supabase-js builders are thenables — fakeable) ───────

export interface ProductRow {
  id: string;
  name: string | null;
  description: string | null;
  materials: string[] | null;
  category: string | null;
  finish: string | null;
  images: string[] | null;
}

export interface DnaRow {
  product_id: string;
  silhouette: string | null;
  palette_family: string | null;
  mood_keywords: string[] | null;
  ambiance: string | null;
}

export interface DbLike extends RpcClient {
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: string[],
      ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    update(patch: Record<string, unknown>): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export interface PortfolioItemRow {
  id: string;
  designer_id: string;
  storage_path: string;
  status: string;
}

/** Private bucket for portfolio imagery (00249, capture-media precedent). */
export const PORTFOLIO_BUCKET = 'portfolio-items';
/** Signed-URL lifetime — long enough for the inference worker to fetch. */
export const PORTFOLIO_SIGNED_URL_TTL_SEC = 600;

/**
 * A storage_path that is already an absolute http(s) URL is embedded
 * verbatim — the dev/demo affordance documented in 00249 (live proofs and
 * seeds reference public imagery). Bucket paths return null and go through
 * the signer.
 */
export function directPortfolioUrl(storagePath: string): string | null {
  return /^https?:\/\//i.test(storagePath) ? storagePath : null;
}

export interface EmbedBatchDeps {
  db: DbLike;
  inference: InferenceClient;
  batchSize: number;
  /**
   * Signed-URL factory for the private portfolio-items bucket (wired from
   * the admin client's storage API in index.ts; fakeable in tests). Absent →
   * bucket-pathed portfolio jobs fail as a config error (http(s) paths still
   * work).
   */
  signUrl?: (
    bucket: string,
    path: string,
    expiresInSec: number,
  ) => Promise<{ url: string | null; error: string | null }>;
  /** injected clock for deterministic tests */
  now?: () => Date;
  log?: (event: string, fields?: Record<string, unknown>) => void;
}

export interface EmbedBatchResult {
  claimed: number;
  done: number;
  failed: number;
  ms: number;
  kinds: {
    embed_text: { claimed: number; done: number; failed: number };
    embed_fused: { claimed: number; done: number; failed: number };
    portfolio_embed: { claimed: number; done: number; failed: number };
  };
}

const MAX_FUSED_IMAGES = 3;

interface KindTally {
  claimed: number;
  done: number;
  failed: number;
}

/** complete + tally, never letting a completion error kill the whole drain. */
async function finish(
  deps: EmbedBatchDeps,
  tally: KindTally,
  job: AestheteJob,
  status: 'done' | 'failed',
  reason?: string,
): Promise<void> {
  try {
    await completeJob(deps.db, job.id, status, reason);
    if (status === 'done') tally.done++;
    else {
      tally.failed++;
      deps.log?.('job_failed', { job_id: job.id, kind: job.kind, reason });
    }
  } catch (err) {
    // The job stays 'running'; conductor-visible via aesthete_jobs. Rare —
    // means the DB write itself failed (e.g. mid-run db reset).
    tally.failed++;
    deps.log?.('complete_job_error', {
      job_id: job.id,
      kind: job.kind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function errMessage(err: unknown): string {
  if (err instanceof InferenceError) return err.message;
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

async function loadProducts(
  deps: EmbedBatchDeps,
  ids: string[],
): Promise<Map<string, ProductRow>> {
  const { data, error } = await deps.db
    .from('products')
    .select('id, name, description, materials, category, finish, images')
    .in('id', ids);
  if (error) throw new Error(`products lookup failed: ${error.message}`);
  return new Map(((data ?? []) as ProductRow[]).map((p) => [p.id, p]));
}

async function loadDna(deps: EmbedBatchDeps, ids: string[]): Promise<Map<string, DnaRow>> {
  const { data, error } = await deps.db
    .from('product_dna')
    .select('product_id, silhouette, palette_family, mood_keywords, ambiance')
    .in('product_id', ids);
  if (error) throw new Error(`product_dna lookup failed: ${error.message}`);
  return new Map(((data ?? []) as DnaRow[]).map((d) => [d.product_id, d]));
}

// ─── embed_text drain ────────────────────────────────────────────────────────

async function drainEmbedText(deps: EmbedBatchDeps, tally: KindTally): Promise<void> {
  const jobs = await claimJobs(deps.db, 'embed_text', deps.batchSize);
  tally.claimed = jobs.length;
  if (jobs.length === 0) return;

  const withProduct: AestheteJob[] = [];
  let products: Map<string, ProductRow>;
  try {
    products = await loadProducts(deps, jobs.map((j) => j.product_id!).filter(Boolean));
  } catch (err) {
    for (const job of jobs) await finish(deps, tally, job, 'failed', errMessage(err));
    return;
  }

  const inputs: EmbedTextInput[] = [];
  for (const job of jobs) {
    const product = job.product_id ? products.get(job.product_id) : undefined;
    if (!product) {
      // FK is ON DELETE CASCADE, so this is a race with a delete — terminal
      // via the normal attempts ladder.
      await finish(deps, tally, job, 'failed', 'product not found');
      continue;
    }
    const text = buildEmbedText(product);
    if (!text) {
      await finish(deps, tally, job, 'failed', 'no text to embed (empty name/description/materials)');
      continue;
    }
    withProduct.push(job);
    inputs.push({ id: String(job.id), text, kind: 'document' });
  }
  if (inputs.length === 0) return;

  let response;
  try {
    response = await deps.inference.embedText(inputs); // ≤ 16 by claim size
  } catch (err) {
    const reason = errMessage(err);
    for (const job of withProduct) await finish(deps, tally, job, 'failed', reason);
    return;
  }

  const vectorsByJob = new Map(response.vectors.map((v) => [v.id, v]));
  const errorsByJob = new Map(response.errors.map((e) => [e.id, e.reason]));
  const nowIso = (deps.now?.() ?? new Date()).toISOString();

  for (const job of withProduct) {
    const key = String(job.id);
    const vec = vectorsByJob.get(key);
    if (!vec) {
      await finish(deps, tally, job, 'failed', errorsByJob.get(key) ?? 'no vector returned');
      continue;
    }
    const { error } = await deps.db
      .from('products')
      .update({ embedding: toPgVector(vec.v), embedding_updated_at: nowIso })
      .eq('id', job.product_id!);
    if (error) {
      await finish(deps, tally, job, 'failed', `embedding update failed: ${error.message}`);
      continue;
    }
    await finish(deps, tally, job, 'done');
  }
}

// ─── embed_fused drain ───────────────────────────────────────────────────────

interface FusedWork {
  job: AestheteJob;
  product: ProductRow;
  caption: string;
  imageUrls: string[];
  imageVectors: number[][];
  imageErrors: string[];
  captionVector?: number[];
  failed?: string; // reason, once decided
}

async function drainEmbedFused(deps: EmbedBatchDeps, tally: KindTally): Promise<void> {
  const jobs = await claimJobs(deps.db, 'embed_fused', deps.batchSize);
  tally.claimed = jobs.length;
  if (jobs.length === 0) return;

  let products: Map<string, ProductRow>;
  let dna: Map<string, DnaRow>;
  try {
    const ids = jobs.map((j) => j.product_id!).filter(Boolean);
    [products, dna] = await Promise.all([loadProducts(deps, ids), loadDna(deps, ids)]);
  } catch (err) {
    for (const job of jobs) await finish(deps, tally, job, 'failed', errMessage(err));
    return;
  }

  const work: FusedWork[] = [];
  for (const job of jobs) {
    const product = job.product_id ? products.get(job.product_id) : undefined;
    if (!product) {
      await finish(deps, tally, job, 'failed', 'product not found');
      continue;
    }
    const d = dna.get(product.id);
    const caption = buildStyleCaption({
      silhouette: d?.silhouette ?? null,
      palette_family: d?.palette_family ?? null,
      mood_keywords: d?.mood_keywords ?? null,
      ambiance: d?.ambiance ?? null,
      category: product.category,
      materials: product.materials,
      finish: product.finish,
      name: product.name,
    });
    if (!caption) {
      await finish(deps, tally, job, 'failed', 'no caption inputs (empty product)');
      continue;
    }
    work.push({
      job,
      product,
      caption,
      imageUrls: (product.images ?? []).slice(0, MAX_FUSED_IMAGES),
      imageVectors: [],
      imageErrors: [],
    });
  }
  if (work.length === 0) return;

  // ── images: batch across jobs, ≤ 16 per request (worker cap) ─────────────
  const imageInputs: EmbedImageInput[] = work.flatMap((w) =>
    w.imageUrls.map((url, i) => ({ id: `${w.job.id}:${i}`, url }))
  );
  const workByJobId = new Map(work.map((w) => [String(w.job.id), w]));
  let modelVersion: string | null = null;

  for (const batch of chunk(imageInputs, INFERENCE_MAX_BATCH)) {
    try {
      const res = await deps.inference.embedImage(batch);
      modelVersion = res.model_version;
      for (const v of res.vectors) {
        workByJobId.get(v.id.split(':')[0])?.imageVectors.push(v.v);
      }
      for (const e of res.errors) {
        workByJobId.get(e.id.split(':')[0])?.imageErrors.push(e.reason);
      }
    } catch (err) {
      // Whole-request failure: every job with an image in THIS chunk fails
      // (retryable via 00241 backoff); other chunks proceed.
      const reason = errMessage(err);
      for (const input of batch) {
        const w = workByJobId.get(input.id.split(':')[0]);
        if (w && !w.failed) w.failed = `image embed request failed: ${reason}`;
      }
    }
  }

  // ── captions: one text batch per ≤ 16 jobs (kind=document — §4.2 says
  // captions are documents) ─────────────────────────────────────────────────
  const pendingCaption = work.filter((w) => !w.failed);
  for (const batch of chunk(pendingCaption, INFERENCE_MAX_BATCH)) {
    const inputs: EmbedTextInput[] = batch.map((w) => ({
      id: String(w.job.id),
      text: w.caption,
      kind: 'document',
    }));
    try {
      const res = await deps.inference.embedText(inputs);
      modelVersion = res.model_version;
      const byId = new Map(res.vectors.map((v) => [v.id, v.v]));
      const errById = new Map(res.errors.map((e) => [e.id, e.reason]));
      for (const w of batch) {
        const v = byId.get(String(w.job.id));
        if (v) w.captionVector = v;
        else w.failed = `caption embed failed: ${errById.get(String(w.job.id)) ?? 'no vector returned'}`;
      }
    } catch (err) {
      const reason = errMessage(err);
      for (const w of batch) if (!w.failed) w.failed = `caption embed request failed: ${reason}`;
    }
  }

  // ── fuse + persist ────────────────────────────────────────────────────────
  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  for (const w of work) {
    if (w.failed) {
      await finish(deps, tally, w.job, 'failed', w.failed);
      continue;
    }
    if (!w.captionVector) {
      await finish(deps, tally, w.job, 'failed', 'caption embed missing');
      continue;
    }
    if (w.imageUrls.length > 0 && w.imageVectors.length === 0) {
      // Images exist but none embedded (dead URLs, fetch errors) — retryable;
      // if the URLs are permanently dead the attempts ladder parks it.
      await finish(
        deps,
        tally,
        w.job,
        'failed',
        `all ${w.imageUrls.length} image(s) failed: ${w.imageErrors.join('; ') || 'unknown'}`,
      );
      continue;
    }

    // §4.3: normalize(0.65·mean(images) + 0.35·caption). A product with NO
    // images at all (legitimate: manual adds) takes the caption-only degraded
    // path — same aligned space, better than no vector; re-embeds when images
    // land via the 00241 UPDATE OF images trigger.
    const degraded = w.imageVectors.length === 0;
    const fused = degraded
      ? l2Normalize(w.captionVector)
      : fuseVectors(w.imageVectors, w.captionVector);
    if (degraded) {
      deps.log?.('fused_caption_only', { job_id: w.job.id, product_id: w.product.id });
    } else if (w.imageErrors.length > 0) {
      // Some images embedded, some didn't (dead URL etc.) — fuse with what we
      // have and log; a later image change re-enqueues via the 00241 trigger.
      deps.log?.('fused_partial_images', {
        job_id: w.job.id,
        product_id: w.product.id,
        embedded: w.imageVectors.length,
        errors: w.imageErrors,
      });
    }

    const { error } = await deps.db
      .from('products')
      .update({
        aesthete_vector: toPgVector(fused),
        style_caption: w.caption,
        aesthete_vector_at: nowIso,
        aesthete_model_version: modelVersion,
      })
      .eq('id', w.product.id);
    if (error) {
      await finish(deps, tally, w.job, 'failed', `aesthete_vector update failed: ${error.message}`);
      continue;
    }
    await finish(deps, tally, w.job, 'done');
  }
}

// ─── portfolio_embed drain (Wave 4B, 00249) ──────────────────────────────────

interface PortfolioWork {
  job: AestheteJob;
  item: PortfolioItemRow;
  url?: string;
  failed?: string;
}

/** Terminal-park mirror: at attempts ≥ 5 complete_aesthete_job parks the job
 * as 'failed'; the portfolio item row flips to 'failed' too so the owner's
 * surface can say so honestly. */
function willPark(job: AestheteJob): boolean {
  return job.attempts >= 5;
}

async function drainPortfolioEmbed(deps: EmbedBatchDeps, tally: KindTally): Promise<void> {
  const jobs = await claimJobs(deps.db, 'portfolio_embed', deps.batchSize);
  tally.claimed = jobs.length;
  if (jobs.length === 0) return;

  const failItem = async (w: PortfolioWork, reason: string) => {
    if (willPark(w.job)) {
      const { error } = await deps.db
        .from('designer_portfolio_items')
        .update({ status: 'failed' })
        .eq('id', w.item.id);
      if (error) {
        deps.log?.('portfolio_item_status_error', { item_id: w.item.id, error: error.message });
      }
    }
    await finish(deps, tally, w.job, 'failed', reason);
  };

  // payload carries the item ref (job.product_id is NULL for this kind).
  const itemIds = jobs
    .map((j) => (j.payload?.portfolio_item_id as string | undefined) ?? null)
    .filter((id): id is string => !!id);

  let items: Map<string, PortfolioItemRow>;
  try {
    const { data, error } = await deps.db
      .from('designer_portfolio_items')
      .select('id, designer_id, storage_path, status')
      .in('id', itemIds);
    if (error) throw new Error(`portfolio items lookup failed: ${error.message}`);
    items = new Map(((data ?? []) as PortfolioItemRow[]).map((i) => [i.id, i]));
  } catch (err) {
    for (const job of jobs) await finish(deps, tally, job, 'failed', errMessage(err));
    return;
  }

  const work: PortfolioWork[] = [];
  for (const job of jobs) {
    const itemId = (job.payload?.portfolio_item_id as string | undefined) ?? null;
    const item = itemId ? items.get(itemId) : undefined;
    if (!item) {
      // Row deleted since enqueue (owner delete) — terminal via the ladder.
      await finish(deps, tally, job, 'failed', 'portfolio item not found');
      continue;
    }
    work.push({ job, item });
  }
  if (work.length === 0) return;

  // ── resolve URLs: verbatim http(s), else signed bucket URL ────────────────
  for (const w of work) {
    const direct = directPortfolioUrl(w.item.storage_path);
    if (direct) {
      w.url = direct;
      continue;
    }
    if (!deps.signUrl) {
      w.failed = 'no signed-url factory configured for bucket path';
      continue;
    }
    try {
      const { url, error } = await deps.signUrl(
        PORTFOLIO_BUCKET,
        w.item.storage_path,
        PORTFOLIO_SIGNED_URL_TTL_SEC,
      );
      if (!url) w.failed = `signed URL failed: ${error ?? 'no url returned'}`;
      else w.url = url;
    } catch (err) {
      w.failed = `signed URL failed: ${errMessage(err)}`;
    }
  }

  // ── embed (≤ 16 per request — one image per item) ─────────────────────────
  const pending = work.filter((w) => !w.failed);
  const vectorsByItem = new Map<string, number[]>();
  const errorsByItem = new Map<string, string>();
  for (const batch of chunk(pending, INFERENCE_MAX_BATCH)) {
    const inputs: EmbedImageInput[] = batch.map((w) => ({ id: w.item.id, url: w.url! }));
    try {
      const res = await deps.inference.embedImage(inputs);
      for (const v of res.vectors) vectorsByItem.set(v.id, v.v);
      for (const e of res.errors) errorsByItem.set(e.id, e.reason);
    } catch (err) {
      const reason = errMessage(err);
      for (const w of batch) if (!w.failed) w.failed = `image embed request failed: ${reason}`;
    }
  }

  // ── persist + tally ───────────────────────────────────────────────────────
  const touchedDesigners = new Set<string>();
  for (const w of work) {
    if (w.failed) {
      await failItem(w, w.failed);
      continue;
    }
    const vec = vectorsByItem.get(w.item.id);
    if (!vec) {
      await failItem(w, errorsByItem.get(w.item.id) ?? 'no vector returned');
      continue;
    }
    const { error } = await deps.db
      .from('designer_portfolio_items')
      .update({ embedding: toPgVector(vec), status: 'embedded' })
      .eq('id', w.item.id);
    if (error) {
      await failItem(w, `embedding update failed: ${error.message}`);
      continue;
    }
    touchedDesigners.add(w.item.designer_id);
    await finish(deps, tally, w.job, 'done');
  }

  // ── centroid recompute per touched designer (§4.3; RPC owns the math) ────
  for (const designerId of touchedDesigners) {
    try {
      const { data, error } = await deps.db.rpc('recompute_portfolio_centroid', {
        p_designer_id: designerId,
      });
      if (error) throw new Error(error.message);
      deps.log?.('portfolio_centroid_recomputed', {
        designer_id: designerId,
        result: data as Record<string, unknown>,
      });
    } catch (err) {
      // Never fatal: the 00249 nightly sweep recomputes stale designers.
      deps.log?.('portfolio_centroid_error', {
        designer_id: designerId,
        error: errMessage(err),
      });
    }
  }
}

// ─── entry ───────────────────────────────────────────────────────────────────

export async function runEmbedBatch(deps: EmbedBatchDeps): Promise<EmbedBatchResult> {
  const t0 = Date.now();
  const text: KindTally = { claimed: 0, done: 0, failed: 0 };
  const fused: KindTally = { claimed: 0, done: 0, failed: 0 };
  const portfolio: KindTally = { claimed: 0, done: 0, failed: 0 };

  // embed_text first (§12.2 embed row: fused needs captions but NOT
  // text-embed results — order is priority, not dependency). Portfolio last:
  // product vectors serve live matching; portfolio images only seed v_D0.
  await drainEmbedText(deps, text);
  await drainEmbedFused(deps, fused);
  await drainPortfolioEmbed(deps, portfolio);

  const result: EmbedBatchResult = {
    claimed: text.claimed + fused.claimed + portfolio.claimed,
    done: text.done + fused.done + portfolio.done,
    failed: text.failed + fused.failed + portfolio.failed,
    ms: Date.now() - t0,
    kinds: { embed_text: text, embed_fused: fused, portfolio_embed: portfolio },
  };
  deps.log?.('batch_done', { ...result });
  return result;
}
