// aesthete-nightly/fit-client.ts — HTTP client for the inference worker's
// taste-refit endpoints (design §8.2/§12.1; Wave 4A).
//
// Lives HERE (not _shared/aesthete.ts) deliberately: only the nightly speaks
// /fit/*, and the delivery plan's contention rule 4 reserves _shared edits
// for the first edge agent of a wave — 4B/4C may land in parallel. Same auth
// posture as createInferenceClient (Bearer INFERENCE_TOKEN, per-request
// timeout as the circuit breaker); no 429 dance — the nightly is the only
// caller at 02:30 and simply fails the phase and self-heals next night.

export interface FitJudgmentWire {
  phi_a: number[];
  phi_b: number[];
  choice: 'a' | 'b' | 'neither' | 'both';
  weight: number;
  age_days: number;
}

export interface FitHyper {
  tau_days: number;
  lambda0: number;
  lambda_n0: number;
}

export const DEFAULT_HYPER: FitHyper = { tau_days: 180, lambda0: 0.5, lambda_n0: 30 };

export interface FitRequest {
  designer: { theta_prior: number[] | null };
  judgments: FitJudgmentWire[];
  hyper: FitHyper;
}

export interface FitResponse {
  theta: number[];
  converged: boolean;
  n_effective: number;
  train_accuracy: number | null;
  n_used: number;
  n_skipped: number;
  n_iter: number;
  lambda_used: number;
  dim: number;
}

export interface BacktestRequest extends FitRequest {
  test_fraction: number;
}

export interface BacktestResponse {
  pairwise_accuracy: number;
  auc: number | null;
  prior_accuracy: number;
  prior_auc: number | null;
  n_train: number;
  n_test: number;
}

export interface FitClient {
  fitTaste(req: FitRequest): Promise<FitResponse>;
  backtest(req: BacktestRequest): Promise<BacktestResponse>;
}

export interface FitClientOptions {
  url: string; // e.g. http://192.168.1.x:8321 locally, http://aesthete-inference:8000 on prod compose
  token: string; // INFERENCE_TOKEN
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createFitClient(opts: FitClientOptions): FitClient {
  const { url, token, timeoutMs = 30_000, fetchImpl = fetch } = opts;
  const base = url.replace(/\/+$/, '');

  async function post<T>(path: string, body: unknown): Promise<T> {
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
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`fit ${path} unreachable: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`fit ${path} → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    return (await res.json()) as T;
  }

  return {
    fitTaste: (req) => post<FitResponse>('/fit/taste', req),
    backtest: (req) => post<BacktestResponse>('/fit/taste/backtest', req),
  };
}
