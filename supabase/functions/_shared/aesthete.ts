// _shared/aesthete.ts — the shared helper every aesthete edge function
// consumes (design §12.1/§12.2/§18; delivery plan Wave 2B).
//
// What lives here (and why here):
//   • adminClient()            — service-role Supabase client factory (the
//                                decision-reminders/po-send idiom, one place).
//   • claimJobs/completeJob    — typed wrappers over the 00241 queue RPCs
//                                (claim_aesthete_jobs FOR UPDATE SKIP LOCKED;
//                                complete_aesthete_job owns ALL backoff/park
//                                semantics — 1 m/5 m/25 m, terminal at
//                                attempts ≥ 5. Workers never compute backoff).
//   • createInferenceClient()  — HTTP client for services/aesthete-inference
//                                (§12.1/§18): Bearer INFERENCE_TOKEN, per-request
//                                timeout (the circuit breaker — no shared breaker
//                                at this scale), and 429 semantics: honor
//                                Retry-After with a small bounded in-invocation
//                                retry, then surface a *retryable* error so the
//                                caller re-enqueues via complete_aesthete_job
//                                rather than retry-looping hot.
//   • vector math              — l2Normalize / meanVector / fuseVectors /
//                                toPgVector: plain array math for the §4.3
//                                fusion, shared so later fns (portfolio embed,
//                                nightly centroids) reuse one implementation.
//   • logLine()                — structured JSON log lines (Logflare convention).
//
// Contention rule 4 (delivery plan): _shared is extended only by the FIRST
// edge agent of a wave; later edge agents rebase onto this file.
//
// Pure exports here are covered by the aesthete-embed-worker deno suite
// (the gate's `edge` tier runs supabase/functions/aesthete-*/ tests).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Job shapes (00241 aesthete_jobs) ────────────────────────────────────────

export type AestheteJobKind =
  | 'embed_text'
  | 'embed_fused'
  | 'dna_draft'
  | 'portfolio_embed'
  | 'centroid';

export interface AestheteJob {
  id: number;
  kind: AestheteJobKind;
  product_id: string | null;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  run_after: string | null;
  last_error: string | null;
  created_at: string | null;
  completed_at: string | null;
}

/**
 * The minimal structural slice of a Supabase client the queue wrappers need —
 * lets tests inject a plain fake instead of mocking supabase-js transport.
 */
export interface RpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

// ─── Service-role client factory ─────────────────────────────────────────────

/**
 * Service-role admin client. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * injected by both `supabase functions serve` and the prod edge runtime.
 * Throws loudly when absent — an aesthete worker without service role is
 * misconfigured, not degraded.
 */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('aesthete: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  }
  return createClient(url, key);
}

// ─── Queue wrappers (00241 RPCs, service-role only) ──────────────────────────

/** Claim up to `batch` pending jobs of `kind` (flips them to 'running'). */
export async function claimJobs(
  client: RpcClient,
  kind: AestheteJobKind,
  batch: number,
): Promise<AestheteJob[]> {
  const { data, error } = await client.rpc('claim_aesthete_jobs', {
    p_kind: kind,
    p_batch: batch,
  });
  if (error) throw new Error(`claim_aesthete_jobs(${kind}): ${error.message}`);
  return (data ?? []) as AestheteJob[];
}

/**
 * Complete a claimed job. 'failed' does NOT mean terminal: the RPC re-enqueues
 * with 1 m/5 m/25 m backoff and only parks the job as terminal 'failed' at
 * attempts ≥ 5 (00241). Never bypass this with direct UPDATEs.
 */
export async function completeJob(
  client: RpcClient,
  id: number,
  status: 'done' | 'failed',
  errorReason?: string,
): Promise<void> {
  const { error } = await client.rpc('complete_aesthete_job', {
    p_id: id,
    p_status: status,
    // Postgres text — keep failure reasons short and greppable.
    p_error: errorReason ? errorReason.slice(0, 500) : null,
  });
  if (error) throw new Error(`complete_aesthete_job(${id}): ${error.message}`);
}

// ─── Inference worker client (§12.1 / §18) ───────────────────────────────────

export const INFERENCE_MAX_BATCH = 16;

export interface EmbedTextInput {
  id: string;
  text: string;
  kind: 'document' | 'query'; // task prefixes applied WORKER-side — send raw text only
}

export interface EmbedImageInput {
  id: string;
  url: string;
}

export interface EmbedVector {
  id: string;
  dim: number;
  v: number[];
}

export interface EmbedItemError {
  id: string;
  reason: string;
}

export interface EmbedResponse {
  model_version: string;
  vectors: EmbedVector[];
  errors: EmbedItemError[];
}

export interface HealthzResponse {
  status: string;
  model_version: string;
  text_dim: number;
  image_dim: number;
  warmed: boolean;
}

/**
 * retryable=true → transient (429/5xx/timeout/network): complete the job
 * 'failed' so the 00241 backoff re-enqueues it. retryable=false → config
 * error (401 bad token, 400 bad payload): also complete 'failed' (the park
 * at 5 attempts bounds the damage) but log loudly — retrying won't fix it.
 */
export class InferenceError extends Error {
  retryable: boolean;
  status?: number;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = 'InferenceError';
    this.retryable = retryable;
    this.status = status;
  }
}

/**
 * Delay before re-attempting a 429'd request, in ms. Honors a numeric
 * Retry-After header (seconds, capped at 5 s so a batch stays inside the
 * 60 s pg_net window); falls back to 500 ms · 2^(attempt−1).
 * Pure — unit-tested (the in-invocation backoff mapping; the *cross*-invocation
 * backoff mapping lives in complete_aesthete_job, 00241).
 */
export function retryDelayMs(retryAfterHeader: string | null, attempt: number): number {
  const parsed = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.min(parsed * 1000, 5000);
  }
  return 500 * Math.pow(2, Math.max(0, attempt - 1));
}

export interface InferenceClientOptions {
  url: string; // e.g. http://host.docker.internal:8000 locally
  token: string; // INFERENCE_TOKEN
  timeoutMs?: number; // per-request abort (default 30 s)
  max429Attempts?: number; // total tries per request on 429 (default 3)
  fetchImpl?: typeof fetch; // test seam
  sleep?: (ms: number) => Promise<void>; // test seam
}

export interface InferenceClient {
  embedText(inputs: EmbedTextInput[]): Promise<EmbedResponse>;
  embedImage(inputs: EmbedImageInput[]): Promise<EmbedResponse>;
  healthz(): Promise<HealthzResponse | null>; // null = unreachable/not warmed probe failure
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createInferenceClient(opts: InferenceClientOptions): InferenceClient {
  const {
    url,
    token,
    timeoutMs = 30_000,
    max429Attempts = 3,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = opts;
  const base = url.replace(/\/+$/, '');

  async function post(path: string, body: unknown): Promise<EmbedResponse> {
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(`${base}${path}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        // Timeout / network — transient by definition here.
        const reason = err instanceof Error ? err.message : String(err);
        throw new InferenceError(`inference ${path} unreachable: ${reason}`, true);
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429) {
        // §12.1: the worker sheds load past depth 8. Bounded in-invocation
        // retry (honoring Retry-After), then surface retryable so the job
        // re-enqueues — never retry-loop hot.
        await res.body?.cancel();
        if (attempt >= max429Attempts) {
          throw new InferenceError(`inference ${path} at capacity (429)`, true, 429);
        }
        await sleep(retryDelayMs(res.headers.get('Retry-After'), attempt));
        continue;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const retryable = res.status >= 500; // 4xx = caller/config bug, 5xx = transient
        throw new InferenceError(
          `inference ${path} → ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
          retryable,
          res.status,
        );
      }

      return (await res.json()) as EmbedResponse;
    }
  }

  return {
    embedText: (inputs) => post('/embed/text', { inputs }),
    embedImage: (inputs) => post('/embed/image', { inputs }),
    healthz: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      try {
        const res = await fetchImpl(`${base}/healthz`, { signal: controller.signal });
        if (!res.ok) return null;
        return (await res.json()) as HealthzResponse;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ─── Vector math (§4.3 fusion — plain array math, no deps) ───────────────────

/** L2-normalize. Zero vectors come back unchanged (callers guard upstream). */
export function l2Normalize(v: number[]): number[] {
  let sq = 0;
  for (const x of v) sq += x * x;
  const norm = Math.sqrt(sq);
  if (norm === 0) return [...v];
  return v.map((x) => x / norm);
}

/** Element-wise mean. All vectors must share a dimension; throws otherwise. */
export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error('meanVector: empty input');
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) {
      throw new Error(`meanVector: dimension mismatch (${v.length} vs ${dim})`);
    }
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/**
 * §4.3 fused product vector:
 *     v_p = normalize( 0.65 · mean(v_img_1..3) + 0.35 · v_caption )
 * Image vectors arrive unit-normalized from the worker; mean() of unit
 * vectors is NOT unit — the outer normalize is load-bearing.
 * Requires ≥ 1 image vector; the caption-only degraded path is the caller's
 * explicit decision (l2Normalize(captionVec)), not a silent fallback here.
 */
export function fuseVectors(
  imageVectors: number[][],
  captionVector: number[],
  wImages = 0.65,
  wCaption = 0.35,
): number[] {
  if (imageVectors.length === 0) {
    throw new Error('fuseVectors: no image vectors (caption-only is a caller decision)');
  }
  const imgMean = meanVector(imageVectors);
  if (imgMean.length !== captionVector.length) {
    throw new Error(
      `fuseVectors: dimension mismatch (images ${imgMean.length} vs caption ${captionVector.length})`,
    );
  }
  const fused = imgMean.map((x, i) => wImages * x + wCaption * captionVector[i]);
  return l2Normalize(fused);
}

/** pgvector text input: '[0.1,0.2,…]' — what PostgREST accepts for vector columns. */
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}

/** Split an array into chunks of ≤ size (inference batch cap is 16). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk: size must be ≥ 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── Structured logging (Logflare convention) ────────────────────────────────

/** One JSON line per event — Logflare ingests edge-runtime stdout as-is. */
export function logLine(fn: string, event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn, event, ...fields }));
}
