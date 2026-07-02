/**
 * Structured correction chips (Aesthete design §8.2) — the "not quite right"
 * picker's vocabulary. Each chip names a pole the current read leans too far
 * from, in the designer's own words ("more artisan than that"), and maps to a
 * per-dimension directional override consumed by `submit_taste_correction`:
 * e.g. "More industrial" → { craftsmanship: -0.3 }.
 *
 * Pure data + combinators so the mapping is jest-testable without the UI.
 */

export type SpectrumDimensionKey =
  | 'warmth'
  | 'complexity'
  | 'formality'
  | 'timelessness'
  | 'boldness'
  | 'craftsmanship';

export interface CorrectionChip {
  /** Stable id: `${dimension}:${sign}` */
  id: string;
  dimension: SpectrumDimensionKey;
  /** +1 = the piece reads MORE toward the right pole than the Engine said. */
  sign: 1 | -1;
  /** e.g. "More artisan" — the designer's complaint, phrased as the truth. */
  label: string;
}

/** Magnitude of one chip (matches the §5.4 direction example, ±0.3). */
export const CORRECTION_STEP = 0.3;

const POLES: Array<{ dimension: SpectrumDimensionKey; left: string; right: string }> = [
  { dimension: 'warmth', left: 'cooler', right: 'warmer' },
  { dimension: 'complexity', left: 'simpler', right: 'more ornate' },
  { dimension: 'formality', left: 'more casual', right: 'more formal' },
  { dimension: 'timelessness', left: 'trendier', right: 'more timeless' },
  { dimension: 'boldness', left: 'quieter', right: 'bolder' },
  { dimension: 'craftsmanship', left: 'more industrial', right: 'more artisan' },
];

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The 12 chips, right pole then left pole per dimension. */
export const CORRECTION_CHIPS: CorrectionChip[] = POLES.flatMap((p) => [
  { id: `${p.dimension}:+`, dimension: p.dimension, sign: 1 as const, label: titleCase(p.right) },
  { id: `${p.dimension}:-`, dimension: p.dimension, sign: -1 as const, label: titleCase(p.left) },
]);

/**
 * Fold the selected chips into the RPC's direction jsonb. Opposite chips on
 * the same dimension cancel; the last-selected sign wins per dimension (a
 * designer can't mean both "warmer" and "cooler").
 */
export function chipsToDirection(selectedIds: string[]): Record<string, number> {
  const direction: Record<string, number> = {};
  for (const id of selectedIds) {
    const chip = CORRECTION_CHIPS.find((c) => c.id === id);
    if (!chip) continue;
    direction[chip.dimension] = chip.sign * CORRECTION_STEP;
  }
  return direction;
}

/**
 * Toggle a chip in a selection, evicting the opposite chip of the same
 * dimension so the set stays coherent.
 */
export function toggleChip(selectedIds: string[], chipId: string): string[] {
  if (selectedIds.includes(chipId)) return selectedIds.filter((id) => id !== chipId);
  const chip = CORRECTION_CHIPS.find((c) => c.id === chipId);
  if (!chip) return selectedIds;
  const oppositeId = `${chip.dimension}:${chip.sign === 1 ? '-' : '+'}`;
  return [...selectedIds.filter((id) => id !== oppositeId), chipId];
}
