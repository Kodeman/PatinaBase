// Shared Claude Messages API adapter. Callers inject the model port and ledger
// in tests; production defaults use the official Anthropic SDK and Supabase RPCs.
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
} from "npm:@anthropic-ai/sdk@0.133.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureServerEvent } from "./aesthete-events.ts";
import {
  type ClaudeRole,
  computeCostUsd,
  type ModelUsage,
  ROLE_MODELS,
} from "./claude-models.ts";

export interface ModelResponse {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: ModelUsage;
}
export type ClaudeCaller = (
  params: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<ModelResponse>;
export type ClaudeLedgerReason =
  | "kill"
  | "disabled"
  | "global_daily"
  | "feature_daily"
  | "studio_monthly"
  | "studio_unresolved"
  | string;
export interface LlmLedgerPort {
  reserve(
    feature: string,
    studioId: string | null,
    userId: string | null,
    estUsd: number,
    role?: ClaudeRole,
    promptVersion?: string,
    signal?: AbortSignal,
  ): Promise<{
    granted: boolean;
    reason: ClaudeLedgerReason | null;
    usageId: number | null;
    resetsAt?: string | null;
  }>;
  settle(usageId: number, fields: {
    model: string;
    usage: ModelUsage;
    usd: number;
    status: "settled" | "error";
    stopReason: string | null;
    latencyMs: number;
  }, signal?: AbortSignal): Promise<void>;
}

export interface ClaudeClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  caller?: ClaudeCaller;
  getEnv?: (key: string) => string | undefined;
  log?: (event: string, fields?: Record<string, unknown>) => void;
  capture?: typeof captureServerEvent;
}

/**
 * Settling a call's ledger row, both attempts together, takes at most this
 * long: a row still unsettled then is logged and left to the stale-reservation
 * sweep, and the call returns what it knows, a paid answer and its cost included.
 */
export const LEDGER_SETTLE_MS = 5_000;

export function createClaudeCaller(
  apiKey: string,
  timeoutMs: number,
): ClaudeCaller {
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  return async (params, signal) => {
    const response = await client.messages.create(params as never, { signal });
    return {
      stop_reason: response.stop_reason,
      content: response.content,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
        cache_creation: response.usage.cache_creation,
      },
    };
  };
}

function buildClaudeParams(
  role: ClaudeRole,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const { model, effort } = ROLE_MODELS[role];
  const outputConfig =
    (params.output_config && typeof params.output_config === "object"
      ? params.output_config
      : {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {
    ...params,
    model,
    output_config: { ...outputConfig, effort },
  };
  // These models reject forced tool selection and disabled thinking.
  const choice = result.tool_choice as { type?: unknown } | undefined;
  if (choice?.type === "any" || choice?.type === "tool") {
    delete result.tool_choice;
  }
  const thinking = result.thinking as { type?: unknown } | undefined;
  if (thinking?.type === "disabled") delete result.thinking;
  return result;
}

/** The query, cut short by `signal` when one is given. */
function abortable<Q extends { abortSignal(signal: AbortSignal): Q }>(query: Q, signal?: AbortSignal): Q {
  return signal ? query.abortSignal(signal) : query;
}

export function createLlmLedger(admin: SupabaseClient): LlmLedgerPort {
  return {
    async reserve(feature, studioId, userId, estUsd, role, promptVersion, signal) {
      const query = admin.rpc("llm_reserve", {
        p_feature: feature,
        p_studio_id: studioId,
        p_user_id: userId,
        p_est_usd: estUsd,
        p_role: role ?? null,
        p_prompt_version: promptVersion ?? null,
      });
      const { data, error } = await abortable(query, signal);
      if (error) throw error;
      const result = data as {
        granted: boolean;
        reason: ClaudeLedgerReason | null;
        usage_id: number | null;
        resets_at: string | null;
      };
      return {
        granted: result.granted,
        reason: result.reason,
        usageId: result.usage_id,
        resetsAt: result.resets_at ?? null,
      };
    },
    async settle(usageId, fields, signal) {
      const query = admin.rpc("llm_settle", {
        p_usage_id: usageId,
        p_model: fields.model,
        p_input_tokens: fields.usage.input_tokens,
        p_output_tokens: fields.usage.output_tokens,
        p_cache_read_tokens: fields.usage.cache_read_input_tokens ?? 0,
        p_cache_write_tokens: fields.usage.cache_creation_input_tokens ?? 0,
        p_usd: fields.usd,
        p_status: fields.status,
        p_stop_reason: fields.stopReason,
        p_latency_ms: fields.latencyMs,
      });
      const { error } = await abortable(query, signal);
      if (error) throw error;
    },
  };
}

export interface CallClaudeOptions {
  feature: string;
  role: ClaudeRole;
  studioId: string | null;
  userId: string | null;
  promptVersion: string;
  params: Record<string, unknown>;
  /** The reservation and the model call, SDK retries included, end within this long of the call's start. */
  timeoutMs: number;
  /** Cancels the whole call, the ledger reservation and SDK retries included; an aborted call settles as an error. */
  signal?: AbortSignal;
  /** Bounds settling the ledger row, which runs after `signal` may have aborted; unsettled rows are left to the stale-reservation sweep. */
  ledgerSignal?: AbortSignal;
  caller?: ClaudeCaller;
  ledger?: LlmLedgerPort;
  clientOptions?: ClaudeClientOptions;
  /** From resolveCaller: the studio is unknown, so studio caps cannot apply. */
  studioLookupFailed?: boolean;
}

export interface ClaudeDenial {
  ok: false;
  denied: "kill" | "disabled" | "budget";
  reason: ClaudeLedgerReason | null;
  resetsAt: string | null;
}

export interface ClaudeCallError {
  ok: false;
  error: string;
  status: number | null;
  errorType: string | null;
  transient: boolean;
  /**
   * What the failed call cost, as settled in the ledger, when the API error
   * reported usage (the call was billed). Absent when no usage is known.
   */
  usd?: number;
}

export type CallClaudeResult =
  | { ok: true; response: ModelResponse; usd: number; model: string }
  | ClaudeDenial
  | ClaudeCallError;

export async function callClaude(
  opts: CallClaudeOptions,
): Promise<CallClaudeResult> {
  const environment = opts.clientOptions?.getEnv ??
    ((key: string) => Deno.env.get(key));
  const apiKey = opts.clientOptions?.apiKey ?? environment("ANTHROPIC_API_KEY");
  const log = opts.clientOptions?.log ??
    ((event, fields) => console.log(JSON.stringify({ event, ...fields })));
  const capture = opts.clientOptions?.capture ?? captureServerEvent;
  if (!apiKey) {
    log("claude_disabled", {
      feature: opts.feature,
      reason: "missing_api_key",
    });
    return {
      ok: false,
      denied: "disabled",
      reason: "disabled",
      resetsAt: null,
    };
  }
  if (opts.studioLookupFailed) {
    log("claude_denied", {
      feature: opts.feature,
      reason: "studio_unresolved",
    });
    // Not a spent allowance: callers report it as unavailable, not over budget.
    return {
      ok: false,
      denied: "disabled",
      reason: "studio_unresolved",
      resetsAt: null,
    };
  }

  const model = ROLE_MODELS[opts.role].model;
  const request = buildClaudeParams(opts.role, opts.params);
  const systemAndMessages = JSON.stringify({
    messages: request.messages,
    system: request.system,
  });
  const inputTokens = systemAndMessages.length / 4;
  const maxTokens = Number(request.max_tokens ?? 0);
  const estUsd = computeCostUsd(model, {
    input_tokens: inputTokens,
    output_tokens: maxTokens,
  });
  const ledger = opts.ledger;
  if (!ledger) return ledgerFailure("Claude ledger is required");

  const reached = await reserveAndAsk(opts, { apiKey, ledger, request, estUsd });
  if (!reached.reserved) return reached.result;
  const { usageId, startedAt, answer } = reached;
  if ("error" in answer) {
    return await settleFailure(answer.error, {
      ledger,
      usageId,
      model,
      startedAt,
      log,
      feature: opts.feature,
      signal: opts.ledgerSignal,
    });
  }
  const response = answer.response;

  // The response is paid for: a ledger failure from here on must not turn it
  // into a failure the caller would retry and pay for again.
  const usd = computeCostUsd(model, response.usage);
  const latencyMs = Date.now() - startedAt;
  await settleUsage(
    ledger,
    usageId,
    {
      model,
      usage: response.usage,
      usd,
      status: "settled",
      stopReason: response.stop_reason,
      latencyMs,
    },
    log,
    opts.feature,
    opts.ledgerSignal,
  );
  void capture("claude", "$ai_generation", {
    feature: opts.feature,
    model,
    role: opts.role,
    prompt_version: opts.promptVersion,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
    usd,
    latency_ms: latencyMs,
    stop_reason: response.stop_reason,
    studio_id: opts.studioId,
  });
  return { ok: true, response, usd, model };
}

/** After a granted reservation: the model's answer, or the error the call failed with. Either one is settled. */
type ModelAnswer = { response: ModelResponse } | { error: unknown };

type Reached =
  | { reserved: false; result: CallClaudeResult }
  | { reserved: true; usageId: number; startedAt: number; answer: ModelAnswer };

/**
 * The ledger reservation, then the model call, inside one window that ends
 * `timeoutMs` after the call starts. The SDK gets only the time the
 * reservation left, and a model call still running when the window ends (an
 * SDK retry, or a caller that ignores its signal) fails then as a timeout.
 * Settling comes after, in its own LEDGER_SETTLE_MS, so a caller that waits
 * `timeoutMs` plus that long always gets what the call knows.
 */
async function reserveAndAsk(
  opts: CallClaudeOptions,
  call: { apiKey: string; ledger: LlmLedgerPort; request: Record<string, unknown>; estUsd: number },
): Promise<Reached> {
  const ends = Date.now() + opts.timeoutMs;
  const window = new AbortController();
  const timer = setTimeout(() => window.abort(new APIConnectionTimeoutError()), opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, window.signal]) : window.signal;
  try {
    let reservation: Awaited<ReturnType<LlmLedgerPort["reserve"]>>;
    try {
      reservation = await untilAborted(signal, (bound) =>
        call.ledger.reserve(opts.feature, opts.studioId, opts.userId, call.estUsd, opts.role, opts.promptVersion, bound));
    } catch (error) {
      return { reserved: false, result: ledgerFailure(errorMessage(error)) };
    }
    if (!reservation.granted) return { reserved: false, result: denial(reservation) };
    const usageId = reservation.usageId;
    if (usageId === null) return { reserved: false, result: ledgerFailure("Granted Claude reservation has no usage id") };
    const startedAt = Date.now();
    try {
      // Built inside the try: every failure after a granted reservation settles.
      const caller = opts.caller ?? opts.clientOptions?.caller ??
        createClaudeCaller(call.apiKey, Math.max(1, ends - startedAt));
      // The caller hears an outer abort as well; only the window's end is forced on it.
      const response = await untilAborted(window.signal, () => caller(call.request, signal));
      return { reserved: true, usageId, startedAt, answer: { response } };
    } catch (error) {
      return { reserved: true, usageId, startedAt, answer: { error } };
    }
  } finally {
    clearTimeout(timer);
  }
}

function denial(reservation: { reason: ClaudeLedgerReason | null; resetsAt?: string | null }): ClaudeDenial {
  const denied = reservation.reason === "kill" ? "kill" : reservation.reason === "disabled" ? "disabled" : "budget";
  return { ok: false, denied, reason: reservation.reason, resetsAt: reservation.resetsAt ?? null };
}

/**
 * Settles a failed call with whatever usage its error reported (an error the
 * API billed is never recorded as free) and returns the typed failure, with
 * that cost when the usage is known.
 */
async function settleFailure(
  error: unknown,
  call: {
    ledger: LlmLedgerPort;
    usageId: number;
    model: string;
    startedAt: number;
    log: NonNullable<ClaudeClientOptions["log"]>;
    feature: string;
    signal?: AbortSignal;
  },
): Promise<ClaudeCallError> {
  const knownUsage = usageFromError(error);
  const usd = knownUsage ? computeCostUsd(call.model, knownUsage) : 0;
  await settleUsage(
    call.ledger,
    call.usageId,
    {
      model: call.model,
      usage: knownUsage ?? { input_tokens: 0, output_tokens: 0 },
      usd,
      status: "error",
      stopReason: stopReasonFromError(error),
      latencyMs: Date.now() - call.startedAt,
    },
    call.log,
    call.feature,
    call.signal,
  );
  const failure = modelFailure(error);
  return knownUsage ? { ...failure, usd } : failure;
}

/**
 * Settles with one retry of the same fields, both inside LEDGER_SETTLE_MS (and
 * `signal`, when given); a lasting failure or no answer in time is logged and
 * left to the stale-reservation sweep, which counts the reserved estimate.
 */
async function settleUsage(
  ledger: LlmLedgerPort,
  usageId: number,
  fields: Parameters<LlmLedgerPort["settle"]>[1],
  log: NonNullable<ClaudeClientOptions["log"]>,
  feature: string,
  signal?: AbortSignal,
): Promise<void> {
  const window = new AbortController();
  const timer = setTimeout(
    () => window.abort(new Error("ledger settle window passed")),
    LEDGER_SETTLE_MS,
  );
  const bounded = signal ? AbortSignal.any([signal, window.signal]) : window.signal;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await untilAborted(bounded, (bound) => ledger.settle(usageId, fields, bound));
        return;
      } catch (error) {
        if (attempt === 2) {
          log("claude_ledger_settle_failed", {
            feature,
            usage_id: usageId,
            status: fields.status,
            usd: fields.usd,
            attempts: attempt,
            error: errorMessage(error),
          });
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

const TRANSIENT_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

function modelFailure(error: unknown): ClaudeCallError {
  const message = errorMessage(error);
  // Abort and timeout extend the SDK's connection/API error classes, so they
  // are checked first.
  const connectionType = error instanceof APIUserAbortError
    ? "abort"
    : error instanceof APIConnectionTimeoutError
    ? "timeout"
    : error instanceof APIConnectionError
    ? "network"
    : null;
  if (connectionType) {
    return {
      ok: false,
      error: message,
      status: null,
      errorType: connectionType,
      transient: true,
    };
  }
  const fields = (error && typeof error === "object" ? error : {}) as {
    status?: unknown;
    type?: unknown;
  };
  const status = typeof fields.status === "number" ? fields.status : null;
  return {
    ok: false,
    error: message,
    status,
    errorType: typeof fields.type === "string" ? fields.type : null,
    transient: status !== null && TRANSIENT_STATUSES.has(status),
  };
}

/**
 * The work, handed `signal`, or a rejection as soon as `signal` aborts: a
 * ledger that does not honour the signal still cannot hold the call.
 */
function untilAborted<T>(
  signal: AbortSignal | undefined,
  work: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!signal) return work();
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work(signal).then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", abort)
    );
  });
}

function ledgerFailure(message: string): ClaudeCallError {
  return {
    ok: false,
    error: message,
    status: null,
    errorType: "ledger_error",
    transient: false,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function usageFromError(error: unknown): ModelUsage | null {
  if (!error || typeof error !== "object") return null;
  const usage = (error as { usage?: unknown }).usage ??
    (error as { response?: { usage?: unknown } }).response?.usage;
  if (!usage || typeof usage !== "object") return null;
  const value = usage as Partial<ModelUsage>;
  if (
    typeof value.input_tokens !== "number" ||
    typeof value.output_tokens !== "number"
  ) return null;
  return value as ModelUsage;
}

function stopReasonFromError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const reason = (error as { stop_reason?: unknown }).stop_reason;
  return typeof reason === "string" ? reason : null;
}
