// aesthete-nightly/lib.ts — pure math + phase orchestration for the nightly
// learning job (design §12.2 phases; §8.2 refit, §8.3 ρ_D, §8.4 confidence
// map/drift, §14.4 backtest bars + dial-unlock gate).
//
// index.ts boots Deno.serve and wires real deps; everything testable lives
// here behind narrow structural seams (RpcClient fake + FitClient fake in the
// deno suite). The deterministic SQL half lives in 00248 — this module owns
// only what SQL cannot: the HTTP round trips to /fit/taste and the scalar
// combination math (§8.3/§8.4 formulas).
//
// Phase map (§12.2), each phase ISOLATED — a failing phase logs and the run
// continues; everything self-heals next night:
//
//   1. taste refit    per designer with unprocessed fuel:
//                     get_taste_refit_payload → POST /fit/taste (θ_H prior;
//                     τ halved when drift was flagged) → temporal backtest
//                     (§8.3 blocked CV + the §14.4 θ_D-vs-θ_H dial verdict)
//                     → drift detection (§8.4) → apply_taste_refit.
//   2. reliability    per refitted designer: ρ_D = 0.75·ρ_AUC + 0.25·ρ_probe,
//                     c_D(g) per archetype, confidence_map (incl. _dial) →
//                     apply_designer_reliability; then the §12.2 stats_writer
//                     refresh_designer_teaching_stats() (global, idempotent).
//   3. house draft    compute_house_taste_draft() — lands as DRAFT; the
//                     activation stays human (§9.1). NULL = no eligible
//                     designers, which is every night until Phase-2 histories.
//   4. refresh        refresh_style_centroids() + refresh_product_behavior_
//                     stats() (00245) + apply_starvation_decay() (§8.4).
//
// Worker-down posture: phases 1–2 skip-with-notice when the fit client is
// absent/unreachable (jobs are watermark-driven — nothing lost, next night
// catches up); phases 3–4 are pure SQL and always run.

import type { RpcClient } from '../_shared/aesthete.ts';
import {
  type BacktestResponse,
  DEFAULT_HYPER,
  type FitClient,
  type FitJudgmentWire,
} from './fit-client.ts';

// ─── wire shapes (00248 RPCs) ────────────────────────────────────────────────

export interface RefitDesigner {
  designer_id: string;
  n_unprocessed: number;
  last_processed_at: string | null;
  drift_flag: boolean;
}

export interface PayloadJudgment extends FitJudgmentWire {
  id: number;
  source: string; // 'judgment:judgment' | 'judgment:probe' | 'judgment:rule_pseudo' | 'correction'
  style_group: string | null;
  created_at: string;
}

export interface RefitPayload {
  designer_id: string;
  theta_prior: number[] | null;
  house_version: number | null;
  watermark: string | null;
  n_judgments: number;
  n_corrections: number;
  judgments: PayloadJudgment[];
}

export interface ReliabilityInputs {
  designer_id: string;
  n_judgments: number;
  n_usable: number;
  last_judgment_at: string | null;
  probe: { n: number; agreement: number | null };
  consensus: Array<{ style_id: string; n: number; agreement: number }>;
  style_counts: Array<{ style_id: string; n: number }>;
}

// ─── tunables (documented in the 00248 header / delivery log) ────────────────

export const MIN_BACKTEST_N = 10; // below this a chronological split is noise
export const MIN_STYLE_BACKTEST_N = 10; // per-archetype AUC_g needs this many
export const BACKTEST_FRACTIONS = [0.5, 0.3, 0.2]; // §8.3 temporal-blocked CV boundaries
export const DIAL_FRACTION = 0.3; // the §14.4 verdict reads this fold
export const DIAL_UNLOCK_PTS = 0.05; // θ_D beats θ_H by ≥ 5 accuracy points
export const DRIFT_MIN_RECENT = 40; // §8.4: n_recent(60d) ≥ 40
export const DRIFT_COS_THRESHOLD = 0.7; // §8.4: cos(θ_recent, θ_trailing) < 0.7
export const RELIABILITY_FLOOR = 0.15; // §8.3: portfolio-only floor (column default)

// ─── pure math ───────────────────────────────────────────────────────────────

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function cosine(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** §8.3: ρ_AUC = (n/(n+30)) · clamp(2·(AUC − 0.5), 0, 1). */
export function rhoFromAuc(auc: number | null, n: number): number {
  if (auc === null || n <= 0) return 0;
  return (n / (n + 30)) * clamp(2 * (auc - 0.5), 0, 1);
}

/** §8.3: ρ_D = 0.75·ρ_AUC + 0.25·ρ_probe, probe half only when evidence exists. */
export function combineReliability(
  rhoAuc: number,
  probe: { n: number; agreement: number | null },
): number {
  const blended = probe.n > 0 && probe.agreement !== null
    ? 0.75 * rhoAuc + 0.25 * probe.agreement
    : rhoAuc;
  return clamp(Math.max(blended, RELIABILITY_FLOOR), 0, 1);
}

/**
 * §8.4: c_D(g) = (n_g/(n_g+10)) · [0.5·clamp(2·AUC_g − 1, 0, 1) + 0.5·consensus_g].
 * Missing halves contribute 0 (conservative — no evidence, no confidence):
 * aucG null when the style group was too thin to backtest; consensusG null
 * when nobody validated the designer's teaching in g.
 */
export function styleConfidence(
  nG: number,
  aucG: number | null,
  consensusG: number | null,
): number {
  const aucHalf = aucG === null ? 0 : 0.5 * clamp(2 * aucG - 1, 0, 1);
  const consensusHalf = consensusG === null ? 0 : 0.5 * clamp(consensusG, 0, 1);
  return (nG / (nG + 10)) * (aucHalf + consensusHalf);
}

/** §8.4 labels: expert ≥ 0.7, advanced ≥ 0.4, learning < 0.4. */
export function confidenceLabel(score: number): 'learning' | 'advanced' | 'expert' {
  if (score >= 0.7) return 'expert';
  if (score >= 0.4) return 'advanced';
  return 'learning';
}

export interface DialVerdict {
  theta_d_accuracy: number;
  theta_h_accuracy: number;
  delta_pts: number;
  high_stop_unlocked: boolean;
  n_test: number;
}

/** §14.4 ablation gate: θ_D beats θ_H on held-out judgments by ≥ 5 points. */
export function dialVerdict(bt: BacktestResponse): DialVerdict {
  const delta = bt.pairwise_accuracy - bt.prior_accuracy;
  return {
    theta_d_accuracy: bt.pairwise_accuracy,
    theta_h_accuracy: bt.prior_accuracy,
    delta_pts: Number(delta.toFixed(4)),
    high_stop_unlocked: delta >= DIAL_UNLOCK_PTS,
    n_test: bt.n_test,
  };
}

/** Strip payload judgments to the /fit wire shape (worker skips neither/both itself). */
export function toWire(judgments: PayloadJudgment[]): FitJudgmentWire[] {
  return judgments.map((j) => ({
    phi_a: j.phi_a,
    phi_b: j.phi_b,
    choice: j.choice,
    weight: j.weight,
    age_days: j.age_days,
  }));
}

export function usable(judgments: PayloadJudgment[]): PayloadJudgment[] {
  return judgments.filter((j) => j.choice === 'a' || j.choice === 'b');
}

// ─── rpc helper ──────────────────────────────────────────────────────────────

async function rpc<T>(db: RpcClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ─── phase 1: taste refit ────────────────────────────────────────────────────

export interface RefitOutcome {
  designer_id: string;
  version?: number;
  n_used?: number;
  train_accuracy?: number | null;
  backtest?: Record<string, unknown> | null;
  dial?: DialVerdict | null;
  drift?: boolean;
  skipped?: string;
  error?: string;
}

export interface NightlyDeps {
  db: RpcClient;
  fit: FitClient | null;
  log: (event: string, fields?: Record<string, unknown>) => void;
  now?: () => Date;
}

export async function refitDesigner(
  deps: NightlyDeps,
  designer: RefitDesigner,
): Promise<RefitOutcome> {
  const { db, fit, log } = deps;
  if (!fit) return { designer_id: designer.designer_id, skipped: 'fit_client_absent' };

  const payload = await rpc<RefitPayload>(db, 'get_taste_refit_payload', {
    p_designer_id: designer.designer_id,
  });
  if (!payload.watermark || payload.judgments.length === 0) {
    return { designer_id: designer.designer_id, skipped: 'no_pairs' };
  }

  // §8.4: a flagged drift halves τ for THIS refit (the flag was set last night).
  const hyper = designer.drift_flag
    ? { ...DEFAULT_HYPER, tau_days: DEFAULT_HYPER.tau_days / 2 }
    : DEFAULT_HYPER;
  const wire = toWire(payload.judgments);
  const prior = payload.theta_prior;

  const fitted = await fit.fitTaste({ designer: { theta_prior: prior }, judgments: wire, hyper });

  // §8.3 temporal-blocked CV + §14.4 dial verdict — only when history is thick
  // enough for a chronological split to mean anything.
  const usableJ = usable(payload.judgments);
  let backtestDiag: Record<string, unknown> | null = null;
  let dial: DialVerdict | null = null;
  if (usableJ.length >= MIN_BACKTEST_N) {
    const folds: Array<Record<string, unknown>> = [];
    const aucs: number[] = [];
    for (const f of BACKTEST_FRACTIONS) {
      try {
        const bt = await fit.backtest({
          designer: { theta_prior: prior },
          judgments: wire,
          hyper,
          test_fraction: f,
        });
        folds.push({
          test_fraction: f,
          pairwise_accuracy: bt.pairwise_accuracy,
          auc: bt.auc,
          prior_accuracy: bt.prior_accuracy,
          n_train: bt.n_train,
          n_test: bt.n_test,
        });
        if (bt.auc !== null) aucs.push(bt.auc);
        if (f === DIAL_FRACTION) dial = dialVerdict(bt);
      } catch (err) {
        log('backtest_fold_failed', {
          designer_id: designer.designer_id,
          test_fraction: f,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    backtestDiag = {
      folds,
      auc_mean: aucs.length > 0 ? aucs.reduce((a, b) => a + b, 0) / aucs.length : null,
      n_usable: usableJ.length,
    };
  }

  // §8.4 drift detector: n_recent(60d) ≥ 40 and cos(θ_recent, θ_trailing_12mo) < 0.7.
  let drift = false;
  const recent = usableJ.filter((j) => j.age_days <= 60);
  if (recent.length >= DRIFT_MIN_RECENT) {
    try {
      const trailing = usableJ.filter((j) => j.age_days <= 365);
      const [fitRecent, fitTrailing] = [
        await fit.fitTaste({ designer: { theta_prior: prior }, judgments: toWire(recent), hyper }),
        await fit.fitTaste({
          designer: { theta_prior: prior },
          judgments: toWire(trailing),
          hyper,
        }),
      ];
      const cos = cosine(fitRecent.theta, fitTrailing.theta);
      drift = cos !== null && cos < DRIFT_COS_THRESHOLD;
    } catch (err) {
      log('drift_check_failed', {
        designer_id: designer.designer_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const diagnostics = {
    n_used: fitted.n_used,
    n_skipped: fitted.n_skipped,
    n_effective: fitted.n_effective,
    train_accuracy: fitted.train_accuracy,
    converged: fitted.converged,
    lambda_used: fitted.lambda_used,
    tau_days: hyper.tau_days,
    house_version: payload.house_version,
    backtest: backtestDiag,
    dial,
    drift,
  };

  const applied = await rpc<{ version: number }>(db, 'apply_taste_refit', {
    p_designer_id: designer.designer_id,
    p_theta: fitted.theta,
    p_watermark: payload.watermark,
    p_diagnostics: diagnostics,
  });

  return {
    designer_id: designer.designer_id,
    version: applied.version,
    n_used: fitted.n_used,
    train_accuracy: fitted.train_accuracy,
    backtest: backtestDiag,
    dial,
    drift,
  };
}

// ─── phase 2: reliability + confidence map + stats writers ──────────────────

export interface ReliabilityOutcome {
  designer_id: string;
  reliability?: number;
  style_rows?: number;
  skipped?: string;
  error?: string;
}

export async function reliabilityForDesigner(
  deps: NightlyDeps,
  designerId: string,
  refitOutcome: RefitOutcome | undefined,
): Promise<ReliabilityOutcome> {
  const { db, fit, log } = deps;
  const inputs = await rpc<ReliabilityInputs>(db, 'get_designer_reliability_inputs', {
    p_designer_id: designerId,
  });

  const aucMean = (refitOutcome?.backtest as { auc_mean?: number | null } | null | undefined)
    ?.auc_mean ?? null;
  const rhoAuc = rhoFromAuc(aucMean, inputs.n_usable);
  const reliability = combineReliability(rhoAuc, inputs.probe);

  // Per-archetype c_D(g): AUC_g via a per-group backtest where the group is
  // thick enough; consensus_g from teaching validations (§8.4). The payload
  // (with its φ assembly) is fetched ONCE and sliced per group.
  const consensusByStyle = new Map(inputs.consensus.map((c) => [c.style_id, c.agreement]));
  const styleRows: Array<{ style_id: string; level: string; judgment_count: number }> = [];
  const mapEntries: Record<string, unknown> = {};

  const needsGroupBacktest = fit &&
    inputs.style_counts.some(({ n }) => n >= MIN_STYLE_BACKTEST_N);
  const payload = needsGroupBacktest
    ? await rpc<RefitPayload>(db, 'get_taste_refit_payload', { p_designer_id: designerId })
    : null;

  for (const { style_id, n } of inputs.style_counts) {
    let aucG: number | null = null;
    if (fit && payload && n >= MIN_STYLE_BACKTEST_N) {
      try {
        const groupJudgments = usable(payload.judgments).filter((j) => j.style_group === style_id);
        if (groupJudgments.length >= MIN_STYLE_BACKTEST_N) {
          const bt = await fit.backtest({
            designer: { theta_prior: payload.theta_prior },
            judgments: toWire(groupJudgments),
            hyper: DEFAULT_HYPER,
            test_fraction: DIAL_FRACTION,
          });
          aucG = bt.auc;
        }
      } catch (err) {
        log('style_backtest_failed', {
          designer_id: designerId,
          style_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const consensusG = consensusByStyle.get(style_id) ?? null;
    const score = styleConfidence(n, aucG, consensusG);
    const label = confidenceLabel(score);
    styleRows.push({ style_id, level: label, judgment_count: n });
    mapEntries[style_id] = { score: Number(score.toFixed(4)), n, label };
  }

  const confidenceMap = {
    ...mapEntries,
    _rho: {
      auc_mean: aucMean,
      rho_auc: Number(rhoAuc.toFixed(4)),
      probe: inputs.probe,
      n_usable: inputs.n_usable,
    },
    ...(refitOutcome?.dial ? { _dial: refitOutcome.dial } : {}),
  };

  const applied = await rpc<{ reliability: number; style_rows: number }>(
    db,
    'apply_designer_reliability',
    {
      p_designer_id: designerId,
      p_reliability: Number(reliability.toFixed(4)),
      p_confidence_map: confidenceMap,
      p_style_confidence: styleRows,
    },
  );

  return { designer_id: designerId, reliability: applied.reliability, style_rows: applied.style_rows };
}

// ─── the run ─────────────────────────────────────────────────────────────────

export interface PhaseResult {
  ok: boolean;
  detail: Record<string, unknown>;
  error?: string;
}

export interface NightlyResult {
  phases: {
    refit: PhaseResult;
    reliability: PhaseResult;
    house_draft: PhaseResult;
    refresh: PhaseResult;
  };
  ms: number;
}

export async function runNightly(deps: NightlyDeps): Promise<NightlyResult> {
  const { db, log } = deps;
  const t0 = Date.now();
  const refitOutcomes = new Map<string, RefitOutcome>();

  // ── phase 1: taste refit ────────────────────────────────────────────────
  let refit: PhaseResult;
  try {
    const designers = await rpc<RefitDesigner[]>(db, 'get_taste_refit_designers');
    const outcomes: RefitOutcome[] = [];
    for (const d of designers ?? []) {
      try {
        const outcome = await refitDesigner(deps, d);
        outcomes.push(outcome);
        refitOutcomes.set(d.designer_id, outcome);
      } catch (err) {
        // Per-designer isolation: one bad history never starves the rest.
        const detail = err instanceof Error ? err.message : String(err);
        outcomes.push({ designer_id: d.designer_id, error: detail });
        log('refit_designer_failed', { designer_id: d.designer_id, error: detail });
      }
    }
    refit = {
      ok: true,
      detail: {
        designers: outcomes.length,
        refit: outcomes.filter((o) => o.version !== undefined).length,
        skipped: outcomes.filter((o) => o.skipped).length,
        failed: outcomes.filter((o) => o.error).length,
        outcomes,
      },
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    refit = { ok: false, detail: {}, error: detail };
    log('phase_failed', { phase: 'refit', error: detail });
  }

  // ── phase 2: reliability + confidence + stats writers ──────────────────
  let reliability: PhaseResult;
  try {
    const outcomes: ReliabilityOutcome[] = [];
    for (const [designerId, outcome] of refitOutcomes) {
      if (outcome.version === undefined) continue; // only re-derive after a real refit
      try {
        outcomes.push(await reliabilityForDesigner(deps, designerId, outcome));
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        outcomes.push({ designer_id: designerId, error: detail });
        log('reliability_designer_failed', { designer_id: designerId, error: detail });
      }
    }
    // §12.2 stats_writer — global recompute-overwrite, idempotent, always runs.
    const statsRows = await rpc<number>(db, 'refresh_designer_teaching_stats');
    reliability = { ok: true, detail: { designers: outcomes.length, stats_rows: statsRows, outcomes } };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    reliability = { ok: false, detail: {}, error: detail };
    log('phase_failed', { phase: 'reliability', error: detail });
  }

  // ── phase 3: house draft (activation stays human — §9.1) ───────────────
  let houseDraft: PhaseResult;
  try {
    const draftId = await rpc<string | null>(db, 'compute_house_taste_draft');
    houseDraft = { ok: true, detail: { draft_id: draftId } };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    houseDraft = { ok: false, detail: {}, error: detail };
    log('phase_failed', { phase: 'house_draft', error: detail });
  }

  // ── phase 4: centroids + behavior stats + starvation decay ─────────────
  let refresh: PhaseResult;
  try {
    const detail: Record<string, unknown> = {};
    try {
      detail.centroids = await rpc<number>(db, 'refresh_style_centroids');
    } catch (err) {
      detail.centroids_error = err instanceof Error ? err.message : String(err);
    }
    try {
      await rpc<null>(db, 'refresh_product_behavior_stats');
      detail.behavior_stats = 'refreshed';
    } catch (err) {
      detail.behavior_stats_error = err instanceof Error ? err.message : String(err);
    }
    try {
      detail.starvation = await rpc<{ decayed: number }>(db, 'apply_starvation_decay');
    } catch (err) {
      detail.starvation_error = err instanceof Error ? err.message : String(err);
    }
    const anyError = Object.keys(detail).some((k) => k.endsWith('_error'));
    refresh = { ok: !anyError, detail };
    if (anyError) log('phase_failed', { phase: 'refresh', ...detail });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    refresh = { ok: false, detail: {}, error: detail };
    log('phase_failed', { phase: 'refresh', error: detail });
  }

  return {
    phases: { refit, reliability, house_draft: houseDraft, refresh },
    ms: Date.now() - t0,
  };
}
