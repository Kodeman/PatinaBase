/**
 * N2 — every need of every live job, in one order (US-25).
 *
 * The order is the band's Next order, read across jobs: D2's class, then
 * W3-R1's deadline distance, then age — `compareForNext`, the comparator
 * `selectNext` sorts by — then the desk's own tie-break by kind, then the
 * caller's order. No second comparator: a Desk that ranked its jobs one way
 * while each job's band ranked its needs another is the drift this replaces.
 *
 * Pure and dependency-light, like desk-derivation.ts.
 */

import type { NeedKind, NeedLine } from './desk-derivation';
import type { DeskRosterInput } from './desk-roster-derivation';
import { rankStanding } from './lens-band-derivation';
import { compareForNext } from './need-class';
import type { NeedKey } from './need-key';
import { needTieBreakRank } from './need-tie-break';

export interface DeskNeed {
  key: NeedKey;
  projectId: string;
  projectName: string;
  need: NeedLine;
}

/** What the order reads off a need: its kind, its words (a stated day count),
 *  its due date and its age. */
export interface NeedOrderFacts {
  kind: NeedKind;
  text: string;
  dueOn?: string | null;
  at?: string | null;
}

/**
 * Anything that leads with a need, in the band's Next order. Each need is
 * read by the band's own `rankStanding` on its own, so two jobs' needs are
 * never folded together by their wording. **Stable**: equal needs keep the
 * caller's order.
 */
export function rankByNext<T>(
  items: readonly T[],
  factsOf: (item: T) => NeedOrderFacts,
  now: Date,
): T[] {
  return items
    .map((item, order) => {
      const facts = factsOf(item);
      const [row] = rankStanding(
        [],
        [
          {
            key: String(order),
            kind: facts.kind,
            text: facts.text,
            actionLabel: null,
            onAct: () => {},
            urgent: false,
            dueOn: facts.dueOn ?? null,
            at: facts.at ?? null,
          },
        ],
        now,
      );
      return { item, kind: facts.kind, order, row: row! };
    })
    .sort(
      (a, b) =>
        compareForNext(a.row, b.row) ||
        needTieBreakRank(a.kind) - needTieBreakRank(b.kind) ||
        a.order - b.order,
    )
    .map(({ item }) => item);
}

/** The needs, one line per key — the first handed in — ranked. */
export function rankDeskNeeds(needs: readonly DeskNeed[], now: Date): DeskNeed[] {
  const seen = new Set<NeedKey>();
  const unique = needs.filter((entry) => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
  return rankByNext(unique, (entry) => entry.need, now);
}

/** Every need of every live job — the whole chain each folder carries, setup
 *  and act-less needs included — ranked by `rankDeskNeeds`. */
export function deriveDeskNeedList(input: DeskRosterInput, now: Date): DeskNeed[] {
  const folderByEngagement = new Map(
    input.folders.map((folder) => [folder.row.engagement_id, folder]),
  );
  const needs: DeskNeed[] = [];
  for (const row of input.live) {
    const folder = folderByEngagement.get(row.engagement_id);
    if (!folder) continue;
    const projectId = row.project_id ?? row.engagement_id;
    for (const need of folder.needs ?? [folder.need]) {
      needs.push({ key: need.key, projectId, projectName: row.title, need });
    }
  }
  return rankDeskNeeds(needs, now);
}
