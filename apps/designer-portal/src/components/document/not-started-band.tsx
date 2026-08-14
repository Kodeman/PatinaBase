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
 * The predicates mirror each leaf's own emptiness test, and a source that has
 * not answered yet is NOT empty — so the collapse can only happen on settled
 * reads, never on a loading frame. The hooks here are the same canonical
 * queries the leaves call, deduped by React Query rather than re-fetched.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  useProjectBoards,
  useProjectFFEItems,
  useProjectOwnedBoards,
  usePlanRoom,
  type ProjectRosterRow,
} from '@patina/supabase';
import { KickoffBand } from './roster/kickoff-band';
import { PlanRoomBand } from './plans/plan-room-band';
import { ProjectMoodBoards } from './project-mood-boards';

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
  const liveQuery = useProjectOwnedBoards(projectId);
  const frozenQuery = useProjectBoards(projectId);
  const planRoomQuery = usePlanRoom(projectId);
  const ffeQuery = useProjectFFEItems(projectId);

  const liveBoards = (liveQuery.data ?? []).filter((board) => board.status !== 'archived');
  const frozenBoards = frozenQuery.data ?? [];
  const boardsEmpty =
    liveQuery.data !== undefined &&
    frozenQuery.data !== undefined &&
    liveBoards.length === 0 &&
    frozenBoards.length === 0;
  const planRoom = planRoomQuery.data;
  const planRoomEmpty = planRoom !== undefined && planRoom.sheets.length === 0;
  const specBookEmpty = ffeQuery.data !== undefined && ffeQuery.data.length === 0;
  const callSheetEmpty = !callSheetEnabled || rosterRows.length === 0;

  const allEmpty = boardsEmpty && planRoomEmpty && specBookEmpty && callSheetEmpty;

  if (!allEmpty || boardsRevealed) {
    return (
      <>
        <ProjectMoodBoards projectId={projectId} canCreate={canCreateBoards} />
        <KickoffBand projectId={projectId} rows={rosterRows} />
        <PlanRoomBand routeId={routeId} projectId={projectId} />
      </>
    );
  }

  return (
    <p
      data-not-started-band
      className="mt-4 flex min-h-11 flex-wrap items-baseline gap-x-1.5 gap-y-1 border-t border-[var(--color-pearl)] pt-2.5 font-mono text-[10px] tracking-[0.03em] text-[var(--text-muted)]"
    >
      <span>Not started ·</span>
      <button type="button" className={DOORWAY_CLASS} onClick={() => setBoardsRevealed(true)}>
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
      {callSheetEnabled && (
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
      <span>— open one →</span>
    </p>
  );
}
