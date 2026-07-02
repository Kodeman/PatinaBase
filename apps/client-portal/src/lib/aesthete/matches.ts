/**
 * Tiny anon PostgREST wire calls for the quiz results page (Wave 3A).
 *
 * `get_aesthete_matches` ships in migration 00244 (design §10.1) and is
 * callable with the SAME bearer capability as the quiz — the session key.
 * The RPC returns product_id + why only; product facts (name, image, price)
 * come from a second anon read on `products` (RLS: anon sees catalog layer
 * only — 00152 `products_catalog_select_anon`, which matches the RPC's own
 * anon ⇒ catalog visibility rule).
 *
 * Transport + error classification are reused from @patina/aesthete-quiz so
 * rate-limit/unknown-session handling stays identical to the quiz submit.
 * Match row/why TYPES live here (portal-local): the shared hooks batch is
 * Wave 3B territory — fold these into @patina/types if 3B needs them too.
 */
import type { SpectrumDimension } from '@patina/types';
import {
  classifyRpcError,
  QuizNetworkError,
  type PostgrestErrorBody,
} from '@patina/aesthete-quiz';

// ─── wire shapes (mirror migration 00244 §10.1/§10.6 exactly) ────────────────

export interface MatchReason {
  term: string;
  /** Server-rendered copy from `why_phrases` — the ONLY text we show (§10.6 copy law). */
  phrase: string;
  contribution: number;
  detail?: { perception?: string; price_cents?: number };
}

export interface MatchCaution {
  term: string;
  phrase: string;
  penalty: number;
}

export interface MatchWhy {
  score: number;
  confidence: number;
  is_exploration: boolean;
  weights_version: number;
  blend: {
    w: number;
    w_effective: number;
    designer_id: string | null;
    house_version: number | null;
  };
  terms: Record<string, number>;
  top_reasons: MatchReason[];
  cautions: MatchCaution[];
  stretch_axis: SpectrumDimension | null;
}

export interface AestheteMatchRow {
  product_id: string;
  rank: number;
  score: number;
  confidence: number;
  is_exploration: boolean;
  why: MatchWhy;
}

/** The anon-readable product facts a match card needs. */
export interface MatchProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price_retail: number | null; // cents
  images: string[] | null;
  short_description: string | null;
}

export interface WireConfig {
  baseUrl: string;
  anonKey: string;
  accessToken?: string;
  signal?: AbortSignal;
}

function headers(config: WireConfig): HeadersInit {
  return {
    'Content-Type': 'application/json',
    apikey: config.anonKey,
    Authorization: `Bearer ${config.accessToken ?? config.anonKey}`,
  };
}

async function parseOrThrow<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    let body: PostgrestErrorBody | null = null;
    try {
      body = (await response.json()) as PostgrestErrorBody;
    } catch {
      body = null;
    }
    throw classifyRpcError(response.status, body);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new QuizNetworkError(`Malformed JSON in the ${label} response`, {
      status: response.status,
    });
  }
}

/**
 * POST /rest/v1/rpc/get_aesthete_matches — anon or authed, same session key
 * the quiz submitted with (§7.1 "the caller then requests matches with the
 * same capability").
 */
export async function fetchAestheteMatches(
  config: WireConfig,
  sessionKey: string,
  limit = 10,
): Promise<AestheteMatchRow[]> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/rest/v1/rpc/get_aesthete_matches`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify({ p_session_key: sessionKey, p_limit: limit }),
      signal: config.signal,
    });
  } catch (cause) {
    throw new QuizNetworkError(
      `Could not reach ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const rows = await parseOrThrow<AestheteMatchRow[]>(response, 'get_aesthete_matches');
  return Array.isArray(rows) ? rows : [];
}

/** GET /rest/v1/products?id=in.(…) — anon RLS permits catalog-layer rows only. */
export async function fetchMatchProducts(
  config: WireConfig,
  productIds: string[],
): Promise<Map<string, MatchProduct>> {
  if (productIds.length === 0) return new Map();
  const select = 'id,name,brand,category,price_retail,images,short_description';
  const url =
    `${config.baseUrl.replace(/\/+$/, '')}/rest/v1/products` +
    `?id=in.(${productIds.join(',')})&select=${select}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: headers(config), signal: config.signal });
  } catch (cause) {
    throw new QuizNetworkError(
      `Could not reach ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const rows = await parseOrThrow<MatchProduct[]>(response, 'products');
  return new Map(rows.map((row) => [row.id, row]));
}
