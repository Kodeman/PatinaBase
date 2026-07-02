// Pure logic for the aesthete-dna-draft edge function (Aesthete Wave 2C).
//
// Design contract: docs/prds/AE/aesthete-engine-system-design.md §6.2 (models,
// cost, spend governor), §6.3 (prompt architecture, output schema, triage,
// calibration), §5.2 (product_dna_drafts — drafts NEVER write canonical rows),
// §12.2 (dna_draft job row: batch 4, 2-way concurrency, dedupe on
// prompt_version, spend guard parks the queue).
//
// Everything here is dependency-free so it unit-tests under plain `deno test`
// (po-send lib.ts convention). All I/O goes through two injected ports:
//   • DbPort     — narrow Supabase surface, implemented in ./db.ts.
//                  NOTE (drafts-never-canon, §5.2): this port deliberately has
//                  NO method that can touch product_dna or
//                  product_style_spectrum. Draft spectrums live inside the
//                  draft jsonb; the teaching UI prefers them into sliders and
//                  only a designer save writes the canonical tables.
//   • ClaudeCaller — one Messages-API call, implemented in ./claude.ts over
//                  the official @anthropic-ai/sdk. Tests inject fixtures.

// ─── Constants (§6.2 / §12.2) ────────────────────────────────────────────────

export const PROMPT_VERSION = 'p1';
export const BULK_MODEL = 'claude-haiku-4-5';
export const ESCALATION_MODEL = 'claude-sonnet-5';
export const JOB_KIND = 'dna_draft';
/** §12.2: 4 products per invocation, 2-way concurrency — with the per-call
 * timeout (20 s) and maxRetries 1 set in index.ts this bounds an invocation
 * to ≤ 2 sequential products per lane, worst-case ≈ 2 × (haiku + sonnet
 * escalation) ≈ 40–50 s — inside the 60 s pg_net window. Jobs not started by
 * the deadline are completed 'failed' (→ 1 min backoff, next cron retries). */
export const BATCH_SIZE = 4;
export const CONCURRENCY = 2;
export const MAX_IMAGES = 3;
export const MAX_OUTPUT_TOKENS = 3000;
/** §6.2: escalate to Sonnet when Haiku's overall_confidence < 0.6. */
export const ESCALATION_CONFIDENCE = 0.6;
export const DEFAULT_DAILY_BUDGET_USD = 20;
/** Machine actor for product_styles.assigned_by (NOT NULL, no FK — 00001).
 * The nil UUID marks engine-written rows; source='ml_predicted' is the real
 * provenance signal. Flagged in the handoff. */
export const ENGINE_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

/** §6.2 rates, USD per MTok. Cache write = 1.25×, cache read = 0.1× input. */
export const PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  [BULK_MODEL]: { inputPerMTok: 1, outputPerMTok: 5 },
  [ESCALATION_MODEL]: { inputPerMTok: 3, outputPerMTok: 15 },
};
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;

// ─── Row / wire types ────────────────────────────────────────────────────────

export interface ArchetypeRow {
  id: string;
  name: string;
  description: string | null;
  visual_markers: string[] | null;
}

export interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  short_description: string | null;
  materials: string[] | null;
  price_retail: number | null; // cents
  images: string[] | null;
  source_url: string | null;
}

export interface JobRow {
  id: number;
  kind: string;
  product_id: string | null;
}

export interface DraftInsert {
  product_id: string;
  draft: Record<string, unknown>;
  model: string;
  prompt_version: string;
  overall_confidence: number | null;
}

export interface StyleInsert {
  product_id: string;
  style_id: string;
  confidence: number;
  is_primary: boolean;
  source: 'ml_predicted';
  assigned_by: string;
}

export interface TriagePatch {
  requires_deep_analysis: boolean;
  priority: 'high' | 'normal' | 'low';
}

export interface SpendDelta {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  usd: number;
  products: number;
}

/** Narrow DB surface. Deliberately NO product_dna / product_style_spectrum
 * methods — see the drafts-never-canon note at the top of this file. */
export interface DbPort {
  getSpendToday(day: string): Promise<{ usd: number } | null>;
  loadArchetypes(): Promise<ArchetypeRow[]>;
  claimJobs(kind: string, batch: number): Promise<JobRow[]>;
  completeJob(id: number, status: 'done' | 'failed', error?: string): Promise<void>;
  loadProduct(productId: string): Promise<ProductRow | null>;
  getDraft(
    productId: string,
    promptVersion: string,
  ): Promise<{ id: number; overall_confidence: number | null } | null>;
  insertDraft(row: DraftInsert): Promise<void>;
  updateDraft(id: number, row: DraftInsert): Promise<void>;
  listStyles(productId: string): Promise<{ style_id: string; source: string }[]>;
  deleteMlStyles(productId: string): Promise<void>;
  insertStyles(rows: StyleInsert[]): Promise<void>;
  applyTriage(productId: string, patch: TriagePatch): Promise<void>;
  addSpend(day: string, delta: SpendDelta): Promise<void>;
}

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface ModelResponse {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: ModelUsage;
}

/** One Anthropic Messages API call. Params are the fully-built request body
 * (see buildDraftRequest); the ./claude.ts adapter feeds it to the SDK. */
export type ClaudeCaller = (params: Record<string, unknown>) => Promise<ModelResponse>;

export type Logger = (event: string, fields?: Record<string, unknown>) => void;

// ─── System prompt (§6.3: stable cached prefix) ─────────────────────────────

/** The six spectrum pole anchors, verbatim from the product brief
 * (docs/prds/AE/aesthete-engine-product-brief.md, Part II §6 table). */
const SPECTRUM_DEFINITIONS = `Score each of the six style spectrums in [-1, 1]:
- warmth: -1 = Cool (metal, glass, stone) · +1 = Warm (wood, fabric, earth)
- complexity: -1 = Minimal, clean-lined · +1 = Ornate, detailed, layered
- formality: -1 = Casual, everyday · +1 = Formal, occasion
- timelessness: -1 = Trendy, of-the-moment · +1 = Classic, always-relevant
- boldness: -1 = Subtle, background · +1 = Statement, conversation-starter
- craftsmanship: -1 = Mass-produced · +1 = Artisan, hand-made`;

/** Build the stable cached system prefix (§6.3): role, spectrum definitions
 * with pole anchors, the 12 archetypes (names + descriptions + visual_markers
 * loaded from the styles table at runtime — single enum source), then the
 * few-shot calibration slot.
 *
 * TODO(Wave 3D): inject 4–6 few-shot calibration turns — anchor products from
 * spectrum_calibration_products as image + gold-score exemplars. The table is
 * unseeded until the week-4 calibration sprint; without anchors, per-image
 * scores are internally coherent but mutually incomparable (§6.3). Bump
 * PROMPT_VERSION when they land.
 */
export function buildSystemPrompt(archetypes: ArchetypeRow[]): string {
  const archetypeBlock = archetypes
    .map((a) => {
      const markers = (a.visual_markers ?? []).join(', ');
      return `### ${a.name}\n${a.description ?? ''}${markers ? `\nVisual markers: ${markers}` : ''}`;
    })
    .join('\n\n');

  return `You are a senior furniture analyst for an interior design studio. Given product images and retailer text, you extract the product's aesthetic DNA as structured data: identity and provenance, form and silhouette, material and construction, color and finish, patina and aging potential, style signature, function, context, and commercial read.

Ground every score in what you can actually see or read. When imagery is occluded, ambiguous, or missing, lower the relevant confidence and name the gap in "uncertainties" — an honest low-confidence read is worth more than a confident guess. Never invent provenance.

${SPECTRUM_DEFINITIONS}

Confidence values are in [0, 1]. Other bounded scores: craftsmanship_tier, patina potential, material_honesty, comfort, flexibility, color saturation, sheen and pattern_density are in [0, 1]; line_quality (rectilinear → curvilinear), visual_scale (airy → commanding), negative_space and color temperature (cool → warm) are in [-1, 1].

Style archetypes — choose the primary and up to two secondary archetypes from exactly this list (use the names verbatim):

${archetypeBlock}`;
}

// ─── Output schema (§6.3 contract, structured-outputs dialect) ──────────────
// Structured-outputs constraints: every object carries additionalProperties:
// false + required; no numeric min/max (ranges are clamped in validateDraft);
// nullable fields via anyOf. Archetype names are an enum built from the
// styles table so drafts always resolve to real style ids.

type Schema = Record<string, unknown>;

const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const str: Schema = { type: 'string' };
const num: Schema = { type: 'number' };
const strArr: Schema = { type: 'array', items: { type: 'string' } };

function obj(properties: Record<string, Schema>): Schema {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

export const SPECTRUM_KEYS = [
  'warmth',
  'complexity',
  'formality',
  'timelessness',
  'boldness',
  'craftsmanship',
] as const;

export function buildDraftSchema(archetypeNames: string[]): Schema {
  const archetypeEnum: Schema = { type: 'string', enum: archetypeNames };
  const spectrumMap = obj(Object.fromEntries(SPECTRUM_KEYS.map((k) => [k, num])));
  return obj({
    identity: obj({
      era: nullable(str),
      origin_country: nullable(str),
      provenance_candidate: nullable(str),
      conf: num,
    }),
    form: obj({
      silhouette: nullable(str),
      line_quality: nullable(num),
      visual_scale: nullable(num),
      negative_space: nullable(num),
      leg_style: nullable(str),
      arm_profile: nullable(str),
      back_profile: nullable(str),
      symmetry: nullable(str),
      conf: num,
    }),
    material: obj({
      primary: nullable(str),
      materials: strArr,
      finish: nullable(str),
      joinery: nullable(str),
      surface_texture: nullable(str),
      solidity: nullable(num),
      craftsmanship_tier: nullable(num),
      conf: num,
    }),
    color: obj({
      dominant_hex: nullable(str),
      palette_family: nullable(str),
      temperature: nullable(num),
      value: nullable(num),
      saturation: nullable(num),
      sheen: nullable(num),
      pattern_density: nullable(num),
      conf: num,
    }),
    patina: obj({
      potential: nullable(num),
      material_honesty: nullable(num),
      trajectory: nullable(str),
      conf: num,
    }),
    style: obj({
      primary_archetype: archetypeEnum,
      secondary: {
        type: 'array',
        items: obj({ archetype: archetypeEnum, weight: num }),
      },
      spectrums: spectrumMap,
      spectrum_conf: spectrumMap,
      mood_keywords: strArr,
      ambiance: nullable(str),
      conf: num,
    }),
    function: obj({
      primary_use: nullable(str),
      comfort: nullable(num),
      flexibility: nullable(num),
      durability_for: { type: 'array', items: { type: 'string', enum: ['kids', 'pets', 'high_traffic'] } },
      conf: num,
    }),
    context: obj({ min_room_feel: nullable(str), conf: num }),
    commercial: obj({
      price_tier_estimate: nullable(str),
      value_story_draft: nullable(str),
      conf: num,
    }),
    overall_confidence: num,
    uncertainties: strArr,
  });
}

// ─── Request building (§6.3: volatile per-product content after the cache) ──

export function selectImageUrls(images: string[] | null | undefined): string[] {
  return (images ?? [])
    .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
    .slice(0, MAX_IMAGES);
}

export function buildRetailerText(product: ProductRow): string {
  const lines: string[] = ['Analyze this product.'];
  lines.push(`Name: ${product.name}`);
  if (product.brand) lines.push(`Brand: ${product.brand}`);
  const category = [product.category, product.subcategory].filter(Boolean).join(' / ');
  if (category) lines.push(`Category: ${category}`);
  if (product.materials?.length) lines.push(`Listed materials: ${product.materials.join(', ')}`);
  if (typeof product.price_retail === 'number') {
    lines.push(`Retail price: $${(product.price_retail / 100).toFixed(2)}`);
  }
  const description = product.short_description || product.description;
  if (description) lines.push(`Retailer description: ${description.slice(0, 2000)}`);
  return lines.join('\n');
}

/** Full Messages API request body. The system prefix carries cache_control so
 * the ~10k-token role/spectrum/archetype block reads at 0.1× across the batch
 * (§6.2); per-product images + retailer text sit after the breakpoint. */
export function buildDraftRequest(
  model: string,
  product: ProductRow,
  imageUrls: string[],
  archetypes: ArchetypeRow[],
): Record<string, unknown> {
  const content: Record<string, unknown>[] = imageUrls.map((url) => ({
    type: 'image',
    source: { type: 'url', url },
  }));
  content.push({ type: 'text', text: buildRetailerText(product) });

  const request: Record<string, unknown> = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(archetypes),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: buildDraftSchema(archetypes.map((a) => a.name)),
      },
    },
  };
  if (model === ESCALATION_MODEL) {
    // Sonnet 5 runs adaptive thinking when the field is omitted; disable it so
    // escalations stay inside the §6.2 cost model (~1k output tokens).
    request.thinking = { type: 'disabled' };
  }
  return request;
}

// ─── Response parsing + validation ───────────────────────────────────────────

export type ParsedDraft =
  | { ok: true; draft: Record<string, unknown>; confidence: number }
  | { ok: false; kind: 'refusal' | 'truncated' | 'schema_failure'; detail: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const SIGNED_PATHS: [string, string][] = [
  ['form', 'line_quality'],
  ['form', 'visual_scale'],
  ['form', 'negative_space'],
  ['material', 'solidity'],
  ['color', 'temperature'],
  ['color', 'value'],
];
const UNIT_PATHS: [string, string][] = [
  ['material', 'craftsmanship_tier'],
  ['color', 'saturation'],
  ['color', 'sheen'],
  ['color', 'pattern_density'],
  ['patina', 'potential'],
  ['patina', 'material_honesty'],
  ['function', 'comfort'],
  ['function', 'flexibility'],
];
const FAMILIES = [
  'identity',
  'form',
  'material',
  'color',
  'patina',
  'style',
  'function',
  'context',
  'commercial',
] as const;

/** Structural validation + range clamping of a parsed draft object. Structured
 * outputs guarantee schema conformance on the wire, but the validator is the
 * escalation trigger for anything that slips (refusal text, truncation,
 * unknown archetypes) and the range clamp the schema dialect cannot express. */
export function validateDraft(
  raw: unknown,
  archetypeNames: string[],
): ParsedDraft {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, kind: 'schema_failure', detail: 'draft is not an object' };
  }
  const draft = raw as Record<string, unknown>;

  for (const family of FAMILIES) {
    const value = draft[family];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, kind: 'schema_failure', detail: `missing family: ${family}` };
    }
  }
  const overall = draft.overall_confidence;
  if (typeof overall !== 'number' || !Number.isFinite(overall)) {
    return { ok: false, kind: 'schema_failure', detail: 'overall_confidence missing' };
  }
  draft.overall_confidence = clamp(overall, 0, 1);

  const style = draft.style as Record<string, unknown>;
  if (typeof style.primary_archetype !== 'string' || !archetypeNames.includes(style.primary_archetype)) {
    return {
      ok: false,
      kind: 'schema_failure',
      detail: `unknown primary_archetype: ${String(style.primary_archetype)}`,
    };
  }
  const spectrums = style.spectrums;
  if (typeof spectrums !== 'object' || spectrums === null) {
    return { ok: false, kind: 'schema_failure', detail: 'style.spectrums missing' };
  }
  for (const key of SPECTRUM_KEYS) {
    const v = (spectrums as Record<string, unknown>)[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, kind: 'schema_failure', detail: `spectrum ${key} missing` };
    }
    (spectrums as Record<string, unknown>)[key] = clamp(v, -1, 1);
  }
  const spectrumConf = style.spectrum_conf;
  if (typeof spectrumConf === 'object' && spectrumConf !== null) {
    for (const key of SPECTRUM_KEYS) {
      const v = (spectrumConf as Record<string, unknown>)[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        (spectrumConf as Record<string, unknown>)[key] = clamp(v, 0, 1);
      }
    }
  }
  if (!Array.isArray(style.secondary)) style.secondary = [];
  style.secondary = (style.secondary as unknown[]).filter(
    (s): s is Record<string, unknown> =>
      typeof s === 'object' && s !== null &&
      typeof (s as Record<string, unknown>).archetype === 'string' &&
      archetypeNames.includes((s as Record<string, unknown>).archetype as string) &&
      typeof (s as Record<string, unknown>).weight === 'number',
  );
  for (const s of style.secondary as Record<string, unknown>[]) {
    s.weight = clamp(s.weight as number, 0, 1);
  }

  for (const [family, attr] of SIGNED_PATHS) {
    const fam = draft[family] as Record<string, unknown>;
    if (typeof fam[attr] === 'number') fam[attr] = clamp(fam[attr] as number, -1, 1);
  }
  for (const [family, attr] of UNIT_PATHS) {
    const fam = draft[family] as Record<string, unknown>;
    if (typeof fam[attr] === 'number') fam[attr] = clamp(fam[attr] as number, 0, 1);
  }
  for (const family of FAMILIES) {
    const fam = draft[family] as Record<string, unknown>;
    if (typeof fam.conf === 'number') fam.conf = clamp(fam.conf as number, 0, 1);
  }
  if (!Array.isArray(draft.uncertainties)) draft.uncertainties = [];

  return { ok: true, draft, confidence: draft.overall_confidence as number };
}

/** Turn a raw Messages API response into a validated draft (or a typed
 * failure). Handles refusal and max_tokens stop reasons per §6.3 triage. */
export function parseDraftResponse(
  response: ModelResponse,
  archetypeNames: string[],
): ParsedDraft {
  if (response.stop_reason === 'refusal') {
    return { ok: false, kind: 'refusal', detail: 'model declined the request' };
  }
  if (response.stop_reason === 'max_tokens') {
    return { ok: false, kind: 'truncated', detail: 'output hit max_tokens' };
  }
  const text = response.content.find((b) => b.type === 'text' && typeof b.text === 'string')?.text;
  if (!text) {
    return { ok: false, kind: 'schema_failure', detail: 'no text block in response' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, kind: 'schema_failure', detail: 'response is not valid JSON' };
  }
  return validateDraft(parsed, archetypeNames);
}

// ─── Spend accounting (§6.2) ─────────────────────────────────────────────────

export function computeCostUsd(model: string, usage: ModelUsage): number {
  const rates = PRICING[model];
  if (!rates) return 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const usd =
    (usage.input_tokens * rates.inputPerMTok +
      cacheWrite * rates.inputPerMTok * CACHE_WRITE_MULT +
      cacheRead * rates.inputPerMTok * CACHE_READ_MULT +
      usage.output_tokens * rates.outputPerMTok) /
    1_000_000;
  return usd;
}

export class SpendAccumulator {
  input_tokens = 0;
  output_tokens = 0;
  cache_read_tokens = 0;
  usd = 0;
  products = 0;

  add(model: string, usage: ModelUsage): void {
    // Ledger folds cache writes into input_tokens (they are input tokens);
    // cache reads tracked separately per the 00241 column set.
    this.input_tokens += usage.input_tokens + (usage.cache_creation_input_tokens ?? 0);
    this.output_tokens += usage.output_tokens;
    this.cache_read_tokens += usage.cache_read_input_tokens ?? 0;
    this.usd += computeCostUsd(model, usage);
  }

  toDelta(): SpendDelta {
    return {
      input_tokens: this.input_tokens,
      output_tokens: this.output_tokens,
      cache_read_tokens: this.cache_read_tokens,
      usd: Math.round(this.usd * 10000) / 10000,
      products: this.products,
    };
  }
}

// ─── Triage (§6.3) ───────────────────────────────────────────────────────────

/** §6.3 bands: ≥ 0.75 → quick-validate (no deep analysis, low urgency for
 * designer time); 0.5–0.75 → normal pending; < 0.5 / refusal / schema failure
 * → requires_deep_analysis with a priority bump. */
export function triageBand(confidence: number | null): TriagePatch {
  if (confidence === null || confidence < 0.5) {
    return { requires_deep_analysis: true, priority: 'high' };
  }
  if (confidence >= 0.75) {
    return { requires_deep_analysis: false, priority: 'low' };
  }
  return { requires_deep_analysis: false, priority: 'normal' };
}

// ─── Draft write policy ──────────────────────────────────────────────────────

/** UNIQUE(product_id, prompt_version): update only when the existing draft's
 * overall_confidence is strictly lower (null counts as lower). */
export function shouldReplaceDraft(
  existingConfidence: number | null,
  newConfidence: number | null,
): boolean {
  if (existingConfidence === null) return true;
  if (newConfidence === null) return false;
  return newConfidence > existingConfidence;
}

export function stylesFromDraft(
  productId: string,
  draft: Record<string, unknown>,
  archetypesByName: Map<string, string>,
  protectedStyleIds: Set<string>,
): StyleInsert[] {
  const style = draft.style as Record<string, unknown>;
  const overall = typeof draft.overall_confidence === 'number' ? draft.overall_confidence : 0.5;
  const familyConf = typeof style.conf === 'number' ? style.conf : overall;
  const rows: StyleInsert[] = [];
  const seen = new Set<string>();

  const primaryId = archetypesByName.get(style.primary_archetype as string);
  if (primaryId && !protectedStyleIds.has(primaryId)) {
    rows.push({
      product_id: productId,
      style_id: primaryId,
      confidence: clamp(familyConf, 0, 1),
      is_primary: true,
      source: 'ml_predicted',
      assigned_by: ENGINE_ACTOR_ID,
    });
    seen.add(primaryId);
  }
  for (const secondary of (style.secondary ?? []) as Record<string, unknown>[]) {
    const id = archetypesByName.get(secondary.archetype as string);
    if (!id || protectedStyleIds.has(id) || seen.has(id)) continue;
    rows.push({
      product_id: productId,
      style_id: id,
      confidence: clamp(secondary.weight as number, 0, 1),
      is_primary: false,
      source: 'ml_predicted',
      assigned_by: ENGINE_ACTOR_ID,
    });
    seen.add(id);
  }
  return rows;
}

// ─── Per-product pipeline ────────────────────────────────────────────────────

export type ProductDraftResult =
  | {
    outcome: 'drafted';
    draft: Record<string, unknown>;
    confidence: number;
    model: string;
    escalated: boolean;
  }
  | { outcome: 'no_draft'; reason: string; escalated: boolean };

function isImageFetchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /image|url/i.test(message) && /fetch|download|retriev|invalid/i.test(message);
}

/** One API call; if the failure looks like an unfetchable image URL (dead
 * retailer links are common on captures), retry once text-only rather than
 * permanently failing the product. */
async function callModel(
  claude: ClaudeCaller,
  model: string,
  product: ProductRow,
  imageUrls: string[],
  archetypes: ArchetypeRow[],
  spend: SpendAccumulator,
  log: Logger,
): Promise<ModelResponse> {
  try {
    const response = await claude(buildDraftRequest(model, product, imageUrls, archetypes));
    spend.add(model, response.usage);
    return response;
  } catch (err) {
    if (imageUrls.length > 0 && isImageFetchError(err)) {
      log('image_fetch_failed_retrying_text_only', {
        product_id: product.id,
        model,
        error: err instanceof Error ? err.message : String(err),
      });
      const response = await claude(buildDraftRequest(model, product, [], archetypes));
      spend.add(model, response.usage);
      return response;
    }
    throw err;
  }
}

/** Haiku bulk pass → escalate once to Sonnet on overall_confidence <
 * ESCALATION_CONFIDENCE or schema failure (§6.2/§6.3). Refusals do not
 * escalate. If the escalation output is invalid but the bulk output was a
 * valid low-confidence draft, the bulk draft is kept. */
export async function draftProduct(
  claude: ClaudeCaller,
  product: ProductRow,
  archetypes: ArchetypeRow[],
  spend: SpendAccumulator,
  log: Logger,
): Promise<ProductDraftResult> {
  const archetypeNames = archetypes.map((a) => a.name);
  const imageUrls = selectImageUrls(product.images);

  const bulkResponse = await callModel(claude, BULK_MODEL, product, imageUrls, archetypes, spend, log);
  const bulk = parseDraftResponse(bulkResponse, archetypeNames);

  if (bulk.ok && bulk.confidence >= ESCALATION_CONFIDENCE) {
    return {
      outcome: 'drafted',
      draft: bulk.draft,
      confidence: bulk.confidence,
      model: BULK_MODEL,
      escalated: false,
    };
  }
  if (!bulk.ok && bulk.kind === 'refusal') {
    return { outcome: 'no_draft', reason: 'refusal', escalated: false };
  }

  log('escalating', {
    product_id: product.id,
    cause: bulk.ok ? `low_confidence:${bulk.confidence}` : bulk.kind,
  });
  const escResponse = await callModel(
    claude,
    ESCALATION_MODEL,
    product,
    imageUrls,
    archetypes,
    spend,
    log,
  );
  const escalated = parseDraftResponse(escResponse, archetypeNames);

  if (escalated.ok) {
    return {
      outcome: 'drafted',
      draft: escalated.draft,
      confidence: escalated.confidence,
      model: ESCALATION_MODEL,
      escalated: true,
    };
  }
  if (bulk.ok) {
    // Sonnet failed but Haiku produced a valid (low-confidence) draft — keep it.
    return {
      outcome: 'drafted',
      draft: bulk.draft,
      confidence: bulk.confidence,
      model: BULK_MODEL,
      escalated: true,
    };
  }
  return { outcome: 'no_draft', reason: escalated.kind, escalated: true };
}

// ─── The pass ────────────────────────────────────────────────────────────────

export interface PassDeps {
  db: DbPort;
  /** null = no ANTHROPIC_API_KEY configured → park, never crash. */
  claude: ClaudeCaller | null;
  budgetUsd: number;
  /** Epoch ms after which no new product is started; remaining claimed jobs
   * are completed 'failed' so the queue backoff retries them (60 s window). */
  deadlineAt: number;
  now: () => Date;
  log: Logger;
}

export interface PassSummary {
  claimed: number;
  drafted: number;
  escalated: number;
  parked: boolean;
  usd: number;
  reason?: string;
  failed?: number;
  /** Present on worked passes (claimed > 0) — §12.4 dna_draft_done carries tokens+usd. */
  input_tokens?: number;
  output_tokens?: number;
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function processJob(
  deps: PassDeps,
  job: JobRow,
  archetypes: ArchetypeRow[],
  archetypesByName: Map<string, string>,
  spend: SpendAccumulator,
  counters: { drafted: number; escalated: number; failed: number },
): Promise<void> {
  const { db, log } = deps;
  try {
    if (!job.product_id) {
      await db.completeJob(job.id, 'failed', 'dna_draft job has no product_id');
      counters.failed++;
      return;
    }
    const product = await db.loadProduct(job.product_id);
    if (!product) {
      await db.completeJob(job.id, 'failed', 'product not found');
      counters.failed++;
      return;
    }

    const result = await draftProduct(deps.claude!, product, archetypes, spend, log);
    if (result.escalated) counters.escalated++;

    if (result.outcome === 'drafted') {
      // 1. Draft row — ON CONFLICT(product_id, prompt_version) semantics:
      //    replace only when the incumbent's confidence is lower.
      const existing = await db.getDraft(product.id, PROMPT_VERSION);
      const row: DraftInsert = {
        product_id: product.id,
        draft: result.draft,
        model: result.model,
        prompt_version: PROMPT_VERSION,
        overall_confidence: result.confidence,
      };
      if (!existing) {
        await db.insertDraft(row);
      } else if (shouldReplaceDraft(existing.overall_confidence, result.confidence)) {
        await db.updateDraft(existing.id, row);
      } else {
        log('draft_kept_existing', {
          product_id: product.id,
          existing: existing.overall_confidence,
          incoming: result.confidence,
        });
      }

      // 2. product_styles source='ml_predicted' — replace prior ML rows, never
      //    touch designer rows (source manual/validated). Canonical spectrum
      //    (product_style_spectrum) is NEVER written here — drafts-never-canon.
      const existingStyles = await db.listStyles(product.id);
      const protectedIds = new Set(
        existingStyles.filter((s) => s.source !== 'ml_predicted').map((s) => s.style_id),
      );
      await db.deleteMlStyles(product.id);
      const styleRows = stylesFromDraft(product.id, result.draft, archetypesByName, protectedIds);
      if (styleRows.length > 0) await db.insertStyles(styleRows);

      // 3. Triage (§6.3).
      await db.applyTriage(product.id, triageBand(result.confidence));

      await db.completeJob(job.id, 'done');
      counters.drafted++;
      spend.products++;
      log('dna_draft_done', {
        product_id: product.id,
        model: result.model,
        escalated: result.escalated,
        confidence: result.confidence,
      });
    } else {
      // Refusal / persistent schema failure: no draft, deep-analysis triage,
      // job done — a retry with the same inputs would repeat the outcome and
      // the designer path (start blank) is today's behavior, no regression.
      await db.applyTriage(product.id, triageBand(null));
      await db.completeJob(job.id, 'done');
      log('dna_draft_no_draft', { product_id: product.id, reason: result.reason });
    }
  } catch (err) {
    // Per-product isolation: API/DB errors fail this job only; queue backoff
    // (1 m / 5 m / 25 m, park at 5 attempts — 00241) handles the retries.
    counters.failed++;
    const message = err instanceof Error ? err.message : String(err);
    log('dna_draft_job_failed', { job_id: job.id, product_id: job.product_id, error: message });
    try {
      await db.completeJob(job.id, 'failed', message.slice(0, 500));
    } catch (completeErr) {
      log('complete_job_failed', {
        job_id: job.id,
        error: completeErr instanceof Error ? completeErr.message : String(completeErr),
      });
    }
  }
}

export async function runDnaDraftPass(deps: PassDeps): Promise<PassSummary> {
  const { db, log } = deps;

  // No key → park cleanly before touching the queue (never crash).
  if (!deps.claude) {
    log('parked_no_api_key', {
      hint: 'set ANTHROPIC_API_KEY as an edge function secret to enable draft-fill',
    });
    return { claimed: 0, drafted: 0, escalated: 0, parked: true, usd: 0, reason: 'no_api_key' };
  }

  // Spend guard FIRST (§6.2): over budget → park, claim nothing.
  const day = utcDay(deps.now());
  const spendToday = await db.getSpendToday(day);
  const spentUsd = Number(spendToday?.usd ?? 0);
  if (spentUsd >= deps.budgetUsd) {
    log('parked_budget_exhausted', { day, spent_usd: spentUsd, budget_usd: deps.budgetUsd });
    return {
      claimed: 0,
      drafted: 0,
      escalated: 0,
      parked: true,
      usd: 0,
      reason: 'budget_exhausted',
    };
  }

  const archetypes = await db.loadArchetypes();
  if (archetypes.length === 0) {
    log('parked_no_archetypes', { hint: 'styles table has no is_archetype rows (00006 seed)' });
    return { claimed: 0, drafted: 0, escalated: 0, parked: true, usd: 0, reason: 'no_archetypes' };
  }
  const archetypesByName = new Map(archetypes.map((a) => [a.name, a.id]));

  const jobs = await db.claimJobs(JOB_KIND, BATCH_SIZE);
  if (jobs.length === 0) {
    return { claimed: 0, drafted: 0, escalated: 0, parked: false, usd: 0 };
  }
  log('claimed', { count: jobs.length, job_ids: jobs.map((j) => j.id) });

  const spend = new SpendAccumulator();
  const counters = { drafted: 0, escalated: 0, failed: 0 };
  const queue = [...jobs];

  // CONCURRENCY-wide worker pool with a hard deadline: jobs not started in
  // time are completed 'failed' (→ pending after 1 min backoff) instead of
  // being stranded in status='running' when the pg_net window kills us.
  const lane = async () => {
    while (queue.length > 0) {
      const job = queue.shift()!;
      if (deps.now().getTime() >= deps.deadlineAt) {
        counters.failed++;
        log('deadline_reached_deferring_job', { job_id: job.id });
        try {
          await db.completeJob(job.id, 'failed', 'not attempted: invocation deadline reached');
        } catch (err) {
          log('complete_job_failed', {
            job_id: job.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }
      await processJob(deps, job, archetypes, archetypesByName, spend, counters);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, lane));

  // One ledger write per invocation (§6.2 accrual).
  const delta = spend.toDelta();
  if (delta.input_tokens > 0 || delta.output_tokens > 0 || delta.products > 0) {
    try {
      await db.addSpend(day, delta);
    } catch (err) {
      log('spend_ledger_write_failed', {
        error: err instanceof Error ? err.message : String(err),
        delta,
      });
    }
  }

  const summary: PassSummary = {
    claimed: jobs.length,
    drafted: counters.drafted,
    escalated: counters.escalated,
    parked: false,
    usd: delta.usd,
    ...(counters.failed > 0 ? { failed: counters.failed } : {}),
    // tokens ride only on worked passes so the parked-pass summaries (and
    // their exact-shape tests) stay byte-stable (§12.4 dna_draft_done).
    ...(jobs.length > 0
      ? { input_tokens: delta.input_tokens, output_tokens: delta.output_tokens }
      : {}),
  };
  log('pass_complete', { ...summary });
  return summary;
}
