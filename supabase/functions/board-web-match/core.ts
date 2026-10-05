// board-web-match · core (PURE: budget, storage, Vision, page fetch and the
// record RPC are injected through WebMatchDeps).
//
// "Search the web for this piece": the designer presses it for a deck piece
// the resolver did not settle. For each piece the crop goes to Google Cloud
// Vision Web Detection; of the pages that carry the picture, only retailer
// and vendor domains are kept (RETAILER_MAP from the resolver plus the
// studio's vendors.website domains), and at most four are read.
//
//   full-matching image on the page     → likely
//   partial-matching image only         → possible
//   visually-similar images             → never shown
//   page read without JSON-LD Product   → rejected
//   page blocked (bot wall, timeout)    → link-only: shop from the domain, name
//                                         from the page title or URL slug, no
//                                         price, possible at most
//
// Web candidates are appended after the piece's existing candidates (at most
// five in all) and never preselected or kept automatically. The budget is
// consumed BEFORE Google is called; a denial calls nothing.

// deno-lint-ignore-file no-explicit-any

import { decodeEntities } from '../_shared/product-page/extract.ts';
import { cleanProductName, readProductPage } from '../_shared/product-page/page.ts';
import { FetchBlocked, HostGate } from '../board-deck-import-resolve/core.ts';
import { hostOf, isDeniedLink, nameFromSlug, normalizeProductUrl } from '../board-deck-import-resolve/links.ts';
import { retailerName } from '../board-deck-import-resolve/retailers.ts';

export { FetchBlocked };

export const MAX_ITEMS = 20;
export const MAX_PAGES_PER_ITEM = 4;
export const VISION_MAX_RESULTS = 10;
const MAX_CANDIDATES = 5;
const ITEM_CONCURRENCY = 4;

export type WebBand = 'likely' | 'possible';
export type WebMatchKind = 'full' | 'partial';

/** The record_board_deck_import_resolution candidate contract (snake_case). */
export interface WebCandidate {
  source: 'web';
  extracted: {
    name?: string;
    brand?: string;
    price_cents?: number;
    images?: string[];
    source_url: string;
  };
  band: WebBand;
  rank: number;
  evidence: Record<string, unknown>;
}

/** A piece as the caller can see it, plus its crop's board-bucket path. */
export interface WebMatchItem {
  item_id: string;
  import_id: string;
  /** The import's board: the crop must be stored under it. */
  board_id: string;
  state: string;
  candidates: Array<Record<string, unknown>>;
  crop_path: string | null;
}

export interface WebPage {
  url: string;
  title: string | null;
  match: WebMatchKind;
  shop: string;
}

export interface Budget {
  granted: number;
  resets_at: string | null;
}

export interface WebMatchDeps {
  consumeBudget: (n: number) => Promise<Budget>;
  /** The crop as base64, or null when it cannot be read. */
  loadCrop: (path: string) => Promise<string | null>;
  /** POST images:annotate with WEB_DETECTION; the raw JSON response. */
  annotate: (contentBase64: string) => Promise<unknown>;
  fetchPage: (url: string) => Promise<{ html: string; finalUrl: string }>;
  /** record_board_web_match_result (00680): false when the piece moved on. */
  record: (
    itemId: string,
    candidates: Array<Record<string, unknown>>,
    baseCandidates: Array<Record<string, unknown>>,
  ) => Promise<boolean>;
  /** Studio vendor domain (lowercase, no www.) → vendor name. */
  vendorDomains: ReadonlyMap<string, string>;
  sleep: (ms: number) => Promise<void>;
  log: (event: string, fields?: Record<string, unknown>) => void;
}

export type ItemStatus = 'found' | 'none' | 'skipped' | 'cap_reached' | 'failed';

export interface ItemResult {
  item_id: string;
  status: ItemStatus;
  added: number;
  reason?: string;
}

export interface WebMatchResult {
  results: ItemResult[];
  cap_reached: boolean;
  resets_at: string | null;
  calls: number;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** The shop behind a page: a known retailer or one of the studio's vendors. */
export function shopFor(url: string, vendorDomains: ReadonlyMap<string, string>): string | null {
  if (isDeniedLink(url)) return null;
  const host = hostOf(normalizeProductUrl(url) ?? '');
  if (!host) return null;
  const retailer = retailerName(host);
  if (retailer) return retailer;
  for (const [domain, name] of vendorDomains) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return null;
}

/** Suffixes under which anyone registers; a vendor website of just one is no shop. */
const PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.nz', 'co.jp', 'co.za', 'co.in', 'com.br', 'com.mx', 'com.cn', 'com.hk', 'com.sg',
]);

/**
 * "https://www.Maker.com/about" → "maker.com". Null for a bare label ('com')
 * or a public suffix ('co.uk'): vendors.website is free text anyone can
 * insert, and such a domain would make every page under it a "shop".
 */
export function vendorDomain(website: string | null | undefined): string | null {
  if (!website || !website.trim()) return null;
  const raw = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  const host = hostOf(raw);
  if (!host) return null;
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((label) => !label) || PUBLIC_SUFFIXES.has(host)) return null;
  return host;
}

/** The crop must sit under this import's board: `{owner}/boards/{board_id}/…`. */
export function cropOnBoard(path: string, boardId: string): boolean {
  const parts = path.split('/');
  return parts.length >= 4 && parts[1] === 'boards' && parts[2].toLowerCase() === boardId.toLowerCase();
}

/** Page text lands in record's 64 KB candidate budget; a paid call must not throw there. */
const MAX_TEXT = 300;

function clamp(value: string | null | undefined): string | null {
  return value ? value.slice(0, MAX_TEXT) : null;
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function nonEmpty(list: unknown): boolean {
  return Array.isArray(list) && list.length > 0;
}

/**
 * Retailer and vendor pages that carry the picture, full matches first,
 * deduped by page, at most MAX_PAGES_PER_ITEM. Visually-similar images are
 * not pages and are ignored.
 */
export function pagesFromVision(body: unknown, vendorDomains: ReadonlyMap<string, string>): WebPage[] {
  const response = (body as any)?.responses?.[0];
  if (response?.error) {
    throw new Error(`vision: ${String(response.error.message ?? response.error.code ?? 'error')}`);
  }
  const raw: any[] = Array.isArray(response?.webDetection?.pagesWithMatchingImages)
    ? response.webDetection.pagesWithMatchingImages
    : [];
  const pages: WebPage[] = [];
  const seen = new Set<string>();
  for (const page of raw) {
    const url = typeof page?.url === 'string' ? page.url : '';
    const match: WebMatchKind | null = nonEmpty(page?.fullMatchingImages)
      ? 'full'
      : nonEmpty(page?.partialMatchingImages)
      ? 'partial'
      : null;
    if (!url || !match) continue;
    const key = normalizeProductUrl(url);
    if (!key || seen.has(key)) continue;
    const shop = shopFor(url, vendorDomains);
    if (!shop) continue;
    seen.add(key);
    const title = typeof page.pageTitle === 'string' ? stripTags(page.pageTitle) : '';
    pages.push({ url, title: title || null, match, shop });
  }
  return pages
    .map((page, index) => ({ page, index }))
    .sort((a, b) => (a.page.match === b.page.match ? a.index - b.index : a.page.match === 'full' ? -1 : 1))
    .map(({ page }) => page)
    .slice(0, MAX_PAGES_PER_ITEM);
}

export function bandFor(match: WebMatchKind): WebBand {
  return match === 'full' ? 'likely' : 'possible';
}

/**
 * The existing candidates, then the web ones not already on the piece (by
 * page), best band first, up to five in all. Null when nothing new fits.
 */
export function mergeCandidates(
  existing: Array<Record<string, unknown>>,
  web: Omit<WebCandidate, 'rank'>[],
): { candidates: Array<Record<string, unknown>>; added: number } | null {
  const seen = new Set<string>();
  let maxRank = 0;
  for (const candidate of existing) {
    const url = (candidate.extracted as any)?.source_url;
    const key = typeof url === 'string' ? normalizeProductUrl(url) : null;
    if (key) seen.add(key);
    maxRank = Math.max(maxRank, Number(candidate.rank) || 0);
  }
  const room = MAX_CANDIDATES - existing.length;
  if (room <= 0) return null;
  const fresh: Omit<WebCandidate, 'rank'>[] = [];
  for (const candidate of [...web].sort((a, b) => (a.band === b.band ? 0 : a.band === 'likely' ? -1 : 1))) {
    const key = normalizeProductUrl(candidate.extracted.source_url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fresh.push(candidate);
    if (fresh.length >= room) break;
  }
  if (!fresh.length) return null;
  return {
    candidates: [
      ...existing,
      ...fresh.map((candidate, index) => ({ ...candidate, rank: maxRank + index + 1 })),
    ],
    added: fresh.length,
  };
}

function eligibility(item: WebMatchItem): string | null {
  if (item.state !== 'found' && item.state !== 'not_found') return `state_${item.state}`;
  if (!item.crop_path) return 'no_picture';
  if (item.candidates.length >= MAX_CANDIDATES) return 'full';
  return null;
}

// ─── One page, one piece ─────────────────────────────────────────────────────

async function readPage(
  page: WebPage,
  deps: WebMatchDeps,
  gate: HostGate,
): Promise<Omit<WebCandidate, 'rank'> | null> {
  const band = bandFor(page.match);
  const evidence = { web_match: page.match };
  const host = hostOf(page.url) ?? '';
  let fetched: { html: string; finalUrl: string };
  try {
    fetched = await gate.run(host, () => deps.fetchPage(page.url));
  } catch (error) {
    if (error instanceof FetchBlocked && error.unsafe) return null;
    // Bot wall or a failed read: link-only, never a fabricated price.
    const name = clamp(cleanProductName(page.title, [page.shop, host, host.split('.')[0]]) ?? nameFromSlug(page.url));
    return {
      source: 'web',
      extracted: {
        ...(name ? { name } : {}),
        brand: page.shop,
        source_url: page.url,
      },
      band: 'possible',
      evidence: { ...evidence, page_read: false, reason: error instanceof FetchBlocked ? error.code : 'fetch_failed' },
    };
  }

  const read = readProductPage(fetched.html, page.url, fetched.finalUrl);
  if (read.kind !== 'product' || !read.hasLdProduct) {
    deps.log('web_page_rejected', { url: page.url, reason: read.reason ?? 'no_ld_product' });
    return null;
  }
  return {
    source: 'web',
    extracted: {
      ...(read.name ? { name: clamp(read.name)! } : {}),
      brand: clamp(read.brand) ?? page.shop,
      ...(read.priceCents != null ? { price_cents: read.priceCents } : {}),
      ...(read.images.length ? { images: read.images.slice(0, 6) } : {}),
      source_url: read.sourceUrl,
    },
    band,
    evidence: { ...evidence, page_read: true },
  };
}

async function matchItem(item: WebMatchItem, crop: string, deps: WebMatchDeps, gate: HostGate): Promise<ItemResult> {
  const pages = pagesFromVision(await deps.annotate(crop), deps.vendorDomains);
  const read = await Promise.all(pages.map((page) => readPage(page, deps, gate)));
  const web = read.filter((candidate): candidate is Omit<WebCandidate, 'rank'> => candidate != null);
  const merged = mergeCandidates(item.candidates, web);
  if (!merged) return { item_id: item.item_id, status: 'none', added: 0 };

  // found_by is set in SQL: 'web' for a piece that had nothing, else unchanged.
  if (!(await deps.record(item.item_id, merged.candidates, item.candidates))) {
    return { item_id: item.item_id, status: 'skipped', added: 0, reason: 'changed' };
  }
  return { item_id: item.item_id, status: 'found', added: merged.added };
}

// ─── HTTP edges ──────────────────────────────────────────────────────────────

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Everything answered before any work: CORS, the `GET ?probe=1` the UI uses
 * to hide itself, and the missing-key 503. Null means: go on with the POST.
 */
export function gate(req: Request, apiKey: string | undefined): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method === 'GET') {
    if (new URL(req.url).searchParams.get('probe') === '1') return json({ enabled: Boolean(apiKey) });
    return json({ error: 'not_found' }, 404);
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!apiKey) return json({ code: 'no_key' }, 503);
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `{item_ids: uuid[]}`, 1..MAX_ITEMS distinct ids; null when malformed. */
export function readItemIds(body: unknown): string[] | null {
  const raw = (body as { item_ids?: unknown })?.item_ids;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (!raw.every((id) => typeof id === 'string' && UUID_RE.test(id))) return null;
  const ids = [...new Set(raw.map((id) => (id as string).toLowerCase()))];
  return ids.length <= MAX_ITEMS ? ids : null;
}

/** A run that could not call Google at all for lack of budget is a 429. */
export function responseFor(result: WebMatchResult): Response {
  if (result.cap_reached && result.calls === 0) {
    return json({ code: 'cap_reached', resets_at: result.resets_at }, 429);
  }
  return json({ ok: true, ...result });
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function inLanes<T>(list: T[], work: (entry: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(ITEM_CONCURRENCY, list.length) }, async () => {
    while (next < list.length) await work(list[next++]);
  }));
}

export async function runWebMatch(items: WebMatchItem[], deps: WebMatchDeps): Promise<WebMatchResult> {
  const results = new Map<string, ItemResult>();
  const eligible: WebMatchItem[] = [];
  for (const item of items) {
    const reason = eligibility(item);
    if (reason) results.set(item.item_id, { item_id: item.item_id, status: 'skipped', added: 0, reason });
    else eligible.push(item);
  }

  // Only a crop on this import's board that actually loads is booked: load
  // first, then consume for that count, then call Google.
  const crops = new Map<string, string>();
  await inLanes(eligible, async (item) => {
    let crop: string | null = null;
    if (cropOnBoard(item.crop_path!, item.board_id)) {
      try {
        crop = await deps.loadCrop(item.crop_path!);
      } catch {
        crop = null;
      }
    } else {
      deps.log('crop_off_board', { item_id: item.item_id });
    }
    if (crop) crops.set(item.item_id, crop);
    else results.set(item.item_id, { item_id: item.item_id, status: 'failed', added: 0, reason: 'crop_unreadable' });
  });
  const loaded = eligible.filter((item) => crops.has(item.item_id));

  let budget: Budget = { granted: 0, resets_at: null };
  if (loaded.length) budget = await deps.consumeBudget(loaded.length);
  const granted = loaded.slice(0, Math.max(0, budget.granted));
  for (const item of loaded.slice(granted.length)) {
    results.set(item.item_id, { item_id: item.item_id, status: 'cap_reached', added: 0 });
  }

  const gate = new HostGate(deps.sleep);
  await inLanes(granted, async (item) => {
    try {
      results.set(item.item_id, await matchItem(item, crops.get(item.item_id)!, deps, gate));
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 200);
      deps.log('web_match_failed', { item_id: item.item_id, error: message });
      results.set(item.item_id, { item_id: item.item_id, status: 'failed', added: 0, reason: 'error' });
    }
  });

  return {
    results: items.map((item) => results.get(item.item_id)!),
    cap_reached: loaded.length > granted.length,
    resets_at: budget.resets_at,
    calls: granted.length,
  };
}
