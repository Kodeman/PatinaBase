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
import type { CatalogProductSummary, SpectrumDimension } from '@patina/types';
import {
  classifyRpcError,
  QuizNetworkError,
  type PostgrestErrorBody,
} from '@patina/aesthete-quiz';
import { hydrateCatalogProducts } from './product-hydration';

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
  /** True for Patina Catalog products (layer='catalog' implies this — 00152).
   *  The create_direct_order RPC's own buyability gate (00267) is
   *  `patina_managed OR vendor.is_patina_catalog` — broader than this single
   *  column — but a client's RLS-scoped read of `products` only ever returns
   *  catalog-layer rows (anything else the match RPC surfaced comes back as
   *  `product: undefined` and never reaches the card), and catalog-layer rows
   *  are patina_managed=true by CHECK constraint. So this column alone is a
   *  correct (if narrower) proxy for buyability in the v1 buy surface,
   *  without needing to also fetch vendor.is_patina_catalog. The RPC remains
   *  the authority either way — this is a UX nicety, not the security
   *  boundary. */
  patina_managed: boolean;
  /** Lifecycle status (00060/00129): 'draft' | 'in_review' | 'published' |
   *  'deprecated' | 'archived'. The create_direct_order RPC deliberately does
   *  NOT check this (00267 review note), so the UI is the only gate keeping
   *  the Buy affordance off non-live products. */
  status: string;
}

export interface WireConfig {
  baseUrl: string;
  edgeApiUrl?: string;
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

function matchProduct(summary: CatalogProductSummary): MatchProduct {
  return {
    id: summary.id,
    name: summary.name,
    brand: summary.brand,
    category: summary.category,
    price_retail: summary.retailCents,
    images: summary.imageUrls,
    short_description: summary.shortDescription,
    patina_managed: summary.patinaManaged,
    status: summary.status,
  };
}

async function fetchLegacyMatchProducts(
  config: WireConfig,
  productIds: string[],
): Promise<Map<string, MatchProduct>> {
  const url = new URL(`${config.baseUrl.replace(/\/+$/, '')}/rest/v1/products`);
  url.searchParams.set('id', `in.(${productIds.join(',')})`);
  url.searchParams.set(
    'select',
    'id,name,brand,category,price_retail,images,short_description,patina_managed,status',
  );
  url.searchParams.set('layer', 'eq.catalog');
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('order', 'id.asc');
  let response: Response;
  try {
    response = await fetch(url, {
      headers: headers(config),
      signal: config.signal,
    });
  } catch (cause) {
    throw new QuizNetworkError(
      `Could not reach the catalog: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const rows = await parseOrThrow<MatchProduct[]>(response, 'products');
  return new Map(rows.map((row) => [row.id, row]));
}

/** GET /v1/catalog/products with a constrained PostgREST fallback during the canary. */
export async function fetchMatchProducts(
  config: WireConfig,
  productIds: string[],
): Promise<Map<string, MatchProduct>> {
  const edgeBase = (config.edgeApiUrl ?? config.baseUrl).replace(/\/+$/, '');
  return hydrateCatalogProducts(
    edgeBase,
    productIds,
    matchProduct,
    (safeIds) => fetchLegacyMatchProducts(config, safeIds),
    config.signal,
  );
}
