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

/** T2 "by look" and the og:image look-check (look.ts). PLACEHOLDERS from
 *  PLAN (team/p-pipeline-quality.md T0b/T2) until SQ-362 calibrates them on
 *  the labelled crop set; any change bumps `threshold_version`. Cosine on
 *  /embed/image vectors; the designer sees words and order, never numbers. */
export const LOOK_THRESHOLDS = {
  threshold_version: 'deck-look-v0-placeholder',
  /** τ_likely: top kNN hit similarity for "likely". */
  likely: 0.85,
  /** τ_margin: top1 − top2 for "likely". */
  margin: 0.03,
  /** τ_look: page photo vs deck crop agree at or above this. */
  pageAgrees: 0.8,
  /** Hits from the fused 0.65 image / 0.35 caption aesthete_vector are never
   *  better than this band until image-only vectors land (contract, W5). */
  fusedCap: 'possible' as const,
  /** Look hits shown per piece. */
  shown: 3,
  /** Hits asked of the kNN twin per piece. */
  knnLimit: 10,
  /** Order-only boost: the designer's own library first. Never moves a band. */
  libraryBoost: { personal: 0.15, studio: 0.1 } as Record<string, number>,
} as const;

/** The look tier runs only when the importer can see at least this many
 *  products with a vector (00679 board_deck_import_look_gate). Below it, only
 *  the look tier is skipped: links and words still run. */
export const LOOK_MIN_VISIBLE_VECTORS = 20;

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
