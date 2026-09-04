/**
 * The old `/proposals/[id]` page's expiry gate, verbatim: a passed date is
 * expired even when the status column still says "sent" because the cron has
 * not run yet. Falsy and unparseable both mean "not expired" — the house never
 * withholds an act on the strength of a date it could not read.
 *
 * Its own module because the door's ACTS and the door's SIGNATURE BLOCK both
 * hold to it, and one may not import the other.
 */
export function hasPassed(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  const at = new Date(validUntil).getTime();
  return !Number.isNaN(at) && at < Date.now();
}
