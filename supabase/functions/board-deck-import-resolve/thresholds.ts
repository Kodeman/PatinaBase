// board-deck-import-resolve · thresholds and run limits.
//
// Every score threshold here is a PLACEHOLDER until SQ-362 calibrates it
// against real decks. Bands are shown to the designer as words and order,
// never as numbers, so moving a threshold changes which word a row gets.

export const THRESHOLD_VERSION = 'deck-resolve-v0-placeholder';

export const THRESHOLDS = {
  /** Link-to-picture pairing by look (cosine on /embed/image vectors). A
   *  pair is assigned only when its similarity reaches `tau` AND beats the
   *  next-best alternative for both the link and the picture by `margin`. */
  pair: { tau: 0.8, margin: 0.05 },
  /** T1 words: the top hit is "likely" only with this score and this margin
   *  over the second; everything else that the search returned is "possible". */
  words: { likelyScore: 0.6, likelyMargin: 0.15 },
} as const;

export const LIMITS = {
  /** Items claimed per run. Each item reads at most one page, so this is
   *  also the run's URL budget (≤8), sized for the 60 s pg_net window. */
  itemsPerRun: 8,
  /** Politeness per host: at most 2 requests at once, about 1 per second. */
  perHostConcurrency: 2,
  perHostSpacingMs: 1_000,
  /** Items worked at once across hosts. */
  runConcurrency: 4,
  /** Words hits asked of the database per item. */
  wordsLimit: 5,
} as const;

/** Adjudication (Anthropic Messages API, forced tool). Sonnet 5 list price,
 *  per million tokens: $2 input, $10 output (claude-api skill, cached
 *  2026-09-25). Used only to log spend on the job_runs row. */
export const ADJUDICATION = {
  model: 'claude-sonnet-5',
  maxTokens: 2_000,
  usdPerMillionInput: 2,
  usdPerMillionOutput: 10,
} as const;
