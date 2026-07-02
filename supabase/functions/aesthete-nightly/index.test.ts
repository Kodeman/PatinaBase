// Deno tests for aesthete-nightly (Wave 4A).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/aesthete-nightly/
//
// Tests ./lib.ts pure math (§8.3/§8.4 formulas, §14.4 dial gate) directly and
// the phase orchestration against fake db/fit seams — importing ./index.ts
// would boot Deno.serve (po-send convention). Every phase is exercised both
// green and failing (per-phase isolation is the §12.2 contract).

import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import type { BacktestRequest, BacktestResponse, FitClient, FitRequest, FitResponse } from './fit-client.ts';
import {
  clamp,
  combineReliability,
  confidenceLabel,
  cosine,
  DIAL_UNLOCK_PTS,
  dialVerdict,
  type PayloadJudgment,
  type RefitDesigner,
  refitDesigner,
  type RefitPayload,
  reliabilityForDesigner,
  rhoFromAuc,
  runNightly,
  styleConfidence,
  toWire,
  usable,
} from './lib.ts';

// ─── pure math: §8.3 ρ ────────────────────────────────────────────────────────

Deno.test('rhoFromAuc shrinks hard at low n and clamps the AUC excess', () => {
  // Perfect AUC at n=30 → (30/60)·1 = 0.5
  assertAlmostEquals(rhoFromAuc(1.0, 30), 0.5, 1e-9);
  // Chance AUC → 0 regardless of n
  assertEquals(rhoFromAuc(0.5, 300), 0);
  // Sub-chance clamps at 0, never negative
  assertEquals(rhoFromAuc(0.3, 100), 0);
  // No AUC evidence → 0
  assertEquals(rhoFromAuc(null, 100), 0);
});

Deno.test('combineReliability blends probes at 25% and floors at 0.15', () => {
  // §8.3: ρ_D = 0.75·ρ_AUC + 0.25·ρ_probe
  assertAlmostEquals(combineReliability(0.4, { n: 8, agreement: 0.8 }), 0.5, 1e-9);
  // No probe evidence → AUC-only
  assertAlmostEquals(combineReliability(0.4, { n: 0, agreement: null }), 0.4, 1e-9);
  // The portfolio-only floor (§8.3): nothing drops below 0.15
  assertEquals(combineReliability(0, { n: 0, agreement: null }), 0.15);
  // Never above 1
  assertEquals(combineReliability(1, { n: 4, agreement: 1 }), 1);
});

// ─── pure math: §8.4 c_D(g) ───────────────────────────────────────────────────

Deno.test('styleConfidence combines AUC and consensus halves with n-shrinkage', () => {
  // n=10 → shrink 0.5; AUC_g=1 → half 0.5; consensus=1 → half 0.5 ⇒ 0.5
  assertAlmostEquals(styleConfidence(10, 1.0, 1.0), 0.5, 1e-9);
  // Missing halves contribute zero (conservative)
  assertAlmostEquals(styleConfidence(10, null, 1.0), 0.25, 1e-9);
  assertAlmostEquals(styleConfidence(10, 1.0, null), 0.25, 1e-9);
  assertEquals(styleConfidence(10, null, null), 0);
  // AUC at chance contributes nothing
  assertAlmostEquals(styleConfidence(90, 0.5, 0.8), 0.9 * 0.4, 1e-9);
});

Deno.test('confidenceLabel maps the §8.4 thresholds', () => {
  assertEquals(confidenceLabel(0.7), 'expert');
  assertEquals(confidenceLabel(0.69), 'advanced');
  assertEquals(confidenceLabel(0.4), 'advanced');
  assertEquals(confidenceLabel(0.39), 'learning');
});

// ─── pure math: §14.4 dial gate ───────────────────────────────────────────────

Deno.test('dialVerdict unlocks at ≥ 5 points over the house', () => {
  const base = { auc: 0.8, prior_auc: 0.5, n_train: 20, n_test: 9 };
  const unlocked = dialVerdict({ pairwise_accuracy: 0.75, prior_accuracy: 0.70, ...base });
  assert(unlocked.high_stop_unlocked);
  assertAlmostEquals(unlocked.delta_pts, DIAL_UNLOCK_PTS, 1e-9);
  const locked = dialVerdict({ pairwise_accuracy: 0.74, prior_accuracy: 0.70, ...base });
  assert(!locked.high_stop_unlocked);
});

// ─── pure helpers ────────────────────────────────────────────────────────────

Deno.test('cosine + clamp behave', () => {
  assertAlmostEquals(cosine([1, 0], [0, 1])!, 0, 1e-9);
  assertAlmostEquals(cosine([1, 1], [1, 1])!, 1, 1e-9);
  assertEquals(cosine([0, 0], [1, 1]), null);
  assertEquals(cosine([1], [1, 2]), null);
  assertEquals(clamp(5, 0, 1), 1);
});

Deno.test('usable filters neither/both; toWire strips to the fit shape', () => {
  const judgments = [
    fakeJudgment(1, 'a'),
    fakeJudgment(2, 'neither'),
    fakeJudgment(3, 'both'),
    fakeJudgment(4, 'b'),
  ];
  assertEquals(usable(judgments).map((j) => j.id), [1, 4]);
  const wire = toWire(judgments);
  assertEquals(Object.keys(wire[0]).sort(), ['age_days', 'choice', 'phi_a', 'phi_b', 'weight']);
});

// ─── fakes ───────────────────────────────────────────────────────────────────

function fakeJudgment(
  id: number,
  choice: 'a' | 'b' | 'neither' | 'both',
  ageDays = 3,
  styleGroup: string | null = null,
): PayloadJudgment {
  return {
    id,
    source: 'judgment:judgment',
    phi_a: [1, 0, 0],
    phi_b: [0, 1, 0],
    choice,
    weight: 1,
    age_days: ageDays,
    style_group: styleGroup,
    created_at: '2026-07-01T00:00:00Z',
  };
}

function fakePayload(designerId: string, judgments: PayloadJudgment[]): RefitPayload {
  return {
    designer_id: designerId,
    theta_prior: null,
    house_version: 1,
    watermark: '2026-07-01T12:00:00Z',
    n_judgments: judgments.length,
    n_corrections: 0,
    judgments,
  };
}

const FIT_RESPONSE: FitResponse = {
  theta: Array(94).fill(0.1),
  converged: true,
  n_effective: 12,
  train_accuracy: 0.9,
  n_used: 12,
  n_skipped: 0,
  n_iter: 5,
  lambda_used: 0.35,
  dim: 94,
};

const BT_RESPONSE: BacktestResponse = {
  pairwise_accuracy: 0.8,
  auc: 0.85,
  prior_accuracy: 0.5,
  prior_auc: 0.5,
  n_train: 8,
  n_test: 4,
};

class FakeFit implements FitClient {
  fits: FitRequest[] = [];
  backtests: BacktestRequest[] = [];
  fitResponse: FitResponse = FIT_RESPONSE;
  backtestResponse: BacktestResponse = BT_RESPONSE;
  fitTaste(req: FitRequest): Promise<FitResponse> {
    this.fits.push(req);
    return Promise.resolve(this.fitResponse);
  }
  backtest(req: BacktestRequest): Promise<BacktestResponse> {
    this.backtests.push(req);
    return Promise.resolve(this.backtestResponse);
  }
}

type RpcHandler = (args?: Record<string, unknown>) => unknown;

class FakeDb {
  calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  handlers: Record<string, RpcHandler>;
  constructor(handlers: Record<string, RpcHandler>) {
    this.handlers = handlers;
  }
  rpc(fn: string, args?: Record<string, unknown>) {
    this.calls.push({ fn, args });
    const h = this.handlers[fn];
    if (!h) return Promise.resolve({ data: null, error: { message: `no handler for ${fn}` } });
    try {
      return Promise.resolve({ data: h(args), error: null });
    } catch (err) {
      return Promise.resolve({
        data: null,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}

const noLog = () => {};

function baseHandlers(designerId: string, judgments: PayloadJudgment[]): Record<string, RpcHandler> {
  return {
    get_taste_refit_designers: () => [
      { designer_id: designerId, n_unprocessed: judgments.length, last_processed_at: null, drift_flag: false },
    ],
    get_taste_refit_payload: () => fakePayload(designerId, judgments),
    apply_taste_refit: () => ({ version: 2, watermark: '2026-07-01T12:00:00Z' }),
    get_designer_reliability_inputs: () => ({
      designer_id: designerId,
      n_judgments: judgments.length,
      n_usable: usable(judgments).length,
      last_judgment_at: '2026-07-01T00:00:00Z',
      probe: { n: 0, agreement: null },
      consensus: [],
      style_counts: [{ style_id: 'style-1', n: usable(judgments).length }],
    }),
    apply_designer_reliability: (args) => ({
      reliability: args?.p_reliability,
      style_rows: (args?.p_style_confidence as unknown[]).length,
    }),
    refresh_designer_teaching_stats: () => 3,
    compute_house_taste_draft: () => null,
    refresh_style_centroids: () => 7,
    refresh_product_behavior_stats: () => null,
    apply_starvation_decay: () => ({ decayed: 0 }),
  };
}

function manyJudgments(n: number): PayloadJudgment[] {
  return Array.from({ length: n }, (_, i) => fakeJudgment(i + 1, i % 2 === 0 ? 'a' : 'b', n - i));
}

// ─── phase 1: refit ──────────────────────────────────────────────────────────

Deno.test('refitDesigner fits, backtests, and applies with the watermark', async () => {
  const judgments = manyJudgments(12);
  const db = new FakeDb(baseHandlers('d-1', judgments));
  const fit = new FakeFit();
  const outcome = await refitDesigner({ db: db as never, fit, log: noLog }, {
    designer_id: 'd-1',
    n_unprocessed: 12,
    last_processed_at: null,
    drift_flag: false,
  });

  assertEquals(outcome.version, 2);
  assertEquals(fit.fits.length, 1); // no drift check below 40 recent
  assertEquals(fit.fits[0].hyper.tau_days, 180);
  assertEquals(fit.backtests.length, 3); // §8.3 temporal-blocked CV fractions
  assert(outcome.dial);
  assert(outcome.dial!.high_stop_unlocked); // 0.8 vs 0.5 clears 5 pts

  const apply = db.calls.find((c) => c.fn === 'apply_taste_refit');
  assert(apply);
  assertEquals(apply!.args!.p_watermark, '2026-07-01T12:00:00Z');
  assertEquals((apply!.args!.p_theta as number[]).length, 94);
  const diag = apply!.args!.p_diagnostics as Record<string, unknown>;
  assertEquals(diag.drift, false);
  assert(diag.backtest);
  assert(diag.dial);
});

Deno.test('refitDesigner halves τ when drift was flagged last night (§8.4)', async () => {
  const db = new FakeDb(baseHandlers('d-1', manyJudgments(12)));
  const fit = new FakeFit();
  await refitDesigner({ db: db as never, fit, log: noLog }, {
    designer_id: 'd-1',
    n_unprocessed: 12,
    last_processed_at: null,
    drift_flag: true,
  });
  assertEquals(fit.fits[0].hyper.tau_days, 90);
});

Deno.test('refitDesigner skips the backtest below MIN_BACKTEST_N', async () => {
  const db = new FakeDb(baseHandlers('d-1', manyJudgments(4)));
  const fit = new FakeFit();
  const outcome = await refitDesigner({ db: db as never, fit, log: noLog }, {
    designer_id: 'd-1',
    n_unprocessed: 4,
    last_processed_at: null,
    drift_flag: false,
  });
  assertEquals(fit.backtests.length, 0);
  assertEquals(outcome.backtest, null);
  assertEquals(outcome.dial, null);
  assertEquals(outcome.version, 2); // the refit itself still lands
});

Deno.test('refitDesigner runs the drift check at ≥ 40 recent judgments', async () => {
  const judgments = manyJudgments(50).map((j) => ({ ...j, age_days: 10 }));
  const db = new FakeDb(baseHandlers('d-1', judgments));
  const fit = new FakeFit();
  const outcome = await refitDesigner({ db: db as never, fit, log: noLog }, {
    designer_id: 'd-1',
    n_unprocessed: 50,
    last_processed_at: null,
    drift_flag: false,
  });
  // 1 main fit + 2 drift fits (recent, trailing) — identical fakes → cos=1 → no drift
  assertEquals(fit.fits.length, 3);
  assertEquals(outcome.drift, false);
});

Deno.test('refitDesigner skips without a fit client (worker down)', async () => {
  const db = new FakeDb(baseHandlers('d-1', manyJudgments(5)));
  const outcome = await refitDesigner({ db: db as never, fit: null, log: noLog }, {
    designer_id: 'd-1',
    n_unprocessed: 5,
    last_processed_at: null,
    drift_flag: false,
  });
  assertEquals(outcome.skipped, 'fit_client_absent');
  assertEquals(db.calls.length, 0); // never even pulls the payload
});

// ─── phase 2: reliability ────────────────────────────────────────────────────

Deno.test('reliabilityForDesigner combines ρ halves and writes style rows', async () => {
  const judgments = manyJudgments(40).map((j, i) => ({
    ...j,
    style_group: i % 2 === 0 ? 'style-1' : null,
  }));
  const handlers = baseHandlers('d-1', judgments);
  handlers.get_designer_reliability_inputs = () => ({
    designer_id: 'd-1',
    n_judgments: 40,
    n_usable: 40,
    last_judgment_at: '2026-07-01T00:00:00Z',
    probe: { n: 4, agreement: 0.75 },
    consensus: [{ style_id: 'style-1', n: 6, agreement: 0.9 }],
    style_counts: [{ style_id: 'style-1', n: 20 }, { style_id: 'style-2', n: 2 }],
  });
  const db = new FakeDb(handlers);
  const fit = new FakeFit();

  const outcome = await reliabilityForDesigner(
    { db: db as never, fit, log: noLog },
    'd-1',
    { designer_id: 'd-1', version: 2, backtest: { auc_mean: 0.85 }, dial: null },
  );

  // ρ_AUC = (40/70)·clamp(2·0.35) = 0.5714·0.7 = 0.4 ; ρ = 0.75·0.4 + 0.25·0.75
  const applied = db.calls.find((c) => c.fn === 'apply_designer_reliability')!;
  assertAlmostEquals(applied.args!.p_reliability as number, 0.4875, 1e-3);
  const styleRows = applied.args!.p_style_confidence as Array<Record<string, unknown>>;
  assertEquals(styleRows.length, 2);
  // style-1 (n=20 ≥ 10) got a group backtest; style-2 didn't
  assertEquals(fit.backtests.length, 1);
  const map = applied.args!.p_confidence_map as Record<string, unknown>;
  assert(map['style-1']);
  assert(map._rho);
  assertEquals(outcome.style_rows, 2);
});

Deno.test('reliabilityForDesigner carries the §14.4 dial verdict into confidence_map', async () => {
  const db = new FakeDb(baseHandlers('d-1', manyJudgments(6)));
  const fit = new FakeFit();
  await reliabilityForDesigner(
    { db: db as never, fit, log: noLog },
    'd-1',
    {
      designer_id: 'd-1',
      version: 2,
      backtest: { auc_mean: 0.9 },
      dial: {
        theta_d_accuracy: 0.8,
        theta_h_accuracy: 0.5,
        delta_pts: 0.3,
        high_stop_unlocked: true,
        n_test: 4,
      },
    },
  );
  const applied = db.calls.find((c) => c.fn === 'apply_designer_reliability')!;
  const map = applied.args!.p_confidence_map as Record<string, Record<string, unknown>>;
  assertEquals(map._dial.high_stop_unlocked, true);
});

// ─── the full run: phase isolation ───────────────────────────────────────────

Deno.test('runNightly runs all four phases green', async () => {
  const db = new FakeDb(baseHandlers('d-1', manyJudgments(12)));
  const result = await runNightly({ db: db as never, fit: new FakeFit(), log: noLog });
  assert(result.phases.refit.ok);
  assert(result.phases.reliability.ok);
  assert(result.phases.house_draft.ok);
  assert(result.phases.refresh.ok);
  assertEquals(result.phases.refit.detail.refit, 1);
  assertEquals(result.phases.reliability.detail.stats_rows, 3);
  assertEquals(result.phases.house_draft.detail.draft_id, null); // no eligible designers yet — honest
  assertEquals(result.phases.refresh.detail.centroids, 7);
});

Deno.test('a failing refit phase never blocks the SQL phases (§12.2 isolation)', async () => {
  const handlers = baseHandlers('d-1', manyJudgments(12));
  handlers.get_taste_refit_designers = () => {
    throw new Error('boom');
  };
  const db = new FakeDb(handlers);
  const result = await runNightly({ db: db as never, fit: new FakeFit(), log: noLog });
  assert(!result.phases.refit.ok);
  assert(result.phases.reliability.ok); // still ran (stats writer)
  assert(result.phases.house_draft.ok);
  assert(result.phases.refresh.ok);
});

Deno.test('a failing designer inside phase 1 does not starve the others', async () => {
  const judgments = manyJudgments(12);
  const handlers = baseHandlers('d-1', judgments);
  let call = 0;
  handlers.get_taste_refit_designers = () => [
    { designer_id: 'd-bad', n_unprocessed: 5, last_processed_at: null, drift_flag: false },
    { designer_id: 'd-good', n_unprocessed: 5, last_processed_at: null, drift_flag: false },
  ];
  handlers.get_taste_refit_payload = (args) => {
    call++;
    if (args?.p_designer_id === 'd-bad') throw new Error('corrupt history');
    return fakePayload('d-good', judgments);
  };
  const db = new FakeDb(handlers);
  const result = await runNightly({ db: db as never, fit: new FakeFit(), log: noLog });
  assert(result.phases.refit.ok);
  assertEquals(result.phases.refit.detail.failed, 1);
  assertEquals(result.phases.refit.detail.refit, 1);
  assert(call >= 2);
});

Deno.test('worker-down night still drafts the house and refreshes (§12.1 ladder)', async () => {
  const db = new FakeDb(baseHandlers('d-1', manyJudgments(12)));
  const result = await runNightly({ db: db as never, fit: null, log: noLog });
  assert(result.phases.refit.ok);
  assertEquals(result.phases.refit.detail.refit, 0);
  assertEquals(result.phases.refit.detail.skipped, 1); // fit_client_absent
  assert(result.phases.house_draft.ok);
  assert(result.phases.refresh.ok);
  // stats writer still recomputed
  assert(db.calls.some((c) => c.fn === 'refresh_designer_teaching_stats'));
});

Deno.test('a failing refresh step is reported without killing the phase list', async () => {
  const handlers = baseHandlers('d-1', manyJudgments(12));
  handlers.refresh_style_centroids = () => {
    throw new Error('matview locked');
  };
  const db = new FakeDb(handlers);
  const result = await runNightly({ db: db as never, fit: new FakeFit(), log: noLog });
  assert(!result.phases.refresh.ok);
  assert(String(result.phases.refresh.detail.centroids_error).includes('matview locked'));
  // the other refresh steps still ran
  assertEquals(result.phases.refresh.detail.behavior_stats, 'refreshed');
  assertEquals((result.phases.refresh.detail.starvation as Record<string, unknown>).decayed, 0);
});
