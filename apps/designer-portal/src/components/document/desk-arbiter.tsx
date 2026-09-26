'use client';

/**
 * The Desk arbiter (system-architecture §2, finding 17): every Desk line goes
 * through one slot, and at most one line renders per Desk load.
 *
 * Priority (UX shared addition 3): a person's words (`hire-handoff`), then
 * `desk-first-touch` (first hour only), the walkthrough offer, the teaching
 * note (owner capability > release > faster way, ordered inside
 * `useReturnNote`), and last the setup whisper. After 30 days away the
 * since-line takes the teaching slot instead: it is the visit's one
 * unsolicited note, so it and a teaching note never both render.
 *
 * The line is decided once, at the first ready render where every line ahead
 * of the winner has resolved. Teaching settles at that first paint (R-RT7): a
 * teaching read still pending then yields the load, so it holds no line back,
 * and that pick is not carried: the next Desk load picks again. Otherwise
 * later Desk loads in the same visit (no VISIT_GAP_MS away) keep the visit's
 * line. The teaching note and the since-line are the visit's one unsolicited
 * line in the stored visit too (`useReturnNote` records the one on screen).
 * The setup whisper is a Desk line, never a teaching claim: it records
 * nothing, and a load that decides from the stored visit holds it back after
 * a teaching line. A full reload is usually cold, so teaching yields there
 * and the whisper may show; the whisper and a teaching line can each appear
 * on different loads of the same visit, in either order. Nothing renders
 * while the walkthrough is on screen (R-RT2), and nothing at all when no line
 * is eligible: no placeholder, no space kept.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useSuppressDeskFirstTouch } from '@/components/document/help/desk-walkthrough';
import { MarginNote, hasMarginNoteBeenSeen } from '@/components/document/margin-note';
import { SinceLine } from '@/components/document/teaching/since-line';
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
  const whisperWhen = stateOf('setup-whisper');

  const aheadOfTeaching = handoff !== false || firstTouch !== false || offer !== false;
  const teaching = useReturnNote({
    pinnedProjectIds,
    ready,
    taken: line !== undefined ? line !== 'teaching-note' : aheadOfTeaching || walkthroughOnScreen,
    onScreen: !walkthroughOnScreen && line === 'teaching-note' ? line : null,
  });
  // The stored visit already showed a teaching line: the whisper yields.
  const whisper = teaching.unsolicitedShown ? false : whisperWhen;

  const states: Record<DeskLineKey, DeskLineState> = {
    'hire-handoff': handoff,
    'desk-first-touch': firstTouch,
    'desk-walkthrough-offer': offer,
    'teaching-note': teaching.decided ? teaching.sinceLine !== null || teaching.note !== null : 'pending',
    'setup-whisper': whisper,
  };

  if (ready && line === undefined) {
    const pick = pickDeskLine(states);
    if (pick !== undefined) setLine(pick);
  }

  // A pick at or behind teaching's place, made while teaching sat the load
  // out, is not the visit's line: the next Desk load picks again.
  const carried = teaching.yielded && (line === null || line === 'setup-whisper') ? undefined : line;
  useEffect(() => {
    if (carried !== undefined && visit) visit.line = carried;
  }, [carried]);

  if (walkthroughOnScreen || line == null) return null;
  if (line === 'teaching-note') {
    if (teaching.sinceLine) {
      return (
        <div className="mb-10">
          <SinceLine items={teaching.sinceLine.items} changesHref={teaching.sinceLine.changesHref} />
        </div>
      );
    }
    return teaching.note && teaching.bind ? (
      <MarginNote {...teaching.bind} className="mb-10">
        {teaching.note.body}
      </MarginNote>
    ) : null;
  }
  return states[line] === true ? lines[line].node : null;
}
