export type ClaudeRole =
  | "triage"
  | "judge"
  | "extract"
  | "answer"
  | "draft"
  | "perceive";
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
  // Vision: a plate's subject box, focal point, flags and alt (US-49 Call A1).
  perceive: { model: "claude-sonnet-5-5", effort: "high" },
};

// First-party API rates per million tokens, verified 2026-10-13:
// https://platform.claude.com/docs/en/about-claude/pricing. Haiku has a higher
// rate above 100K prompt tokens. Cache multipliers apply to the input rate in
// effect: 5-minute write 1.25x, 1-hour write 2x, read per model.
export const PRICING: Record<string, {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadMultiplier: number;
  longContextThreshold?: number;
  longContextInputPerMTok?: number;
  longContextOutputPerMTok?: number;
}> = {
  "claude-haiku-5-5": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadMultiplier: 0.1,
    longContextThreshold: 100_000,
    longContextInputPerMTok: 0.5,
    longContextOutputPerMTok: 2.5,
  },
  "claude-sonnet-5-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadMultiplier: 0.05,
  },
  "claude-opus-5-5": {
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadMultiplier: 0.05,
  },
};

const CACHE_WRITE_5M_MULTIPLIER = 1.25;
const CACHE_WRITE_1H_MULTIPLIER = 2;

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number | null;
    ephemeral_5m_input_tokens?: number | null;
  } | null;
}

export function computeCostUsd(model: string, usage: ModelUsage): number {
  const rates = PRICING[model];
  if (!rates) throw new Error(`Unknown Claude model pricing: ${model}`);
  // The TTL breakdown, when present, partitions cache_creation_input_tokens.
  const breakdown = usage.cache_creation;
  const cacheWrite1h = breakdown?.ephemeral_1h_input_tokens ?? 0;
  const cacheWrite5m = breakdown
    ? breakdown.ephemeral_5m_input_tokens ?? 0
    : usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const promptTokens = usage.input_tokens + cacheWrite5m + cacheWrite1h +
    cacheRead;
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
    cacheWrite5m * inputRate * CACHE_WRITE_5M_MULTIPLIER +
    cacheWrite1h * inputRate * CACHE_WRITE_1H_MULTIPLIER +
    cacheRead * inputRate * rates.cacheReadMultiplier +
    usage.output_tokens * outputRate
  ) / 1_000_000;
}

// Fail during module initialization rather than allowing an unpriced model.
for (const { model } of Object.values(ROLE_MODELS)) {
  if (!Object.hasOwn(PRICING, model)) {
    throw new Error(`Missing Claude model pricing: ${model}`);
  }
}
