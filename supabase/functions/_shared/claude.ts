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
  }): Promise<void>;
}

export interface ClaudeClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  caller?: ClaudeCaller;
  getEnv?: (key: string) => string | undefined;
  log?: (event: string, fields?: Record<string, unknown>) => void;
  capture?: typeof captureServerEvent;
}

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

export function createLlmLedger(admin: SupabaseClient): LlmLedgerPort {
  return {
    async reserve(feature, studioId, userId, estUsd, role, promptVersion) {
      const { data, error } = await admin.rpc("llm_reserve", {
        p_feature: feature,
        p_studio_id: studioId,
        p_user_id: userId,
        p_est_usd: estUsd,
        p_role: role ?? null,
        p_prompt_version: promptVersion ?? null,
      });
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
    async settle(usageId, fields) {
      const { error } = await admin.rpc("llm_settle", {
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
  timeoutMs: number;
  /** Cancels the whole call, SDK retries included; an aborted call settles as an error. */
  signal?: AbortSignal;
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

  let reservation: Awaited<ReturnType<LlmLedgerPort["reserve"]>>;
  try {
    reservation = await ledger.reserve(
      opts.feature,
      opts.studioId,
      opts.userId,
      estUsd,
      opts.role,
      opts.promptVersion,
    );
  } catch (error) {
    return ledgerFailure(errorMessage(error));
  }
  if (!reservation.granted) {
    const denied = reservation.reason === "kill"
      ? "kill"
      : reservation.reason === "disabled"
      ? "disabled"
      : "budget";
    return {
      ok: false,
      denied,
      reason: reservation.reason,
      resetsAt: reservation.resetsAt ?? null,
    };
  }
  if (reservation.usageId === null) {
    return ledgerFailure("Granted Claude reservation has no usage id");
  }

  const startedAt = Date.now();
  let response: ModelResponse;
  try {
    // Built inside the try: every failure after a granted reservation settles.
    const caller = opts.caller ?? opts.clientOptions?.caller ??
      createClaudeCaller(apiKey, opts.timeoutMs);
    response = await caller(request, opts.signal);
  } catch (error) {
    return await settleFailure(error, {
      ledger,
      usageId: reservation.usageId,
      model,
      startedAt,
      log,
      feature: opts.feature,
    });
  }

  // The response is paid for: a ledger failure from here on must not turn it
  // into a failure the caller would retry and pay for again.
  const usd = computeCostUsd(model, response.usage);
  const latencyMs = Date.now() - startedAt;
  await settleUsage(
    ledger,
    reservation.usageId,
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

/** Settles with one retry of the same fields; a lasting failure is logged and
 * left to the stale-reservation sweep, which counts the reserved estimate. */
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
  );
  const failure = modelFailure(error);
  return knownUsage ? { ...failure, usd } : failure;
}

async function settleUsage(
  ledger: LlmLedgerPort,
  usageId: number,
  fields: Parameters<LlmLedgerPort["settle"]>[1],
  log: NonNullable<ClaudeClientOptions["log"]>,
  feature: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await ledger.settle(usageId, fields);
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
