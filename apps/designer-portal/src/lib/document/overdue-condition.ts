/**
 * Overdue — one derivation, three renderings (ratified Ruling IV).
 *
 * Every place a designer meets the overdue fact reads this module and nothing
 * else: the margin item's terracotta stamp, the guide strip's sentence, and the
 * Desk's folio order. The condition is computed here, stored nowhere, and never
 * advances a phase or grants authority (CAPABILITY-LEDGER hard invariant 4).
 *
 * Refused by name, and absent from this module by construction: badge counts,
 * red banners, push notifications, auto-approval, modal nags.
 */

const DAY_MS = 86_400_000;

export interface OverdueCondition {
  isOverdue: boolean;
  /** Whole days elapsed since the due moment; 0 whenever `isOverdue` is false. */
  days: number;
}

export const NOT_OVERDUE: OverdueCondition = { isOverdue: false, days: 0 };

// A bare DATE ('YYYY-MM-DD') must parse as LOCAL midnight, or `new Date()`
// reads it as UTC and the elapsed count slips a day in negative-offset zones.
function parseDue(value: string): number {
  return new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  ).getTime();
}

/**
 * The derivation. `serverOverdue` is the projection's own answer where one
 * exists (the handoffs read model computes it against `now()` in Postgres); it
 * can only withhold the condition, never assert it past a due date that has not
 * arrived, so a stale client clock cannot invent an overdue item.
 */
export function deriveOverdue(
  dueAt: string | null | undefined,
  now: Date,
  serverOverdue?: boolean,
): OverdueCondition {
  if (!dueAt) return NOT_OVERDUE;
  const due = parseDue(dueAt);
  if (Number.isNaN(due)) return NOT_OVERDUE;
  const elapsed = now.getTime() - due;
  if (elapsed <= 0) return NOT_OVERDUE;
  if (serverOverdue === false) return NOT_OVERDUE;
  return { isOverdue: true, days: Math.max(1, Math.floor(elapsed / DAY_MS)) };
}

function dayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The margin item's stamp text. Null when the condition does not hold. */
export function overdueStampLabel(condition: OverdueCondition): string | null {
  return condition.isOverdue ? `Overdue · ${dayCount(condition.days)}` : null;
}

/** The elapsed phrase the guide and Desk sentences read ("6 days"). */
export function overdueElapsedPhrase(
  condition: OverdueCondition,
): string | null {
  return condition.isOverdue ? dayCount(condition.days) : null;
}

/** The Desk's leading sort tier: an overdue folio rises. Position is the
 *  pressure — the folio gains no count, no colour, and no second act. */
export function overdueSortTier(condition: OverdueCondition): number {
  return condition.isOverdue ? 0 : 1;
}
