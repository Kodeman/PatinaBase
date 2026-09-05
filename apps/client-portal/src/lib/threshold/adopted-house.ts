/* ── The adopted house ──────────────────────────────────────────────────────
   Money and asks raised against no house at all still have to stand
   somewhere, and they must stand in the SAME house on every visit — the same
   lamp read in two houses reads as two lamps, and the same letter answered
   twice is money paid twice. The rule is deterministic and needs no read of
   its own: the lowest project id the client can open adopts them.

   `road-orders.ts` already states this rule in prose and takes the answer
   from its caller; this is the one place that computes it, so the front door
   (`lib/data/active-project.ts`, server) and the house (`threshold.tsx`,
   browser) cannot drift apart on which house that is. ─────────────────────── */

/** The house that adopts what belongs to no house. Null when there is none. */
export function adoptedHouseId(houseIds: readonly string[]): string | null {
  const ids = houseIds.filter((id): id is string => typeof id === 'string' && id !== '');
  if (ids.length === 0) return null;
  return [...ids].sort()[0];
}

/** Is THIS the house that holds the unfiled ones? */
export function standsUnfiled(projectId: string, otherHouseIds: readonly string[]): boolean {
  return adoptedHouseId([projectId, ...otherHouseIds]) === projectId;
}
