/* ── Which house the client is standing in ──────────────────────────────────
   `/` is the front door for every client, and a client with more than one
   house has to be put down inside one of them. The house that moved last is
   the one she came to see: the project's own record, the studio's last note,
   and the last invoice movement are the three clocks that count as movement,
   and the greatest of them is the house's.

   A house whose clocks cannot be read is not disqualified — it is simply
   never preferred. When no house has a readable clock the first one wins,
   and the caller hands these in the order the project list already reports
   (`updated_at` descending), so "first" is still the freshest thing known.
   ────────────────────────────────────────────────────────────────────────── */

export interface HouseActivity {
  projectId: string;
  /** Every timestamp that counts as movement in this house. */
  movedAt: (string | null | undefined)[];
}

/** The greatest readable timestamp in ms, or null when none can be read. */
export function lastMovementAt(movedAt: (string | null | undefined)[]): number | null {
  let latest: number | null = null;

  for (const raw of movedAt) {
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }

  return latest;
}

export function pickActiveProjectId(houses: HouseActivity[]): string | null {
  let activeId: string | null = null;
  let activeMovedAt: number | null = null;

  for (const house of houses) {
    const movedAt = lastMovementAt(house.movedAt);

    if (activeId === null) {
      activeId = house.projectId;
      activeMovedAt = movedAt;
      continue;
    }

    if (movedAt === null) continue;
    if (activeMovedAt === null || movedAt > activeMovedAt) {
      activeId = house.projectId;
      activeMovedAt = movedAt;
    }
  }

  return activeId;
}
