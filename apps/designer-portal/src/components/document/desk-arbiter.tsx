'use client';

/**
 * The Desk arbiter (system-architecture §2, finding 17): every Desk line goes
 * through one slot, and at most one line renders per visit.
 *
 * Priority (UX shared addition 3): a person's words (`hire-handoff`), then
 * `desk-first-touch` (first hour only), the walkthrough offer, the teaching
 * note (owner capability > release > faster way, ordered inside
 * `useReturnNote`), and last the setup whisper.
 *
 * The line is decided once, at the Desk's first ready render, when every line
 * ahead of the winner has resolved. The teaching note may take the slot only
 * at that first render, from cache (finding 13). Later Desk loads in the same
 * visit (no VISIT_GAP_MS away) keep the visit's line. Nothing renders while
 * the walkthrough is on screen (R-RT2), and nothing at all when no line is
 * eligible: no placeholder, no space kept.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useSuppressDeskFirstTouch } from '@/components/document/help/desk-walkthrough';
import { MarginNote, hasMarginNoteBeenSeen } from '@/components/document/margin-note';
import { useReturnNote } from '@/hooks/use-teaching-note';
import { VISIT_GAP_MS } from '@/lib/teaching/constants';

export type DeskLineKey =
  | 'hire-handoff'
  | 'desk-first-touch'
  | 'desk-walkthrough-offer'
  | 'teaching-note'
  | 'setup-whisper';

export const DESK_LINE_PRIORITY: readonly DeskLineKey[] = [
  'hire-handoff',
  'desk-first-touch',
  'desk-walkthrough-offer',
  'teaching-note',
  'setup-whisper',
];

/** Eligible now, not eligible, or its inputs are still loading. */
export type DeskLineState = boolean | 'pending';

/**
 * The first eligible line in priority order, or null when none is. Undefined
 * while a line ahead of every eligible one is still pending: wait.
 */
export function pickDeskLine(states: Record<DeskLineKey, DeskLineState>): DeskLineKey | null | undefined {
  for (const key of DESK_LINE_PRIORITY) {
    if (states[key] === 'pending') return undefined;
    if (states[key]) return key;
  }
  return null;
}

/** The page's lines: each keeps its own condition (`when`) and its own node. */
export type DeskLineCandidates = Record<
  Exclude<DeskLineKey, 'teaching-note'>,
  { when: DeskLineState; node: ReactNode }
>;

/** Lines that are MarginNotes keyed by their line key; seen once, never again. */
const ONCE_ONLY: ReadonlySet<DeskLineKey> = new Set([
  'hire-handoff',
  'desk-first-touch',
  'desk-walkthrough-offer',
]);

/** The visit's line, carried across Desk mounts. Client only. */
let visit: { line: DeskLineKey | null | undefined; lastLoadAt: number } | null = null;

/** A Desk load: the line this visit already chose, or undefined for a new visit. */
function carriedLine(): DeskLineKey | null | undefined {
  if (typeof window === 'undefined') return undefined;
  const now = Date.now();
  const line = visit && now - visit.lastLoadAt < VISIT_GAP_MS ? visit.line : undefined;
  visit = { line, lastLoadAt: now };
  return line;
}

/** Tests start a fresh visit. */
export function resetDeskVisit(): void {
  visit = null;
}

export function useDeskLine({
  ready,
  pinnedProjectIds,
  lines,
}: {
  /** The roster's first paint has come (hydrated, the Desk read resolved). */
  ready: boolean;
  pinnedProjectIds: string[];
  lines: DeskLineCandidates;
}): ReactNode {
  const walkthroughOnScreen = useSuppressDeskFirstTouch();
  const [line, setLine] = useState(carriedLine);

  const stateOf = (key: Exclude<DeskLineKey, 'teaching-note'>): DeskLineState => {
    const { when } = lines[key];
    return when === true && ONCE_ONLY.has(key) && hasMarginNoteBeenSeen(key) ? false : when;
  };
  const handoff = stateOf('hire-handoff');
  const firstTouch = stateOf('desk-first-touch');
  const offer = stateOf('desk-walkthrough-offer');
  const whisper = stateOf('setup-whisper');

  const aheadOfTeaching = handoff !== false || firstTouch !== false || offer !== false;
  const teaching = useReturnNote({
    pinnedProjectIds,
    ready,
    taken: line !== undefined ? line !== 'teaching-note' : aheadOfTeaching || walkthroughOnScreen,
  });

  const states: Record<DeskLineKey, DeskLineState> = {
    'hire-handoff': handoff,
    'desk-first-touch': firstTouch,
    'desk-walkthrough-offer': offer,
    'teaching-note': teaching.decided ? teaching.note !== null : 'pending',
    'setup-whisper': whisper,
  };

  if (ready && line === undefined) {
    const pick = pickDeskLine(states);
    if (pick !== undefined) setLine(pick);
  }

  useEffect(() => {
    if (line !== undefined && visit) visit.line = line;
  }, [line]);

  if (walkthroughOnScreen || line == null) return null;
  if (line === 'teaching-note') {
    return teaching.note && teaching.bind ? (
      <MarginNote {...teaching.bind} className="mb-10">
        {teaching.note.body}
      </MarginNote>
    ) : null;
  }
  return states[line] === true ? lines[line].node : null;
}
