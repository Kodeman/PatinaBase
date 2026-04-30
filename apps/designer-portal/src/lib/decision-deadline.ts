/**
 * Shared deadline-variant logic for decision cards (PRD line 117).
 *
 * Maps a decision's due date and status to a urgency band:
 *   Sage     — >7 days remaining or already decided
 *   Gold     — 3-7 days remaining
 *   Terracotta — 0-2 days remaining or overdue
 *
 * Both `daysLeft === null` (no deadline) and `responded`/`decided` short-circuit
 * before the band logic.
 */

const DAY_MS = 86_400_000;

export type DeadlineBand = 'decided' | 'none' | 'sage' | 'gold' | 'terracotta';

export interface DeadlineVariant {
  band: DeadlineBand;
  color: string;
  /** Short user-facing label such as "Decided", "5d left", "3d overdue". */
  label: string;
  /** Days remaining (negative = overdue), null if no deadline. */
  daysLeft: number | null;
  isOverdue: boolean;
}

const COLORS = {
  decided: 'var(--color-sage, #A8B5A0)',
  sage: 'var(--color-sage, #A8B5A0)',
  gold: 'var(--color-golden-hour, #E8C547)',
  terracotta: 'var(--color-terracotta, #D4A090)',
  none: 'var(--text-muted)',
} as const;

export function deadlineVariant(
  dueDate: string | Date | null | undefined,
  status: string | null | undefined,
  now: Date = new Date(),
): DeadlineVariant {
  if (status === 'responded' || status === 'decided') {
    return { band: 'decided', color: COLORS.decided, label: 'Decided', daysLeft: null, isOverdue: false };
  }
  if (!dueDate) {
    return { band: 'none', color: COLORS.none, label: 'No deadline', daysLeft: null, isOverdue: false };
  }
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  const days = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);

  if (days < 0) {
    return {
      band: 'terracotta',
      color: COLORS.terracotta,
      label: `${Math.abs(days)}d overdue`,
      daysLeft: days,
      isOverdue: true,
    };
  }
  if (days <= 2) {
    return {
      band: 'terracotta',
      color: COLORS.terracotta,
      label: `${days}d left`,
      daysLeft: days,
      isOverdue: false,
    };
  }
  if (days <= 7) {
    return {
      band: 'gold',
      color: COLORS.gold,
      label: `${days}d left`,
      daysLeft: days,
      isOverdue: false,
    };
  }
  return {
    band: 'sage',
    color: COLORS.sage,
    label: `${days}d left`,
    daysLeft: days,
    isOverdue: false,
  };
}

/** Surface band for backgrounds / borders, lighter than the foreground color. */
export function bandSurface(band: DeadlineBand): string {
  switch (band) {
    case 'terracotta':
      return 'rgba(212, 160, 144, 0.08)';
    case 'gold':
      return 'rgba(232, 197, 71, 0.08)';
    case 'sage':
    case 'decided':
      return 'rgba(168, 181, 160, 0.08)';
    case 'none':
    default:
      return 'transparent';
  }
}
