// board-deck-import-resolve · core (PURE: fetch, Supabase, Claude and the
// embedder are injected through ResolveDeps).
//
// One run claims ≤8 pending pieces (SKIP LOCKED lease, 00676), resolves each
// through the tiers below, records the candidates, and then tries to pair any
// link that came back with a page photo to an unclaimed product crop by look.
//
//   T0a link_existing  normalized URL = a visible products.source_url  strong
//   T0b link           page read: JSON-LD Product / OG price            strong if the
//                      link is on the picture, else likely; non-product page → none.
//                      Page blocked or failed → link-only (page_read=false), likely.
//   T0c sku            caption SKU + vendor = products.vendor_sku       strong
//   T1  words          caption name/vendor → visible text search        likely/possible
//   T2  look           crop → /embed/image → 00679 kNN twin (look.ts)    likely/possible
//                      (+ the og:image look-check on read T0b links)
//
// Visibility is always the importing user's (import.created_by), applied in
// SQL by the 00677 service-role helpers. Every result stays unconfirmed until
// the designer keeps it; only strong rows are preselected in the ledger.

// deno-lint-ignore-file no-explicit-any

import { readProductPage } from '../_shared/product-page/page.ts';
import { hostOf, isDeniedLink, nameFromSlug, normalizeProductUrl } from './links.ts';
import { applyLookTier, emptyLookSummary, type LookDeps, type LookSummary } from './look.ts';
import { pairByLook, cosine } from './pairing.ts';
import { retailerName } from './retailers.ts';
import { ADJUDICATION, LIMITS, THRESHOLD_VERSION, THRESHOLDS } from './thresholds.ts';

// ─── Shapes ──────────────────────────────────────────────────────────────────

export type Band = 'strong' | 'likely' | 'possible';
export type CandidateSource = 'link_existing' | 'link' | 'sku' | 'words' | 'look';
export type FoundBy = 'link' | 'words' | 'look';

/** The record_board_deck_import_resolution candidate contract (snake_case). */
export interface Candidate {
  source: CandidateSource;
  product_id?: string;
  extracted?: {
    name?: string;
    brand?: string;
    price_cents?: number;
    images?: string[];
    source_url?: string;
  };
  band: Band;
  rank: number;
  evidence: Record<string, unknown>;
}

export interface ClaimedItem {
  item_id: string;
  import_id: string;
  element_key: string;
  board_item_id: string | null;
  slide_index: number;
  role: string;
  extracted: Record<string, unknown>;
}

export interface DeckLink {
  url: string;
  onPicture: boolean;
  source: string | null;
}

export interface Caption {
  name: string | null;
  vendor: string | null;
  sku: string | null;
  priceCents: number | null;
  text: string | null;
}

export interface ProductHit {
  product_id: string;
  url?: string;
  score?: number;
}

export interface PairablePicture {
  item_id: string;
  slide_index: number;
  image_url: string;
}

export interface AdjudicationContext {
  slide_index: number;
  images: { key: string; alt?: string }[];
  texts: { key: string; text: string }[];
  links: { id: string; url: string; text_context?: string }[];
}

export interface AdjudicationAssignment {
  image_element_key: string;
  text_element_keys: string[];
  link_ids: string[];
}

export type AdjudicationClaim =
  | { status: 'granted' }
  | { status: 'cached'; assignments: AdjudicationAssignment[] }
  | { status: 'denied' };

export interface AdjudicationReply {
  input: unknown;
  usage: { input_tokens: number; output_tokens: number };
}

export class FetchBlocked extends Error {
  constructor(readonly code: string, readonly unsafe: boolean) {
    super(code);
  }
}

/** A non-2xx reply from the Messages API. */
export class AdjudicationHttpError extends Error {
  constructor(readonly status: number) {
    super(`adjudication http ${status}`);
  }
}

const TRANSIENT_ADJUDICATION_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

/** Rate limits, overload, timeouts and dropped connections pass; retry later. */
export function isTransientAdjudicationError(error: unknown): boolean {
  if (error instanceof AdjudicationHttpError) return TRANSIENT_ADJUDICATION_STATUS.has(error.status);
  if (error instanceof TypeError) return true; // fetch: network failure
  const name = (error as { name?: unknown })?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

export interface ResolveDeps {
  /** Lease pending pieces: one import (client path) or across imports (cron). */
  claim(limit: number): Promise<ClaimedItem[]>;
  /** T0a + vendor names for link domains, as import.created_by. */
  matchLinks(importId: string, urls: string[]): Promise<{
    products: ProductHit[];
    vendors: Record<string, string>;
  }>;
  matchSku(importId: string, sku: string, vendor: string): Promise<ProductHit[]>;
  searchWords(importId: string, query: string, vendor: string | null, limit: number): Promise<ProductHit[]>;
  /** Links granted out of `n` (0 = quota spent). */
  consumeLinkQuota(importId: string, n: number): Promise<number>;
  /** SSRF-guarded page read; throws FetchBlocked on any failure. */
  fetchPage(url: string): Promise<{ html: string; finalUrl: string }>;
  record(itemId: string, state: 'found' | 'not_found' | 'pending', foundBy: FoundBy | null, candidates: Candidate[]): Promise<void>;
  pairablePictures(importId: string): Promise<PairablePicture[]>;
  pairLink(linkItemId: string, pictureItemId: string, candidates: Candidate[]): Promise<boolean>;
  /** Null when the embedder is not configured. Map id → vector. */
  embedImages: ((inputs: { id: string; url: string }[]) => Promise<Map<string, number[]>>) | null;
  claimAdjudication(importId: string, slideIndex: number): Promise<AdjudicationClaim>;
  storeAdjudication(importId: string, slideIndex: number, assignments: AdjudicationAssignment[] | null): Promise<void>;
  /** Null when ANTHROPIC_API_KEY is absent: deterministic results only. */
  adjudicate: ((context: AdjudicationContext) => Promise<AdjudicationReply>) | null;
  /** The look tier (look.ts). Absent: links and words only. */
  look?: LookDeps | null;
  sleep(ms: number): Promise<void>;
  log(event: string, fields?: Record<string, unknown>): void;
  /** Clock for the run's start budget; Date.now when omitted. */
  now?: () => number;
}

export interface RunSummary {
  claimed: number;
  found: number;
  not_found: number;
  retried: number;
  paired: number;
  pages_read: number;
  link_only: number;
  quota_denied: number;
  /** Claimed pieces not started before the run's start budget ran out. */
  deferred: number;
  adjudications: number;
  adjudication_input_tokens: number;
  adjudication_output_tokens: number;
  cost_usd: number;
  threshold_version: string;
  look: LookSummary;
}

// ─── Reading what the slide said ─────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function cents(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  return null;
}

const ON_PICTURE_SOURCES = new Set(['picture', 'overlay', 'shape']);

/** The links on a piece: `extracted.links[]` ({url, source?, on_picture?}). */
export function readLinks(extracted: Record<string, unknown>): DeckLink[] {
  const raw = Array.isArray(extracted.links) ? extracted.links : [];
  const out: DeckLink[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const url = str((entry as any).url);
    if (!url || isDeniedLink(url)) continue;
    const source = str((entry as any).source) ?? str((entry as any).origin);
    out.push({
      url,
      source,
      onPicture: (entry as any).on_picture === true || (source != null && ON_PICTURE_SOURCES.has(source)),
    });
  }
  // A link on the picture itself is read first.
  return out.sort((a, b) => Number(b.onPicture) - Number(a.onPicture));
}

/** The caption: `extracted.caption{}` or the same keys flat on extracted. */
export function readCaption(extracted: Record<string, unknown>): Caption {
  const c = extracted.caption && typeof extracted.caption === 'object'
    ? { ...extracted, ...(extracted.caption as Record<string, unknown>) }
    : extracted;
  const altAuto = extracted.alt_auto === true;
  return {
    name: str(c.name) ?? str(c.title),
    vendor: str(c.vendor) ?? str(c.maker) ?? str(c.brand),
    sku: str(c.sku),
    priceCents: cents(c.price_cents) ?? cents(c.price),
    // A plain-string caption is the caption text.
    text: str(c.caption_text) ?? str(c.text) ?? str(extracted.caption) ??
      (altAuto ? null : str(extracted.alt_text)),
  };
}

// ─── Candidate assembly ──────────────────────────────────────────────────────

const BAND_ORDER: Record<Band, number> = { strong: 0, likely: 1, possible: 2 };
const SOURCE_ORDER: Record<CandidateSource, number> = { link_existing: 0, sku: 1, link: 2, words: 3, look: 4 };

/** Dedupe by product or page, best band first, at most five, ranked 1..n. */
export function finalizeCandidates(list: Omit<Candidate, 'rank'>[]): Candidate[] {
  const best = new Map<string, Omit<Candidate, 'rank'>>();
  for (const [index, candidate] of list.entries()) {
    const key = candidate.product_id
      ? `p:${candidate.product_id}`
      : `u:${normalizeProductUrl(candidate.extracted?.source_url ?? '') ?? index}`;
    const held = best.get(key);
    if (!held || BAND_ORDER[candidate.band] < BAND_ORDER[held.band]) best.set(key, candidate);
  }
  return [...best.values()]
    .sort((a, b) =>
      BAND_ORDER[a.band] - BAND_ORDER[b.band] || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source])
    .slice(0, 5)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function foundByOf(candidates: Candidate[]): FoundBy | null {
  const top = candidates[0];
  if (!top) return null;
  if (top.source === 'look') return 'look';
  return top.source === 'link_existing' || top.source === 'link' ? 'link' : 'words';
}

/** T1 banding: a clear top hit is likely, everything else possible. */
export function bandWords(hits: ProductHit[]): Omit<Candidate, 'rank'>[] {
  const sorted = [...hits].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return sorted.map((hit, index) => {
    const score = hit.score ?? 0;
    const next = sorted[index + 1]?.score ?? 0;
    const likely = index === 0 && score >= THRESHOLDS.words.likelyScore &&
      score - next >= THRESHOLDS.words.likelyMargin;
    return {
      source: 'words' as const,
      product_id: hit.product_id,
      band: likely ? 'likely' as const : 'possible' as const,
      evidence: { score: Math.round(score * 1000) / 1000 },
    };
  });
}

// ─── Per-host politeness ─────────────────────────────────────────────────────

export class HostGate {
  private active = new Map<string, number>();
  private last = new Map<string, number>();
  private waiters = new Map<string, (() => void)[]>();

  constructor(
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly perHost = LIMITS.perHostConcurrency,
    private readonly spacingMs = LIMITS.perHostSpacingMs,
    private readonly now: () => number = Date.now,
  ) {}

  async run<T>(host: string, task: () => Promise<T>): Promise<T> {
    while ((this.active.get(host) ?? 0) >= this.perHost) {
      await new Promise<void>((resolve) => {
        const list = this.waiters.get(host) ?? [];
        list.push(resolve);
        this.waiters.set(host, list);
      });
    }
    this.active.set(host, (this.active.get(host) ?? 0) + 1);
    this.peak.set(host, Math.max(this.peak.get(host) ?? 0, this.active.get(host)!));
    const wait = (this.last.get(host) ?? -Infinity) + this.spacingMs - this.now();
    this.last.set(host, Math.max(this.now(), (this.last.get(host) ?? -Infinity) + this.spacingMs));
    try {
      if (wait > 0) await this.sleep(wait);
      return await task();
    } finally {
      this.active.set(host, (this.active.get(host) ?? 1) - 1);
      this.waiters.get(host)?.shift()?.();
    }
  }

  /** Highest number of requests ever in flight for a host (tests). */
  peak = new Map<string, number>();
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  });
  await Promise.all(lanes);
}

// ─── Adjudication ────────────────────────────────────────────────────────────

export const ADJUDICATION_TOOL_NAME = 'assign_slide_elements';

export function adjudicationTool() {
  return {
    name: ADJUDICATION_TOOL_NAME,
    description:
      'Say which text elements and which links on this slide describe each picture. Use only the element keys and link ids given.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['assignments'],
      properties: {
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['image_element_key', 'text_element_keys', 'link_ids'],
            properties: {
              image_element_key: { type: 'string' },
              text_element_keys: { type: 'array', items: { type: 'string' } },
              link_ids: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  };
}

export const ADJUDICATION_SYSTEM =
  'You read one slide of an interior designer\'s mood-board deck. Each picture may be a product; captions and links near it may name it. Assign each text element and each link to the one picture it describes, or to none when it describes no picture or you cannot tell. Use only the keys and ids provided; never invent one and never describe positions. Submit with the provided tool.';

/** The slide context the parser attached to a flagged piece. */
export function readAdjudicationContext(item: ClaimedItem): AdjudicationContext | null {
  if (item.extracted.needs_adjudication !== true) return null;
  const raw = item.extracted.adjudication as any;
  if (!raw || typeof raw !== 'object') return null;
  const images = (Array.isArray(raw.images) ? raw.images : [])
    .filter((x: any) => str(x?.key))
    .map((x: any) => ({ key: String(x.key), ...(str(x.alt) ? { alt: String(x.alt).slice(0, 300) } : {}) }));
  const texts = (Array.isArray(raw.texts) ? raw.texts : [])
    .filter((x: any) => str(x?.key) && str(x?.text))
    .map((x: any) => ({ key: String(x.key), text: String(x.text).slice(0, 500) }));
  const links = (Array.isArray(raw.links) ? raw.links : [])
    .filter((x: any) => str(x?.id) && str(x?.url))
    .map((x: any) => ({
      id: String(x.id),
      url: String(x.url).slice(0, 2048),
      ...(str(x.text_context) ? { text_context: String(x.text_context).slice(0, 300) } : {}),
    }));
  if (images.length === 0 || (texts.length === 0 && links.length === 0)) return null;
  return { slide_index: item.slide_index, images, texts, links };
}

/** Keep only known ids; each text and link goes to at most one picture. */
export function validateAssignments(
  input: unknown,
  context: AdjudicationContext,
): AdjudicationAssignment[] | null {
  const list = (input as any)?.assignments;
  if (!Array.isArray(list)) return null;
  const images = new Set(context.images.map((i) => i.key));
  const texts = new Set(context.texts.map((t) => t.key));
  const links = new Set(context.links.map((l) => l.id));
  const usedTexts = new Set<string>();
  const usedLinks = new Set<string>();
  const out: AdjudicationAssignment[] = [];
  for (const entry of list) {
    const key = typeof entry?.image_element_key === 'string' ? entry.image_element_key : null;
    if (!key || !images.has(key) || out.some((o) => o.image_element_key === key)) continue;
    const t = (Array.isArray(entry.text_element_keys) ? entry.text_element_keys : [])
      .filter((k: unknown) => typeof k === 'string' && texts.has(k) && !usedTexts.has(k));
    const l = (Array.isArray(entry.link_ids) ? entry.link_ids : [])
      .filter((k: unknown) => typeof k === 'string' && links.has(k) && !usedLinks.has(k));
    t.forEach((k: string) => usedTexts.add(k));
    l.forEach((k: string) => usedLinks.add(k));
    out.push({ image_element_key: key, text_element_keys: t, link_ids: l });
  }
  return out;
}

export function adjudicationCostUsd(usage: { input_tokens: number; output_tokens: number }): number {
  return (usage.input_tokens * ADJUDICATION.usdPerMillionInput +
    usage.output_tokens * ADJUDICATION.usdPerMillionOutput) / 1_000_000;
}

// ─── One piece ───────────────────────────────────────────────────────────────

interface PieceView {
  item: ClaimedItem;
  links: DeckLink[];
  caption: Caption;
  adjudicated: boolean;
  /** A synthetic row for a link no picture claimed (00677 materialize). */
  isLinkItem: boolean;
}

interface PieceOutcome {
  state: 'found' | 'not_found' | 'pending';
  candidates: Candidate[];
  /** For pairing: the page photo of a link-only row. */
  pageImage: string | null;
}

async function resolvePiece(
  view: PieceView,
  deps: ResolveDeps,
  gate: HostGate,
  summary: RunSummary,
): Promise<PieceOutcome> {
  const { item, links, caption } = view;
  const list: Omit<Candidate, 'rank'>[] = [];
  let pageImage: string | null = null;
  const common = view.adjudicated ? { adjudicated: true } : {};

  // T0a: links already in the importer's library. One round trip for all.
  const normalized = links.map((l) => normalizeProductUrl(l.url)).filter((u): u is string => !!u);
  let vendors: Record<string, string> = {};
  if (normalized.length) {
    const matched = await deps.matchLinks(item.import_id, normalized);
    vendors = matched.vendors;
    for (const hit of matched.products) {
      list.push({
        source: 'link_existing',
        product_id: hit.product_id,
        band: 'strong',
        evidence: { ...common, url: hit.url ?? null },
      });
    }
  }

  // T0b: read the best link's page unless the library already had it.
  const primary = links[0];
  if (primary && !list.some((c) => c.source === 'link_existing')) {
    const host = hostOf(primary.url) ?? '';
    const slideEvidence = { ...common, link_on_picture: primary.onPicture, link_source: primary.source };
    const granted = await deps.consumeLinkQuota(item.import_id, 1);
    let read: ReturnType<typeof readProductPage> | null = null;
    let blockedReason: string | null = null;
    if (granted < 1) {
      summary.quota_denied++;
      blockedReason = 'quota';
    } else {
      try {
        const page = await gate.run(host, () => deps.fetchPage(primary.url));
        read = readProductPage(page.html, primary.url, page.finalUrl);
        summary.pages_read++;
      } catch (error) {
        if (error instanceof FetchBlocked && error.unsafe) {
          // An unsafe address is not a shop: no candidate at all.
          deps.log('link_unsafe', { item_id: item.item_id, code: error.code });
          blockedReason = 'unsafe';
        } else {
          blockedReason = error instanceof FetchBlocked ? error.code : 'fetch_failed';
        }
      }
    }

    if (read?.kind === 'product') {
      pageImage = read.images[0] ?? null;
      list.push({
        source: 'link',
        extracted: {
          ...(read.name ? { name: read.name } : {}),
          ...(read.brand ? { brand: read.brand } : {}),
          ...(read.priceCents != null ? { price_cents: read.priceCents } : {}),
          ...(read.images.length ? { images: read.images.slice(0, 6) } : {}),
          source_url: read.sourceUrl,
        },
        band: primary.onPicture ? 'strong' : 'likely',
        evidence: { ...slideEvidence, page_read: true, look_checked: false },
      });
    } else if (read) {
      // A page that is not a product: no candidate; the link stays on the
      // piece's extracted.links for the ledger.
      deps.log('link_not_product', { item_id: item.item_id, reason: read.reason });
    } else if (blockedReason && blockedReason !== 'unsafe') {
      // Link-only: identity from the link, details from the slide. Never a
      // fabricated price; kept-able but never preselected.
      const linkHost = hostOf(primary.url);
      const name = caption.name ?? nameFromSlug(primary.url);
      const brand = caption.vendor ?? (linkHost ? vendors[linkHost] ?? retailerName(linkHost) : null);
      summary.link_only++;
      list.push({
        source: 'link',
        extracted: {
          ...(name ? { name } : {}),
          ...(brand ? { brand } : {}),
          ...(caption.priceCents != null ? { price_cents: caption.priceCents } : {}),
          source_url: primary.url,
        },
        band: 'likely',
        evidence: { ...slideEvidence, page_read: false, reason: blockedReason },
      });
    }
  }

  // T0c: SKU + vendor from the caption.
  if (caption.sku && caption.vendor) {
    for (const hit of await deps.matchSku(item.import_id, caption.sku, caption.vendor)) {
      list.push({ source: 'sku', product_id: hit.product_id, band: 'strong', evidence: { ...common, sku: caption.sku } });
    }
  }

  // T1: words, unless something strong already answered.
  const query = [caption.name ?? caption.text, caption.vendor].filter(Boolean).join(' ').slice(0, 200).trim();
  if (query && !list.some((c) => c.band === 'strong')) {
    const hits = await deps.searchWords(item.import_id, query, caption.vendor, LIMITS.wordsLimit);
    list.push(...bandWords(hits).map((c) => ({ ...c, evidence: { ...c.evidence, ...common } })));
  }

  const candidates = finalizeCandidates(list);
  return { state: candidates.length ? 'found' : 'not_found', candidates, pageImage };
}

// ─── The run ─────────────────────────────────────────────────────────────────

function emptySummary(): RunSummary {
  return {
    claimed: 0,
    found: 0,
    not_found: 0,
    retried: 0,
    paired: 0,
    pages_read: 0,
    link_only: 0,
    quota_denied: 0,
    deferred: 0,
    adjudications: 0,
    adjudication_input_tokens: 0,
    adjudication_output_tokens: 0,
    cost_usd: 0,
    threshold_version: THRESHOLD_VERSION,
    look: emptyLookSummary(),
  };
}

async function adjudicateSlides(
  items: ClaimedItem[],
  deps: ResolveDeps,
  summary: RunSummary,
  pastDeadline: () => boolean,
): Promise<Map<string, { texts: string[]; links: DeckLink[] }>> {
  const byItemKey = new Map<string, { texts: string[]; links: DeckLink[] }>();
  // No API key: no slot is claimed, so none is spent or left pending.
  if (!deps.adjudicate) return byItemKey;
  const slides = new Map<string, AdjudicationContext & { import_id: string }>();
  for (const item of items) {
    const context = readAdjudicationContext(item);
    const key = `${item.import_id}:${item.slide_index}`;
    if (context && !slides.has(key)) slides.set(key, { ...context, import_id: item.import_id });
  }
  for (const [, slide] of slides) {
    if (pastDeadline()) break;
    let assignments: AdjudicationAssignment[] | null = null;
    const claim = await deps.claimAdjudication(slide.import_id, slide.slide_index);
    if (claim.status === 'cached') {
      assignments = claim.assignments;
    } else if (claim.status === 'granted') {
      try {
        const { import_id: _ignored, ...context } = slide;
        const reply = await deps.adjudicate(context);
        summary.adjudications++;
        summary.adjudication_input_tokens += reply.usage.input_tokens;
        summary.adjudication_output_tokens += reply.usage.output_tokens;
        summary.cost_usd += adjudicationCostUsd(reply.usage);
        assignments = validateAssignments(reply.input, context);
      } catch (error) {
        const transient = isTransientAdjudicationError(error);
        deps.log('adjudication_failed', {
          import_id: slide.import_id,
          transient,
          error: String(error).slice(0, 200),
        });
        // A transient failure stores nothing: the pending slot is reclaimed
        // once its lease ages out. Anything else is recorded as failed.
        if (transient) continue;
      }
      await deps.storeAdjudication(slide.import_id, slide.slide_index, assignments);
    }
    if (!assignments) continue;
    const texts = new Map(slide.texts.map((t) => [t.key, t.text]));
    const links = new Map(slide.links.map((l) => [l.id, l.url]));
    for (const a of assignments) {
      byItemKey.set(`${slide.import_id}:${a.image_element_key}`, {
        texts: a.text_element_keys.map((k) => texts.get(k)!).filter(Boolean),
        links: a.link_ids
          .map((id) => links.get(id)!)
          .filter((url) => url && !isDeniedLink(url))
          .map((url) => ({ url, onPicture: false, source: 'adjudicated' })),
      });
    }
  }
  return byItemKey;
}

function viewOf(item: ClaimedItem, adjudicated?: { texts: string[]; links: DeckLink[] }): PieceView {
  const caption = readCaption(item.extracted);
  const links = readLinks(item.extracted);
  if (adjudicated) {
    const known = new Set(links.map((l) => normalizeProductUrl(l.url)));
    for (const link of adjudicated.links) {
      if (!known.has(normalizeProductUrl(link.url))) links.push(link);
    }
    if (!caption.name && !caption.text && adjudicated.texts.length) {
      caption.text = adjudicated.texts.join(' ').slice(0, 300);
    }
  }
  return {
    item,
    links,
    caption,
    adjudicated: !!adjudicated,
    isLinkItem: item.board_item_id == null && item.element_key.startsWith('link:'),
  };
}

async function pairLinksByLook(
  outcomes: { view: PieceView; outcome: PieceOutcome }[],
  deps: ResolveDeps,
  summary: RunSummary,
): Promise<void> {
  if (!deps.embedImages) return;
  const byImport = new Map<string, { view: PieceView; outcome: PieceOutcome }[]>();
  for (const entry of outcomes) {
    if (!entry.view.isLinkItem || entry.outcome.state !== 'found' || !entry.outcome.pageImage) continue;
    const list = byImport.get(entry.view.item.import_id) ?? [];
    list.push(entry);
    byImport.set(entry.view.item.import_id, list);
  }
  for (const [importId, linkRows] of byImport) {
    const pictures = await deps.pairablePictures(importId);
    if (pictures.length === 0) continue;
    let vectors: Map<string, number[]>;
    try {
      vectors = await deps.embedImages([
        ...linkRows.map((r) => ({ id: `link:${r.view.item.item_id}`, url: r.outcome.pageImage! })),
        ...pictures.map((p) => ({ id: `crop:${p.item_id}`, url: p.image_url })),
      ]);
    } catch (error) {
      deps.log('embed_failed', { import_id: importId, error: String(error).slice(0, 200) });
      continue;
    }
    // Slide links pair on their own slide first; deck-level links deck-wide.
    const groups = new Map<string, typeof linkRows>();
    for (const row of linkRows) {
      const scope = row.view.item.extracted.deck_level === true ? 'deck' : `slide:${row.view.item.slide_index}`;
      groups.set(scope, [...(groups.get(scope) ?? []), row]);
    }
    const taken = new Set<string>();
    const scopes = [...groups.keys()].filter((s) => s !== 'deck');
    if (groups.has('deck')) scopes.push('deck');
    for (const scope of scopes) {
      const rows = groups.get(scope)!.filter((r) => vectors.has(`link:${r.view.item.item_id}`));
      const crops = pictures.filter((p) =>
        !taken.has(p.item_id) && vectors.has(`crop:${p.item_id}`) &&
        (scope === 'deck' || `slide:${p.slide_index}` === scope));
      if (rows.length === 0 || crops.length === 0) continue;
      const sim = rows.map((r) =>
        crops.map((c) => cosine(vectors.get(`link:${r.view.item.item_id}`)!, vectors.get(`crop:${c.item_id}`)!)));
      for (const pair of pairByLook(sim)) {
        const row = rows[pair.link];
        const crop = crops[pair.crop];
        const candidates = finalizeCandidates(row.outcome.candidates.map(({ rank: _r, ...c }) => ({
          ...c,
          band: 'likely' as const,
          evidence: {
            ...c.evidence,
            paired_by: 'look',
            pair_similarity: Math.round(pair.similarity * 1000) / 1000,
            pair_margin: Math.round(pair.margin * 1000) / 1000,
            threshold_version: THRESHOLD_VERSION,
          },
        })));
        if (await deps.pairLink(row.view.item.item_id, crop.item_id, candidates)) {
          taken.add(crop.item_id);
          summary.paired++;
        }
      }
    }
  }
}

/**
 * One resolver run. The claim is the billing guard: nothing external (page
 * fetch, Claude, embedder) happens unless pending pieces were leased.
 */
export async function runResolve(deps: ResolveDeps): Promise<RunSummary> {
  const now = deps.now ?? Date.now;
  const deadline = now() + LIMITS.runStartBudgetMs;
  const pastDeadline = () => now() >= deadline;
  const summary = emptySummary();
  const items = await deps.claim(LIMITS.itemsPerRun);
  summary.claimed = items.length;
  if (items.length === 0) return summary;

  const adjudicated = await adjudicateSlides(items, deps, summary, pastDeadline);
  const gate = new HostGate(deps.sleep);
  const resolved: { view: PieceView; outcome: PieceOutcome }[] = [];
  const results: { view: PieceView; outcome: PieceOutcome }[] = [];

  await pool(items, LIMITS.runConcurrency, async (item) => {
    // Past the start budget nothing new begins; the lease runs out and the
    // claim sweep backs the piece off before it is tried again.
    if (pastDeadline()) {
      summary.deferred++;
      return;
    }
    const view = viewOf(item, adjudicated.get(`${item.import_id}:${item.element_key}`));
    let outcome: PieceOutcome;
    try {
      outcome = await resolvePiece(view, deps, gate, summary);
    } catch (error) {
      // A tier failed (database, network): retry later with backoff.
      deps.log('piece_failed', { item_id: item.item_id, error: String(error).slice(0, 200) });
      outcome = { state: 'pending', candidates: [], pageImage: null };
    }
    resolved.push({ view, outcome });
  });

  // T2 and the og:image look-check, before record: the lease still holds.
  await applyLookTier(resolved, deps, summary.look);

  await pool(resolved, LIMITS.runConcurrency, async ({ view, outcome }) => {
    const item = view.item;
    try {
      await deps.record(item.item_id, outcome.state, foundByOf(outcome.candidates), outcome.candidates);
      if (outcome.state === 'found') summary.found++;
      else if (outcome.state === 'not_found') summary.not_found++;
      else summary.retried++;
      results.push({ view, outcome });
    } catch (error) {
      // The lease expires and the piece is claimed again.
      deps.log('record_failed', { item_id: item.item_id, error: String(error).slice(0, 200) });
      summary.retried++;
    }
  });

  await pairLinksByLook(results, deps, summary);
  summary.cost_usd = Math.round(summary.cost_usd * 1_000_000) / 1_000_000;
  return summary;
}
