'use client';

/**
 * The not-started band (Wave 4 · W3) — the four supporting rooms of a project
 * document collapse to ONE line while every one of them is still empty:
 *
 *   Not started · mood boards, plan room, spec book, call sheet — open one →
 *
 * The moment any one of them holds something, the line steps aside and the
 * individual bands mount exactly as they do today. Nothing is removed from the
 * product; four empty organs become one door with four handles.
 *
 * The predicates mirror each leaf's own emptiness test — the call-sheet leg
 * mirrors KickoffBand's own null cases, not just the roster count, so a
 * staffed sheet does not pin three empty organs open. Until every source has
 * answered the band holds one quiet line of the collapsed line's own height:
 * mounting the leaves on a loading frame and then removing them is the layout
 * shift this wave exists to kill. The hooks here are the same canonical
 * queries the leaves call, deduped by React Query rather than re-fetched.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  useProjectBoards,
  useProjectFFEItems,
  useProjectOwnedBoards,
  usePlanRoom,
  type ProjectRosterRow,
} from '@patina/supabase';
import { kickoffRetired } from '@/lib/document/roster-derivation';
import { hasMarginNoteBeenSeen } from './margin-note';
import { KickoffBand, kickoffNoteKey } from './roster/kickoff-band';
import { PlanRoomBand } from './plans/plan-room-band';
import { ProjectMoodBoards } from './project-mood-boards';

/** The Add-to-project sheet fires this at the board creator. While the line is
 *  collapsed ProjectMoodBoards — the only listener — is unmounted, so the band
 *  catches it, reveals the room, and re-fires once the room is listening. */
const NEW_BOARD_EVENT = 'document:new-project-board';

const DOORWAY_CLASS =
  'font-mono text-[10px] tracking-[0.03em] text-[var(--color-clay)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

export function NotStartedBand({
  projectId,
  routeId,
  callSheetEnabled,
  rosterRows,
  canCreateBoards = true,
}: {
  projectId: string;
  /** The document route segment — the plan room lives under it. */
  routeId: string;
  /** The call-sheet flag as the page already resolved it. With the flag off
   *  the call sheet is not one of the rooms this line speaks for at all. */
  callSheetEnabled: boolean;
  rosterRows: ProjectRosterRow[];
  canCreateBoards?: boolean;
}) {
  // The mood-board doorway has no route and no page-level listener to reach —
  // its room IS the section below, so the line steps aside and mounts it.
  const [boardsRevealed, setBoardsRevealed] = useState(false);
  // The kickoff dismissal lives in localStorage, so it can only be read after
  // mount — until then the call-sheet leg has not answered either.
  const [kickoffDismissed, setKickoffDismissed] = useState(false);
  const [dismissalRead, setDismissalRead] = useState(false);
  const revealedRef = useRef<HTMLDivElement | null>(null);
  const focusOnReveal = useRef(false);
  const forwardBoardIntent = useRef(false);
  const liveQuery = useProjectOwnedBoards(projectId);
  const frozenQuery = useProjectBoards(projectId);
  const planRoomQuery = usePlanRoom(projectId);
  const ffeQuery = useProjectFFEItems(projectId);

  useEffect(() => {
    setKickoffDismissed(hasMarginNoteBeenSeen(kickoffNoteKey(projectId)));
    setDismissalRead(true);
  }, [projectId]);

  const liveBoards = (liveQuery.data ?? []).filter((board) => board.status !== 'archived');
  const frozenBoards = frozenQuery.data ?? [];
  const boardsAnswered =
    (liveQuery.data !== undefined || liveQuery.isError === true) &&
    (frozenQuery.data !== undefined || frozenQuery.isError === true);
  const planRoom = planRoomQuery.data;
  const planRoomAnswered = planRoom !== undefined || planRoomQuery.isError === true;
  const specBookAnswered = ffeQuery.data !== undefined || ffeQuery.isError === true;
  const allAnswered =
    boardsAnswered && planRoomAnswered && specBookAnswered && dismissalRead;

  const boardsEmpty = liveBoards.length === 0 && frozenBoards.length === 0;
  const planRoomEmpty = (planRoom?.sheets.length ?? 0) === 0;
  const specBookEmpty = (ffeQuery.data ?? []).length === 0;
  const rosterEmpty = rosterRows.length === 0;
  // KickoffBand's own null cases: flag off, four names on the sheet, or the
  // permanent LATER dismissal. Any of them means the call-sheet room has
  // nothing standing on this document, which is what the collapse asks.
  const kickoffSilent =
    !callSheetEnabled || kickoffRetired(rosterRows) || kickoffDismissed;
  const callSheetEmpty = kickoffSilent || rosterEmpty;
  // The line only offers a call-sheet doorway while the sheet is actually
  // bare — naming a staffed sheet "not started" would be the lie.
  const showCallSheetDoorway = callSheetEnabled && rosterEmpty;

  const allEmpty = boardsEmpty && planRoomEmpty && specBookEmpty && callSheetEmpty;
  // The room owns the intent whenever it is on the page; the band only stands
  // in for it while it is not — the placeholder frames included.
  const leavesMounted = allAnswered && (!allEmpty || boardsRevealed);

  useEffect(() => {
    if (leavesMounted) return;
    const onNewBoard = () => {
      forwardBoardIntent.current = true;
      setBoardsRevealed(true);
    };
    window.addEventListener(NEW_BOARD_EVENT, onNewBoard);
    return () => window.removeEventListener(NEW_BOARD_EVENT, onNewBoard);
  }, [leavesMounted]);

  useEffect(() => {
    if (!leavesMounted) return;
    // Child effects run before this one, so the room's listener is already
    // registered by the time the intent is re-fired.
    if (forwardBoardIntent.current) {
      forwardBoardIntent.current = false;
      window.dispatchEvent(new CustomEvent(NEW_BOARD_EVENT));
    }
    if (focusOnReveal.current) {
      focusOnReveal.current = false;
      const root = revealedRef.current;
      const target = root?.querySelector<HTMLElement>('h2') ?? root;
      if (target) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
  }, [leavesMounted]);

  if (!allAnswered) {
    return (
      <p
        data-not-started-band-pending
        aria-hidden
        className="mt-4 min-h-11 border-t border-[var(--color-pearl)] pt-2.5"
      >
        <span className="block h-[2px] w-40 bg-[var(--color-pearl)]" />
      </p>
    );
  }

  if (!allEmpty || boardsRevealed) {
    return (
      <div ref={revealedRef} tabIndex={-1} className="outline-none">
        <ProjectMoodBoards projectId={projectId} canCreate={canCreateBoards} />
        <KickoffBand projectId={projectId} rows={rosterRows} />
        <PlanRoomBand routeId={routeId} projectId={projectId} />
      </div>
    );
  }

  return (
    <p
      data-not-started-band
      className="mt-4 flex min-h-11 flex-wrap items-baseline gap-x-1.5 gap-y-1 border-t border-[var(--color-pearl)] pt-2.5 font-mono text-[10px] tracking-[0.03em] text-[var(--text-muted)]"
    >
      <span>Not started ·</span>
      <button
        type="button"
        className={DOORWAY_CLASS}
        onClick={() => {
          focusOnReveal.current = true;
          setBoardsRevealed(true);
        }}
      >
        mood boards
      </button>
      <span aria-hidden>,</span>
      <Link href={`/doc/${routeId}/plans`} className={DOORWAY_CLASS}>
        plan room
      </Link>
      <span aria-hidden>,</span>
      <Link href={`/doc/${projectId}/spec-book`} className={DOORWAY_CLASS}>
        spec book
      </Link>
      {showCallSheetDoorway && (
        <>
          <span aria-hidden>,</span>
          <button
            type="button"
            className={DOORWAY_CLASS}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('document:open-call-sheet', { detail: { mode: 'picker' } }),
              )
            }
          >
            call sheet
          </button>
        </>
      )}
      <span>— Open one →</span>
    </p>
  );
}
