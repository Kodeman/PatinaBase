import { UUID, Timestamps } from './common';
import type { SpectrumDimension } from './teaching';

export type StylePreference =
  | 'modern'
  | 'traditional'
  | 'minimalist'
  | 'eclectic'
  | 'industrial'
  | 'scandinavian'
  | 'bohemian'
  | 'coastal';

export interface StyleProfile extends Timestamps {
  id: UUID;
  userId: UUID;
  primaryStyle: StylePreference;
  secondaryStyles: StylePreference[];
  colorPreferences: ColorPreference[];
  materialPreferences: string[];
  budgetRange: BudgetRange;
  roomTypes: string[];
  aestheticScore?: AestheticScore;
}

export interface ColorPreference {
  name: string;
  hex: string;
  preference: 'love' | 'like' | 'neutral' | 'dislike';
}

export interface BudgetRange {
  min: number;
  max: number;
  currency: string;
}

export interface AestheticScore {
  overall: number;
  categories: Record<string, number>;
  generatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Aesthete Engine — style quiz wire types (quiz v2)
//
// Contract: docs/prds/AE/aesthete-engine-system-design.md §7.1/§7.2, as
// SHIPPED by supabase/migrations/00243_aesthete_client_quiz.sql (where §7.1
// and 00243 differ, 00243 wins — deltas documented in
// packages/aesthete-quiz/WIRE-CONTRACT.md).
//
// Option-key unions mirror the 00243 quiz_option_loadings seed exactly.
// Consumed by @patina/aesthete-quiz (wire client + hooks); domain types live
// HERE per the delivery plan's contention rule (never a parallel type home).
// ═══════════════════════════════════════════════════════════════════════════

/** The five §7.1 answer keys, in on-screen order Q1–Q5. */
export type StyleQuizQuestionKey =
  | 'visual_resonance'
  | 'lifestyle'
  | 'material'
  | 'investment'
  | 'catalyst';

/** Q1 — visual resonance (single-select, question weight 1.0). */
export type VisualResonanceOption =
  | 'warm_minimal'
  | 'cool_modern'
  | 'classic_comfort'
  | 'eclectic_curated';

/** Q2 — lifestyle (multi-select, question weight 0.3). */
export type LifestyleOption = 'family' | 'entertaining' | 'sanctuary' | 'work_from_home';

/** Q3 — material (single-select, question weight 0.7). */
export type MaterialOption =
  | 'weathered_oak'
  | 'brushed_metal'
  | 'soft_linen'
  | 'aged_leather'
  | 'woven_rattan';

/** Q4 — investment (single-select, question weight 0.3). */
export type InvestmentOption = 'starter' | 'curated_comfort' | 'heirloom' | 'discuss';

/**
 * Q5 — catalyst (single-select, question weight 0 — a lead signal, never
 * aesthetics). Vocabulary is PROVISIONAL until quiz content lands (00243
 * header): the server tolerates unknown catalyst keys with zero loading.
 */
export type CatalystOption = 'new_home' | 'moving' | 'milestone' | 'refresh' | 'just_looking';

/** The §7.1 `p_answers` payload. All five keys must be present. */
export interface StyleQuizAnswers {
  visual_resonance: VisualResonanceOption;
  lifestyle: LifestyleOption[];
  material: MaterialOption;
  investment: InvestmentOption;
  /** Key must be present; the value may be null (server passes it through). */
  catalyst: CatalystOption | null;
}

/**
 * `p_source`. §7.1 names 'marketing_site' | 'client_portal' | 'ios'; the
 * shipped RPC accepts any text and defaults to 'web' (00243 delta).
 */
export type StyleQuizSource = 'marketing_site' | 'client_portal' | 'ios' | 'web' | (string & {});

/** `p_timings` — per-question dwell in ms, keyed `q1_ms`…`q5_ms` (§7.1). */
export type StyleQuizTimings = Record<string, number>;

/** `p_attribution` — free-form; §7.1 names utm_source + posthog_distinct_id. */
export interface StyleQuizAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  posthog_distinct_id?: string;
  [key: string]: unknown;
}

/** Six spectrum values ∈ [−1, 1] (or confidences ∈ [0, 1]) keyed by dimension. */
export type StyleQuizSpectrums = Record<SpectrumDimension, number>;

export interface StyleQuizArchetypeResult {
  /** Style name from the 00006 taxonomy (e.g. "Warm Modern"); null when nothing accumulated. */
  primary: string | null;
  secondary: string | null;
  /** Primary's share of total accumulated archetype weight ∈ (0, 1]; null when no weights (00243 delta). */
  confidence: number | null;
}

/** Q4 budget passthrough. 'discuss' ships null range + `lead_signal: true`. */
export interface StyleQuizBudgetResult {
  min_cents: number | null;
  max_cents: number | null;
  label: string | null;
  /** ω ∈ [−1, 1] — starter −0.6 … heirloom +0.7 (§7.2). */
  value_orientation: number | null;
  /** Present (true) only on the 'discuss' option — a lead signal, not aesthetics. */
  lead_signal?: boolean;
}

/**
 * `submit_style_quiz` response — §7.1 documented keys verbatim, plus the three
 * ADDITIVE keys shipped by 00243 (spectrum_confidence, patina_affinity,
 * version — design v1.0.2 amendment header).
 */
export interface StyleQuizProfile {
  profile_id: UUID;
  session_key: UUID;
  archetype: StyleQuizArchetypeResult;
  spectrums: StyleQuizSpectrums;
  budget: StyleQuizBudgetResult;
  /** {material: affinity ∈ [0, 1]} — e.g. {"wood": 0.9}. */
  material_affinities: Record<string, number>;
  catalyst: string | null;
  /** ADDITIVE (00243): per-dimension confidence c_k = min(1, Σ|δ_k|·q_w). */
  spectrum_confidence: StyleQuizSpectrums;
  /** ADDITIVE (00243): patina affinity ∈ [0, 1], loaded by Q3 materials. */
  patina_affinity: number;
  /** ADDITIVE (00243): profile version for this session_key (resubmit = new version). */
  version: number;
}

/** `claim_quiz_session` response (shape is 00243-as-shipped; not in §7.1). */
export interface ClaimQuizSessionResult {
  session_key: UUID;
  user_id: UUID;
  profile_id: UUID;
  /** client_style_profiles rows bound to the user by this call (0 on re-claim — idempotent). */
  claimed_profiles: number;
  claimed_sessions: number;
  /** Whether the iOS user_style_signals bridge ran (requires a profiles row). */
  bridged_style_signals: boolean;
}
