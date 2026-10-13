// Shared Claude Messages API adapter. Callers inject the model port and ledger
// in tests; production defaults use the official Anthropic SDK and Supabase RPCs.
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
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
) => Promise<ModelResponse>;
export type ClaudeLedgerReason =
  | "kill"
  | "disabled"
  | "global_daily"
  | "feature_daily"
  | "studio_monthly"
  | string;
export interface LlmLedgerPort {
  reserve(
    feature: string,
    studioId: string | null,
    userId: string | null,
    estUsd: number,
  ): Promise<{
    granted: boolean;
    reason: ClaudeLedgerReason | null;
    usageId: number | null;
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
  return async (params) => {
    const response = await client.messages.create(params as never);
    return {
      stop_reason: response.stop_reason,
      content: response.content,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
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
    async reserve(feature, studioId, userId, estUsd) {
      const { data, error } = await admin.rpc("llm_reserve", {
        p_feature: feature,
        p_studio_id: studioId,
        p_user_id: userId,
        p_est_usd: estUsd,
      });
      if (error) throw error;
      const result = data as {
        granted: boolean;
        reason: ClaudeLedgerReason | null;
        usage_id: number | null;
      };
      return {
        granted: result.granted,
        reason: result.reason,
        usageId: result.usage_id,
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
  caller?: ClaudeCaller;
  ledger?: LlmLedgerPort;
  clientOptions?: ClaudeClientOptions;
}

export async function callClaude(opts: CallClaudeOptions): Promise<
  | { ok: true; response: ModelResponse; usd: number; model: string }
  | { ok: false; denied: "kill" | "disabled" | "budget" }
  | { ok: false; error: string }
> {
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
    return { ok: false, denied: "disabled" };
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
  if (!ledger) return { ok: false, error: "Claude ledger is required" };

  let reservation: Awaited<ReturnType<LlmLedgerPort["reserve"]>>;
  try {
    reservation = await ledger.reserve(
      opts.feature,
      opts.studioId,
      opts.userId,
      estUsd,
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (!reservation.granted) {
    const reason = reservation.reason === "kill"
      ? "kill"
      : reservation.reason === "disabled"
      ? "disabled"
      : "budget";
    return { ok: false, denied: reason };
  }
  if (reservation.usageId === null) {
    return { ok: false, error: "Granted Claude reservation has no usage id" };
  }

  const caller = opts.caller ?? opts.clientOptions?.caller ??
    createClaudeCaller(apiKey, opts.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await caller(request);
    const usd = computeCostUsd(model, response.usage);
    const latencyMs = Date.now() - startedAt;
    await ledger.settle(reservation.usageId, {
      model,
      usage: response.usage,
      usd,
      status: "settled",
      stopReason: response.stop_reason,
      latencyMs,
    });
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
  } catch (error) {
    const knownUsage = usageFromError(error);
    const usd = knownUsage ? computeCostUsd(model, knownUsage) : 0;
    const stopReason = stopReasonFromError(error);
    try {
      await ledger.settle(reservation.usageId, {
        model,
        usage: knownUsage ?? { input_tokens: 0, output_tokens: 0 },
        usd,
        status: "error",
        stopReason,
        latencyMs: Date.now() - startedAt,
      });
    } catch (settleError) {
      log("claude_ledger_settle_failed", {
        feature: opts.feature,
        error: settleError instanceof Error
          ? settleError.message
          : String(settleError),
      });
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
