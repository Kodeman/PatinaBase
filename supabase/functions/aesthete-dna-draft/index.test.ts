/// <reference lib="deno.ns" />
// ^ The monorepo root tsconfig.json sets lib: [ES2022, DOM] which Deno ≥ 2.4
// picks up, clobbering the `Deno` global during type-check — the reference
// restores it for this program (same issue breaks po-send's suite repo-wide).
//
// Deno tests for the aesthete-dna-draft pass (Wave 2C).
// Run: deno test supabase/functions/aesthete-dna-draft/
//
// Everything is mocked — the ClaudeCaller port is driven by the golden
// fixtures in ./fixtures/ and the DbPort by an op-recording fake; NO real
// API calls happen here (the real-API smoke lives in smoke.test.ts behind
// ANTHROPIC_API_KEY + RUN_REAL_SMOKE=1). Tests import ./lib.ts only, so the
// Anthropic SDK / supabase-js are never resolved.

import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import highDraft from './fixtures/draft-high-confidence.json' with { type: 'json' };
import lowDraft from './fixtures/draft-low-confidence.json' with { type: 'json' };
import {
  type ArchetypeRow,
  BATCH_SIZE,
  buildDraftRequest,
  BULK_MODEL,
  type ClaudeCaller,
  computeCostUsd,
  CONCURRENCY,
  type DbPort,
  type DraftInsert,
  ENGINE_ACTOR_ID,
  ESCALATION_MODEL,
  type JobRow,
  type ModelResponse,
  type ModelUsage,
  type PassDeps,
  type ProductRow,
  PROMPT_VERSION,
  runDnaDraftPass,
  selectImageUrls,
  shouldReplaceDraft,
  type SpendDelta,
  type StyleInsert,
  triageBand,
  type TriagePatch,
  validateDraft,
} from './lib.ts';

// ─── Fixtures & fakes ────────────────────────────────────────────────────────

const ARCHETYPES: ArchetypeRow[] = [
  ['Warm Modern', 'a1111111-1111-1111-1111-111111111111'],
  ['Soft Contemporary', 'a2222222-2222-2222-2222-222222222222'],
  ['Mid-Century Modern', 'a3333333-3333-3333-3333-333333333333'],
  ['Scandinavian Minimal', 'a4444444-4444-4444-4444-444444444444'],
  ['Modern Industrial', 'a5555555-5555-5555-5555-555555555555'],
  ['Traditional', 'a6666666-6666-6666-6666-666666666666'],
  ['Transitional', 'a7777777-7777-7777-7777-777777777777'],
  ['Rustic', 'a8888888-8888-8888-8888-888888888888'],
  ['Coastal', 'a9999999-9999-9999-9999-999999999999'],
  ['Bohemian', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
  ['Maximalist', 'abbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
  ['Japandi', 'accccccc-cccc-cccc-cccc-cccccccccccc'],
].map(([name, id]) => ({ id, name, description: `${name} description`, visual_markers: ['marker'] }));

const ARCHETYPE_NAMES = ARCHETYPES.map((a) => a.name);
const WARM_MODERN_ID = ARCHETYPES[0].id;
const MCM_ID = ARCHETYPES[2].id;

const PRODUCT_A = 'p0000000-0000-0000-0000-00000000000a';
const PRODUCT_B = 'p0000000-0000-0000-0000-00000000000b';

function makeProduct(id: string): ProductRow {
  return {
    id,
    name: 'Walnut Credenza',
    brand: 'Atelier',
    category: 'storage',
    subcategory: 'credenza',
    description: 'A solid walnut credenza with brass pulls.',
    short_description: null,
    materials: ['walnut', 'brass'],
    price_retail: 185000,
    images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
    source_url: 'https://retailer.example.com/credenza',
  };
}

const USAGE_BULK: ModelUsage = {
  input_tokens: 1200,
  output_tokens: 900,
  cache_creation_input_tokens: 10000,
  cache_read_input_tokens: 0,
};
const USAGE_CACHED: ModelUsage = {
  input_tokens: 1200,
  output_tokens: 900,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 10000,
};

function okResponse(draft: unknown, usage: ModelUsage = USAGE_BULK): ModelResponse {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(draft) }],
    usage,
  };
}

/** Scripted caller: responds per (model) from a queue; records every request. */
function makeCaller(
  script: (params: Record<string, unknown>, callIndex: number) => ModelResponse | Error,
): { caller: ClaudeCaller; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  const caller: ClaudeCaller = (params) => {
    calls.push(params);
    const result = script(params, calls.length - 1);
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  };
  return { caller, calls };
}

interface FakeDbOptions {
  spendUsd?: number;
  jobs?: JobRow[];
  products?: Record<string, ProductRow>;
  existingDraft?: { id: number; overall_confidence: number | null };
  existingStyles?: { style_id: string; source: string }[];
  archetypes?: ArchetypeRow[];
}

/** Op-recording DbPort fake. Structural guarantee of drafts-never-canon: the
 * port has NO method that can reach product_dna or product_style_spectrum,
 * and the ops log below is asserted to contain no such write. */
class FakeDb implements DbPort {
  ops: { op: string; args: unknown[] }[] = [];
  completed: { id: number; status: string; error?: string }[] = [];
  insertedDrafts: DraftInsert[] = [];
  updatedDrafts: { id: number; row: DraftInsert }[] = [];
  insertedStyles: StyleInsert[] = [];
  deletedMlStyleProducts: string[] = [];
  triage: { productId: string; patch: TriagePatch }[] = [];
  spend: { day: string; delta: SpendDelta }[] = [];
  claimCalls = 0;

  constructor(private opts: FakeDbOptions = {}) {}

  private record(op: string, ...args: unknown[]) {
    this.ops.push({ op, args });
  }

  getSpendToday(day: string): Promise<{ usd: number } | null> {
    this.record('getSpendToday', day);
    return Promise.resolve(
      this.opts.spendUsd === undefined ? null : { usd: this.opts.spendUsd },
    );
  }
  loadArchetypes(): Promise<ArchetypeRow[]> {
    this.record('loadArchetypes');
    return Promise.resolve(this.opts.archetypes ?? ARCHETYPES);
  }
  claimJobs(kind: string, batch: number): Promise<JobRow[]> {
    this.record('claimJobs', kind, batch);
    this.claimCalls++;
    return Promise.resolve(this.opts.jobs ?? []);
  }
  completeJob(id: number, status: 'done' | 'failed', error?: string): Promise<void> {
    this.record('completeJob', id, status, error);
    this.completed.push({ id, status, error });
    return Promise.resolve();
  }
  loadProduct(productId: string): Promise<ProductRow | null> {
    this.record('loadProduct', productId);
    return Promise.resolve(this.opts.products?.[productId] ?? null);
  }
  getDraft(productId: string, promptVersion: string) {
    this.record('getDraft', productId, promptVersion);
    return Promise.resolve(this.opts.existingDraft ?? null);
  }
  insertDraft(row: DraftInsert): Promise<void> {
    this.record('insertDraft', row);
    this.insertedDrafts.push(row);
    return Promise.resolve();
  }
  updateDraft(id: number, row: DraftInsert): Promise<void> {
    this.record('updateDraft', id, row);
    this.updatedDrafts.push({ id, row });
    return Promise.resolve();
  }
  listStyles(productId: string) {
    this.record('listStyles', productId);
    return Promise.resolve(this.opts.existingStyles ?? []);
  }
  deleteMlStyles(productId: string): Promise<void> {
    this.record('deleteMlStyles', productId);
    this.deletedMlStyleProducts.push(productId);
    return Promise.resolve();
  }
  insertStyles(rows: StyleInsert[]): Promise<void> {
    this.record('insertStyles', rows);
    this.insertedStyles.push(...rows);
    return Promise.resolve();
  }
  applyTriage(productId: string, patch: TriagePatch): Promise<void> {
    this.record('applyTriage', productId, patch);
    this.triage.push({ productId, patch });
    return Promise.resolve();
  }
  addSpend(day: string, delta: SpendDelta): Promise<void> {
    this.record('addSpend', day, delta);
    this.spend.push({ day, delta });
    return Promise.resolve();
  }
}

function makeDeps(db: DbPort, caller: ClaudeCaller | null, overrides: Partial<PassDeps> = {}): PassDeps {
  return {
    db,
    claude: caller,
    budgetUsd: 20,
    deadlineAt: Date.now() + 50_000,
    now: () => new Date('2026-07-01T12:00:00Z'),
    log: () => {},
    ...overrides,
  };
}

function assertNoCanonicalWrites(db: FakeDb) {
  // Belt: DbPort structurally has no product_dna / product_style_spectrum
  // method. Suspenders: nothing recorded may even mention those tables.
  for (const { op, args } of db.ops) {
    const flat = `${op} ${JSON.stringify(args)}`;
    assert(
      !/product_dna\b|product_style_spectrum|spectrum_calibration/i.test(flat),
      `canonical-table write leaked through: ${flat}`,
    );
  }
}

// ─── Park behavior ───────────────────────────────────────────────────────────

Deno.test('parks without claiming when the daily ledger is over budget', async () => {
  const db = new FakeDb({ spendUsd: 21.5 });
  const { caller, calls } = makeCaller(() => okResponse(highDraft));

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(summary, {
    claimed: 0,
    drafted: 0,
    escalated: 0,
    parked: true,
    usd: 0,
    reason: 'budget_exhausted',
  });
  assertEquals(db.claimCalls, 0, 'must not claim jobs when parked');
  assertEquals(calls.length, 0, 'must not call the API when parked');
});

Deno.test('parks at exactly the budget boundary', async () => {
  const db = new FakeDb({ spendUsd: 20 });
  const summary = await runDnaDraftPass(makeDeps(db, makeCaller(() => okResponse(highDraft)).caller));
  assertEquals(summary.parked, true);
  assertEquals(summary.reason, 'budget_exhausted');
});

Deno.test('parks cleanly when no API key is configured (no-key dry-run path)', async () => {
  const db = new FakeDb({ spendUsd: 0 });
  const events: string[] = [];

  const summary = await runDnaDraftPass(
    makeDeps(db, null, { log: (e) => events.push(e) }),
  );

  assertEquals(summary.parked, true);
  assertEquals(summary.reason, 'no_api_key');
  assertEquals(db.ops.length, 0, 'must not touch the DB at all without a key');
  assert(events.includes('parked_no_api_key'), 'must log the no-key park clearly');
});

// ─── Happy path: high-confidence draft ───────────────────────────────────────

Deno.test('high-confidence draft: writes draft row, ML styles, triage; completes job; no canonical writes', async () => {
  const db = new FakeDb({
    spendUsd: 0.5,
    jobs: [{ id: 1, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
  });
  const { caller, calls } = makeCaller(() => okResponse(highDraft, USAGE_CACHED));

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(summary.claimed, 1);
  assertEquals(summary.drafted, 1);
  assertEquals(summary.escalated, 0);
  assertEquals(summary.parked, false);

  // Only the bulk model ran.
  assertEquals(calls.length, 1);
  assertEquals(calls[0].model, BULK_MODEL);

  // Draft row: prompt_version p1, bulk model, fixture confidence.
  assertEquals(db.insertedDrafts.length, 1);
  const draft = db.insertedDrafts[0];
  assertEquals(draft.product_id, PRODUCT_A);
  assertEquals(draft.prompt_version, PROMPT_VERSION);
  assertEquals(draft.model, BULK_MODEL);
  assertEquals(draft.overall_confidence, 0.82);
  // Draft spectrums stay inside the draft json (never written to canon).
  assertExists((draft.draft.style as Record<string, unknown>).spectrums);

  // ML style upserts: prior ML rows replaced, primary + secondary inserted.
  assertEquals(db.deletedMlStyleProducts, [PRODUCT_A]);
  assertEquals(db.insertedStyles.length, 2);
  const primary = db.insertedStyles.find((s) => s.is_primary)!;
  assertEquals(primary.style_id, WARM_MODERN_ID);
  assertEquals(primary.source, 'ml_predicted');
  assertEquals(primary.assigned_by, ENGINE_ACTOR_ID);
  const secondary = db.insertedStyles.find((s) => !s.is_primary)!;
  assertEquals(secondary.style_id, MCM_ID);
  assertEquals(secondary.confidence, 0.4);

  // Triage band for 0.82 → quick-validate.
  assertEquals(db.triage, [
    { productId: PRODUCT_A, patch: { requires_deep_analysis: false, priority: 'low' } },
  ]);

  assertEquals(db.completed, [{ id: 1, status: 'done', error: undefined }]);

  // §5.2 drafts-never-canon.
  assertNoCanonicalWrites(db);
});

// ─── Escalation paths ────────────────────────────────────────────────────────

Deno.test('low confidence triggers one Sonnet escalation; Sonnet draft wins', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 7, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
  });
  const { caller, calls } = makeCaller((params) =>
    params.model === BULK_MODEL ? okResponse(lowDraft) : okResponse(highDraft)
  );

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(calls.length, 2);
  assertEquals(calls[0].model, BULK_MODEL);
  assertEquals(calls[1].model, ESCALATION_MODEL);
  assertEquals(summary.drafted, 1);
  assertEquals(summary.escalated, 1);
  assertEquals(db.insertedDrafts[0].model, ESCALATION_MODEL);
  assertEquals(db.insertedDrafts[0].overall_confidence, 0.82);
});

Deno.test('schema violation triggers escalation; valid Sonnet output recovers it', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 8, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
  });
  const { caller, calls } = makeCaller((params) =>
    params.model === BULK_MODEL
      ? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json at all' }], usage: USAGE_BULK }
      : okResponse(highDraft)
  );

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(calls.map((c) => c.model), [BULK_MODEL, ESCALATION_MODEL]);
  assertEquals(summary.drafted, 1);
  assertEquals(summary.escalated, 1);
  assertEquals(db.insertedDrafts[0].model, ESCALATION_MODEL);
});

Deno.test('both models fail schema → no draft, deep-analysis triage, job done', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 9, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
  });
  const { caller, calls } = makeCaller(() => ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"nope": true}' }],
    usage: USAGE_BULK,
  }));

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(calls.length, 2, 'exactly one escalation retry');
  assertEquals(summary.drafted, 0);
  assertEquals(db.insertedDrafts.length, 0);
  assertEquals(db.insertedStyles.length, 0);
  assertEquals(db.triage, [
    { productId: PRODUCT_A, patch: { requires_deep_analysis: true, priority: 'high' } },
  ]);
  assertEquals(db.completed, [{ id: 9, status: 'done', error: undefined }]);
  assertNoCanonicalWrites(db);
});

Deno.test('escalated Sonnet keeps a low-confidence Haiku draft when Sonnet output is invalid', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 10, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
  });
  const { caller } = makeCaller((params) =>
    params.model === BULK_MODEL
      ? okResponse(lowDraft)
      : { stop_reason: 'max_tokens', content: [], usage: USAGE_BULK }
  );

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(summary.drafted, 1);
  assertEquals(db.insertedDrafts[0].model, BULK_MODEL);
  assertEquals(db.insertedDrafts[0].overall_confidence, 0.45);
  // 0.45 < 0.5 → deep-analysis triage even though a draft landed.
  assertEquals(db.triage[0].patch, { requires_deep_analysis: true, priority: 'high' });
});

Deno.test('refusal does not escalate: no draft, deep triage, job done', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 11, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
  });
  const { caller, calls } = makeCaller(() => ({
    stop_reason: 'refusal',
    content: [],
    usage: { input_tokens: 500, output_tokens: 0 },
  }));

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(calls.length, 1, 'refusals must not burn a Sonnet call');
  assertEquals(summary.drafted, 0);
  assertEquals(summary.escalated, 0);
  assertEquals(db.triage[0].patch, { requires_deep_analysis: true, priority: 'high' });
  assertEquals(db.completed[0].status, 'done');
});

// ─── Per-product isolation ───────────────────────────────────────────────────

Deno.test('one product failing does not sink the batch', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [
      { id: 21, kind: 'dna_draft', product_id: PRODUCT_A },
      { id: 22, kind: 'dna_draft', product_id: PRODUCT_B },
    ],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A), [PRODUCT_B]: makeProduct(PRODUCT_B) },
  });
  // Product A's call (first job claimed, first API call) errors; B succeeds.
  let callCount = 0;
  const failingCaller: ClaudeCaller = (_params) => {
    callCount++;
    if (callCount === 1) return Promise.reject(new Error('api_error: 529 overloaded'));
    return Promise.resolve(okResponse(highDraft));
  };

  const summary = await runDnaDraftPass(makeDeps(db, failingCaller));

  assertEquals(summary.claimed, 2);
  assertEquals(summary.drafted, 1);
  assertEquals(summary.failed, 1);
  const byId = Object.fromEntries(db.completed.map((c) => [c.id, c]));
  assertEquals(byId[21].status, 'failed');
  assert(byId[21].error?.includes('529'));
  assertEquals(byId[22].status, 'done');
});

Deno.test('missing product row fails that job only', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [
      { id: 31, kind: 'dna_draft', product_id: 'missing-product-id' },
      { id: 32, kind: 'dna_draft', product_id: PRODUCT_B },
    ],
    products: { [PRODUCT_B]: makeProduct(PRODUCT_B) },
  });
  const { caller } = makeCaller(() => okResponse(highDraft));

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(summary.drafted, 1);
  const byId = Object.fromEntries(db.completed.map((c) => [c.id, c]));
  assertEquals(byId[31].status, 'failed');
  assertEquals(byId[32].status, 'done');
});

// ─── Spend accounting ────────────────────────────────────────────────────────

Deno.test('spend accrues per §6.2 rates into the daily ledger', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 41, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
  });
  const { caller } = makeCaller((params) =>
    params.model === BULK_MODEL ? okResponse(lowDraft, USAGE_BULK) : okResponse(highDraft, USAGE_CACHED)
  );

  const summary = await runDnaDraftPass(makeDeps(db, caller));

  assertEquals(db.spend.length, 1);
  const { day, delta } = db.spend[0];
  assertEquals(day, '2026-07-01');
  // Bulk call: 1200 fresh + 10000 cache-write input; cached Sonnet call:
  // 1200 fresh input + 10000 cache-read.
  assertEquals(delta.input_tokens, 1200 + 10000 + 1200);
  assertEquals(delta.output_tokens, 1800);
  assertEquals(delta.cache_read_tokens, 10000);
  assertEquals(delta.products, 1);

  const expectedUsd = computeCostUsd(BULK_MODEL, USAGE_BULK) +
    computeCostUsd(ESCALATION_MODEL, USAGE_CACHED);
  assertEquals(delta.usd, Math.round(expectedUsd * 10000) / 10000);
  assertEquals(summary.usd, delta.usd);
});

Deno.test('computeCostUsd applies base, cache-write 1.25x, cache-read 0.1x and output rates', () => {
  // Haiku: $1 in / $5 out per MTok.
  const usd = computeCostUsd(BULK_MODEL, {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  });
  assertEquals(usd, 1 + 5 + 1.25 + 0.1);
  // Sonnet: $3 in / $15 out per MTok.
  const sonnetUsd = computeCostUsd(ESCALATION_MODEL, {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assertEquals(sonnetUsd, 3 + 15);
});

// ─── Draft replace policy (UNIQUE product_id, prompt_version) ────────────────

Deno.test('existing draft with higher confidence is kept; lower is replaced', async () => {
  const keep = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 51, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
    existingDraft: { id: 900, overall_confidence: 0.95 },
  });
  await runDnaDraftPass(makeDeps(keep, makeCaller(() => okResponse(highDraft)).caller));
  assertEquals(keep.insertedDrafts.length, 0);
  assertEquals(keep.updatedDrafts.length, 0, '0.82 must not replace 0.95');
  assertEquals(keep.completed[0].status, 'done');

  const replace = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 52, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
    existingDraft: { id: 901, overall_confidence: 0.4 },
  });
  await runDnaDraftPass(makeDeps(replace, makeCaller(() => okResponse(highDraft)).caller));
  assertEquals(replace.updatedDrafts.length, 1);
  assertEquals(replace.updatedDrafts[0].id, 901);
  assertEquals(replace.updatedDrafts[0].row.overall_confidence, 0.82);
});

Deno.test('shouldReplaceDraft: null incumbent replaced, ties kept', () => {
  assertEquals(shouldReplaceDraft(null, 0.3), true);
  assertEquals(shouldReplaceDraft(0.5, 0.5), false);
  assertEquals(shouldReplaceDraft(0.5, 0.51), true);
  assertEquals(shouldReplaceDraft(0.5, null), false);
});

// ─── Designer style rows are protected ───────────────────────────────────────

Deno.test('ML style writes never touch manual/validated rows', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [{ id: 61, kind: 'dna_draft', product_id: PRODUCT_A }],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A) },
    // Designer already validated Warm Modern for this product.
    existingStyles: [
      { style_id: WARM_MODERN_ID, source: 'validated' },
      { style_id: MCM_ID, source: 'ml_predicted' },
    ],
  });
  const { caller } = makeCaller(() => okResponse(highDraft));

  await runDnaDraftPass(makeDeps(db, caller));

  // ML rows replaced (delete ran) but the validated Warm Modern row is not
  // re-inserted / overwritten; only the MCM secondary (previously ML) lands.
  assertEquals(db.deletedMlStyleProducts, [PRODUCT_A]);
  assertEquals(db.insertedStyles.map((s) => s.style_id), [MCM_ID]);
});

// ─── Triage bands (§6.3) ─────────────────────────────────────────────────────

Deno.test('triage bands per §6.3', () => {
  assertEquals(triageBand(0.9), { requires_deep_analysis: false, priority: 'low' });
  assertEquals(triageBand(0.75), { requires_deep_analysis: false, priority: 'low' });
  assertEquals(triageBand(0.6), { requires_deep_analysis: false, priority: 'normal' });
  assertEquals(triageBand(0.5), { requires_deep_analysis: false, priority: 'normal' });
  assertEquals(triageBand(0.49), { requires_deep_analysis: true, priority: 'high' });
  assertEquals(triageBand(null), { requires_deep_analysis: true, priority: 'high' });
});

// ─── 60 s discipline ─────────────────────────────────────────────────────────

Deno.test('jobs past the deadline are deferred as failed instead of stranded running', async () => {
  const db = new FakeDb({
    spendUsd: 0,
    jobs: [
      { id: 71, kind: 'dna_draft', product_id: PRODUCT_A },
      { id: 72, kind: 'dna_draft', product_id: PRODUCT_B },
    ],
    products: { [PRODUCT_A]: makeProduct(PRODUCT_A), [PRODUCT_B]: makeProduct(PRODUCT_B) },
  });
  const { caller, calls } = makeCaller(() => okResponse(highDraft));

  // Fake clock: now is 12:00:00Z, the deadline passed a second earlier.
  const summary = await runDnaDraftPass(
    makeDeps(db, caller, {
      now: () => new Date('2026-07-01T12:00:00Z'),
      deadlineAt: new Date('2026-07-01T11:59:59Z').getTime(),
    }),
  );

  assertEquals(calls.length, 0, 'no API calls past the deadline');
  assertEquals(summary.drafted, 0);
  assertEquals(summary.failed, 2);
  for (const c of db.completed) {
    assertEquals(c.status, 'failed');
    assert(c.error?.includes('deadline'));
  }
});

Deno.test('batch and concurrency match §12.2 (documented discipline)', () => {
  assertEquals(BATCH_SIZE, 4);
  assertEquals(CONCURRENCY, 2);
});

// ─── Request building ────────────────────────────────────────────────────────

Deno.test('buildDraftRequest: cached system prefix, ≤3 URL images, archetype enum, structured output', () => {
  const product = makeProduct(PRODUCT_A);
  product.images = [
    'https://cdn.example.com/1.jpg',
    'https://cdn.example.com/2.jpg',
    'https://cdn.example.com/3.jpg',
    'https://cdn.example.com/4.jpg',
    '/relative/path.jpg',
  ];
  const imageUrls = selectImageUrls(product.images);
  assertEquals(imageUrls.length, 3, 'caps at 3 http(s) images');

  const request = buildDraftRequest(BULK_MODEL, product, imageUrls, ARCHETYPES);
  assertEquals(request.model, BULK_MODEL);

  const system = request.system as { text: string; cache_control?: unknown }[];
  assertEquals(system.length, 1);
  assertEquals(system[0].cache_control, { type: 'ephemeral' }, 'stable prefix must carry cache_control');
  assert(system[0].text.includes('Cool (metal, glass, stone)'), 'spectrum pole anchors verbatim');
  assert(system[0].text.includes('Artisan, hand-made'));
  assert(system[0].text.includes('### Warm Modern'), 'archetypes injected from styles table');
  for (const name of ARCHETYPE_NAMES) assert(system[0].text.includes(name));

  const message = (request.messages as { content: Record<string, unknown>[] }[])[0];
  const imageBlocks = message.content.filter((b) => b.type === 'image');
  assertEquals(imageBlocks.length, 3);
  assertEquals((imageBlocks[0].source as Record<string, unknown>).type, 'url');
  const textBlock = message.content.find((b) => b.type === 'text') as { text: string };
  assert(textBlock.text.includes('Walnut Credenza'));
  assert(textBlock.text.includes('$1850.00'), 'price included');

  const format = (request.output_config as Record<string, Record<string, unknown>>).format;
  assertEquals(format.type, 'json_schema');
  const schema = format.schema as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
  const primaryEnum = schema.properties.style.properties!.primary_archetype as unknown as {
    enum: string[];
  };
  assertEquals(primaryEnum.enum, ARCHETYPE_NAMES, 'archetype enum from the styles table');

  // Sonnet request disables thinking; Haiku omits it.
  assertEquals(request.thinking, undefined);
  const sonnetRequest = buildDraftRequest(ESCALATION_MODEL, product, imageUrls, ARCHETYPES);
  assertEquals(sonnetRequest.thinking, { type: 'disabled' });
});

// ─── Validation / clamping ───────────────────────────────────────────────────

Deno.test('validateDraft clamps out-of-range scores and filters unknown secondaries', () => {
  const raw = structuredClone(highDraft) as Record<string, unknown>;
  (raw.style as Record<string, unknown>).spectrums = {
    warmth: 1.7,
    complexity: -3,
    formality: 0,
    timelessness: 0.2,
    boldness: 0.1,
    craftsmanship: 0.4,
  };
  ((raw.style as Record<string, unknown>).secondary as unknown[]).push({
    archetype: 'Not A Real Style',
    weight: 0.9,
  });
  (raw.patina as Record<string, unknown>).potential = 4;
  raw.overall_confidence = 1.4;

  const result = validateDraft(raw, ARCHETYPE_NAMES);
  assert(result.ok);
  const spectrums = (result.draft.style as Record<string, Record<string, number>>).spectrums;
  assertEquals(spectrums.warmth, 1);
  assertEquals(spectrums.complexity, -1);
  assertEquals((result.draft.patina as Record<string, number>).potential, 1);
  assertEquals(result.confidence, 1);
  const secondaries = (result.draft.style as Record<string, unknown>).secondary as {
    archetype: string;
  }[];
  assertEquals(secondaries.map((s) => s.archetype), ['Mid-Century Modern']);
});

Deno.test('validateDraft rejects unknown primary archetype as schema failure', () => {
  const raw = structuredClone(highDraft) as Record<string, unknown>;
  (raw.style as Record<string, unknown>).primary_archetype = 'Cottagecore';
  const result = validateDraft(raw, ARCHETYPE_NAMES);
  assert(!result.ok);
  assertEquals(result.kind, 'schema_failure');
});
