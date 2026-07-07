/**
 * Per-line verdict chip spec (Schedule & Boards Wave 2 · C3).
 *
 * The StatusChip label + dot colour for a line's LATEST client verdict. Pure and
 * dependency-light so both the schedule row (Drafting Room's renderVerdictChip)
 * and the line unfold read the same mapping. Null when there is no verdict — the
 * caller renders no chip (a blank line is the calm default).
 *
 *   approved → "Approved"     · calm green (--color-sage)
 *   rejected → "Flagged"      · clay (--color-clay) — the client raised a concern
 *   rejected + resolved → "Flag cleared" · muted (the designer handled it)
 *   comment  → "Noted"        · muted (a note, not a gate)
 */

import type { Verdict } from '@patina/utils';

export interface VerdictChipSpec {
  label: string;
  /** CSS var string for the StatusChip dot. */
  color: string;
}

export function verdictChipSpec(
  verdict: Verdict | null | undefined,
  resolvedAt?: string | null,
): VerdictChipSpec | null {
  switch (verdict) {
    case 'approved':
      return { label: 'Approved', color: 'var(--color-sage)' };
    case 'rejected':
      return resolvedAt
        ? { label: 'Flag cleared', color: 'var(--text-muted)' }
        : { label: 'Flagged', color: 'var(--color-clay)' };
    case 'comment':
      return { label: 'Noted', color: 'var(--text-muted)' };
    default:
      return null;
  }
}
