// board-deck-import-resolve · thresholds and run limits.
//
// The look thresholds and the pairing thresholds were calibrated by SQ-362 on
// retailer gallery pairs (artifacts/deck-import-2026-10-03/calibration/
// REPORT.md, scripts/deck-import-calibration/); the SQ-350 pilot re-checks
// them on real decks. `words` is still a placeholder. Bands are shown to the
// designer as words and order, never as numbers, so moving a threshold
// changes which word a row gets.

export const THRESHOLD_VERSION = 'deck-resolve-v1-sq362';

export const THRESHOLDS = {
  /** Link-to-picture pairing by look (cosine on /embed/image vectors). A
   *  pair is assigned only when its similarity reaches `tau` AND beats the
   *  next-best alternative for both the link and the picture by `margin`.
   *  SQ-362: precision 0.988 (95% low 0.980), recall 79% on 400 simulated
   *  slides; the old 0.8 / 0.05 held 0.996 but recalled 69%. */
  pair: { tau: 0.71, margin: 0.02 },
  /** T1 words: the top hit is "likely" only with this score and this margin
   *  over the second; everything else that the search returned is "possible". */
  words: { likelyScore: 0.6, likelyMargin: 0.15 },
} as const;

/** T2 "by look", T1 exact and the og:image look-check (look.ts), calibrated
 *  by SQ-362 on 1,123 deck-like crops of 476 retailer products (REPORT.md);
 *  any change bumps `threshold_version`. Cosine on /embed/image vectors; the
 *  designer sees words and order, never numbers. */
export const LOOK_THRESHOLDS = {
  threshold_version: 'deck-look-v2-sq362',
  /** τ_likely: top kNN hit similarity for "likely". Score alone barely
   *  separates right from wrong (wrong top hits sit at 0.84–0.96); the
   *  margin does the work. */
  likely: 0.9,
  /** τ_margin: top1 − top2 for "likely". With τ_likely: precision 0.896
   *  (95% low 0.857) on the queries T1 left, vs 0.869 / 0.827 before. */
  margin: 0.025,
  /** τ_look: page photo vs deck crop agree at or above this. Not
   *  recalibrated (SQ-362 measured only true pairs: 24% of room-scene
   *  crops fall below it). */
  pageAgrees: 0.8,
  /** T1 exact (W5): the crop's image-only cosine to a product picture at or
   *  above τ_exact is "strong". SQ-362: 80 of 80 strong rows right at 0.985;
   *  0.95 was right on 71% of them. Kept clear of 1.0: int8 inference drifts
   *  the same picture to ≈0.9966 across batchings (aesthete-inference README). */
  exact: 0.985,
  /** T1 exact (W5): dHash Hamming distance (of 64 bits) at or below this is
   *  "strong" (phash.ts). SQ-362: only an identical hash is safe; at ≤6 just
   *  32% of hash hits were right (plain-background product photos collide,
   *  and a re-cropped copy of the same photo moves ~9 bits). */
  exactHamming: 0,
  /** Hits from the fused 0.65 image / 0.35 caption aesthete_vector are never
   *  better than this band; image-only hits (product_image_vectors) are
   *  preferred whenever a product has them (contract, W5). SQ-362 keeps the
   *  cap: fused scores sit ~0.1 below image-only and never reach τ_likely. */
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
  /** No new piece or adjudication starts this long after the run began, so
   *  the run ends well inside the 60 s pg_net window and the 3 min lease. */
  runStartBudgetMs: 40_000,
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
