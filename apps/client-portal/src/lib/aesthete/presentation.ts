/**
 * Presentation helpers for the quiz + results surfaces (Wave 3A).
 *
 * COPY LAW (design §10.6 / §2.1): user-facing strings never say "AI", never
 * show scores, percentages, or raw numbers as judgment; confidence renders as
 * "early read" / "good" / "strong" only. Everything here is display copy on
 * top of server-computed values — no scoring happens client-side.
 */
import type { SpectrumDimension, StyleQuizBudgetResult } from '@patina/types';

/** On-screen order + quiet pole labels for the six spectrums (§4.1 basis). */
export const SPECTRUM_META: ReadonlyArray<{
  key: SpectrumDimension;
  label: string;
  low: string;
  high: string;
}> = [
  { key: 'warmth', label: 'Warmth', low: 'Cool', high: 'Warm' },
  { key: 'complexity', label: 'Complexity', low: 'Spare', high: 'Layered' },
  { key: 'formality', label: 'Formality', low: 'Relaxed', high: 'Polished' },
  { key: 'timelessness', label: 'Timelessness', low: 'Of the moment', high: 'Enduring' },
  { key: 'boldness', label: 'Boldness', low: 'Quiet', high: 'Bold' },
  { key: 'craftsmanship', label: 'Craftsmanship', low: 'Practical', high: 'Artisanal' },
];

/**
 * Confidence band per the copy law: {early read / good / strong} — never a
 * percent. Bands are a display choice (the design fixes the vocabulary, not
 * the thresholds); tuned so a quiz-only profile (row confidence ~0.5) reads
 * as "good" and behavior-deepened profiles graduate to "strong".
 */
export type ConfidenceBand = 'early read' | 'good' | 'strong';

export function confidenceBand(confidence: number | null | undefined): ConfidenceBand {
  if (confidence == null || confidence < 0.45) return 'early read';
  if (confidence < 0.72) return 'good';
  return 'strong';
}

/** "$4,200" — cents in, whole dollars out. */
export function formatPriceCents(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Budget posture line. The 'discuss' option ships a null range + lead_signal
 * (00243 delta #7) — it reads as an invitation, not a number.
 */
export function budgetPosture(budget: StyleQuizBudgetResult | null | undefined): string | null {
  if (!budget) return null;
  if (budget.min_cents == null || budget.max_cents == null) {
    return budget.label ? `${budget.label} — a conversation, not a number` : null;
  }
  const min = formatPriceCents(budget.min_cents);
  const max = formatPriceCents(budget.max_cents);
  return budget.label ? `${budget.label} · ${min}–${max}` : `${min}–${max}`;
}

/** "Warm Modern, with a thread of Japandi" (archetype names come from the server taxonomy). */
export function archetypeLine(primary: string | null, secondary: string | null): string | null {
  if (!primary) return null;
  if (!secondary) return primary;
  return `${primary}, with a thread of ${secondary}`;
}
