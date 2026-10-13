export type ClaudeRole = "triage" | "judge" | "extract" | "answer" | "draft";
export type ClaudeEffort = "low" | "medium" | "high";

export const ROLE_MODELS: Record<
  ClaudeRole,
  { model: string; effort: ClaudeEffort }
> = {
  triage: { model: "claude-haiku-5-5", effort: "low" },
  judge: { model: "claude-haiku-5-5", effort: "low" },
  extract: { model: "claude-sonnet-5-5", effort: "medium" },
  answer: { model: "claude-sonnet-5-5", effort: "medium" },
  draft: { model: "claude-sonnet-5-5", effort: "high" },
};

// First-party API rates per million tokens, verified 2026-10-13:
// https://claude.com/pricing. Haiku has a higher rate above 100K prompt tokens.
export const PRICING: Record<string, {
  inputPerMTok: number;
  outputPerMTok: number;
  longContextThreshold?: number;
  longContextInputPerMTok?: number;
  longContextOutputPerMTok?: number;
}> = {
  "claude-haiku-5-5": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    longContextThreshold: 100_000,
    longContextInputPerMTok: 0.5,
    longContextOutputPerMTok: 2.5,
  },
  "claude-sonnet-5-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-opus-5-5": { inputPerMTok: 4, outputPerMTok: 20 },
};

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function computeCostUsd(model: string, usage: ModelUsage): number {
  const rates = PRICING[model];
  if (!rates) throw new Error(`Unknown Claude model pricing: ${model}`);
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const promptTokens = usage.input_tokens + cacheWrite + cacheRead;
  const longContext = rates.longContextThreshold !== undefined &&
    promptTokens > rates.longContextThreshold;
  const inputRate = longContext
    ? rates.longContextInputPerMTok!
    : rates.inputPerMTok;
  const outputRate = longContext
    ? rates.longContextOutputPerMTok!
    : rates.outputPerMTok;
  return (
    usage.input_tokens * inputRate +
    cacheWrite * inputRate * 1.25 +
    cacheRead * inputRate * 0.1 +
    usage.output_tokens * outputRate
  ) / 1_000_000;
}

// Fail during module initialization rather than allowing an unpriced model.
for (const { model } of Object.values(ROLE_MODELS)) {
  if (!Object.hasOwn(PRICING, model)) {
    throw new Error(`Missing Claude model pricing: ${model}`);
  }
}
