'use client';

/**
 * The Document's Pieces region as an overview of rooms (US-21 Q14, S7, SPEC
 * a1/a10/a12). The front matter under the head, then one row per room; the
 * Build room (`WORK THIS ROOM →`) is where the lines are worked.
 *
 * One room unfolds at a time, to every line it holds (placed lines included),
 * so a line placed in four rooms is on the page once. A line the paper asks
 * for (a landing, a deep link, `#line-<id>`) unfolds the room it stands in.
 * While every room must show (choosing a piece, marking installed) each line
 * prints in its primary room only.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useProjectRoomPlacements } from '@patina/supabase';
import {
  deriveOverviewRows,
  overviewFrontMatter,
  type OverviewLine,
  type OverviewRoom,
  type OverviewRow,
  type OverviewTally,
} from '@/lib/document/pieces/overview-derivation';
import { PiecesOverviewRow } from './pieces-overview-row';

export interface PiecesOverviewProps {
  projectId: string;
  lines: readonly OverviewLine[];
  rooms: readonly OverviewRoom[];
  job: OverviewTally;
  /** The line the paper holds open; its room unfolds to show it. */
  openLineId?: string | null;
  /** Every room unfolded, each line in its primary room. */
  allOpen?: boolean;
  /** a10 — the room the reader came back to (`#pieces-room-<id>`). */
  returnedRoomId?: string | null;
  /** The room lens holds this room: its row is lifted first. */
  heldRoomId?: string | null;
  /** A room folded while the line it held open was in it. */
  onRoomFolded?: (lineIds: readonly string[]) => void;
  onAddLine: (row: OverviewRow) => void;
  renderLines: (row: OverviewRow, lineIds: readonly string[]) => ReactNode;
  /** Stands above the rows (the `Choose the piece` prompt). */
  lead?: ReactNode;
  /** Stands under the rows (`+ Room`). */
  children?: ReactNode;
}

export function PiecesOverview({
  projectId,
  lines,
  rooms,
  job,
  openLineId = null,
  allOpen = false,
  returnedRoomId = null,
  heldRoomId = null,
  onRoomFolded,
  onAddLine,
  renderLines,
  lead,
  children,
}: PiecesOverviewProps) {
  const { data: placements } = useProjectRoomPlacements(projectId);
  const rows = useMemo(() => {
    const derived = deriveOverviewRows(lines, placements, rooms);
    const held = derived.findIndex((row) => row.roomId != null && row.roomId === heldRoomId);
    return held > 0
      ? [derived[held], ...derived.slice(0, held), ...derived.slice(held + 1)]
      : derived;
  }, [lines, placements, rooms, heldRoomId]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const holds = (key: string | null, lineId: string) =>
    rows.find((row) => row.key === key)?.lineIds.includes(lineId) ?? false;
  // A line held open elsewhere wins over the room she unfolded by hand, and its
  // room stays unfolded once she folds the line.
  const forcedKey =
    openLineId && !holds(openKey, openLineId)
      ? (rows.find((row) => row.primaryLineIds.includes(openLineId))?.key ??
        rows.find((row) => row.lineIds.includes(openLineId))?.key ??
        null)
      : null;
  useEffect(() => {
    if (forcedKey) setOpenKey(forcedKey);
  }, [forcedKey]);
  const shownKey = forcedKey ?? openKey;

  const toggle = (key: string) => {
    const shown = rows.find((row) => row.key === shownKey);
    if (shown) onRoomFolded?.(shown.lineIds);
    setOpenKey(key === shownKey ? null : key);
  };

  const frontMatter = overviewFrontMatter(job);
  return (
    <div data-pieces-overview>
      {frontMatter && (
        <p className="mb-3 text-[16px] text-[var(--ink)]">{frontMatter}</p>
      )}
      {lead}
      <ul>
        {rows.map((row) => {
          const open = allOpen || row.key === shownKey;
          return (
            <PiecesOverviewRow
              key={row.key}
              projectId={projectId}
              row={row}
              open={open}
              returned={row.roomId != null && row.roomId === returnedRoomId}
              lifted={row.roomId != null && row.roomId === heldRoomId}
              onToggle={() => toggle(row.key)}
              onAddLine={() => onAddLine(row)}
            >
              {open && renderLines(row, allOpen ? row.primaryLineIds : row.lineIds)}
            </PiecesOverviewRow>
          );
        })}
      </ul>
      {children}
    </div>
  );
}
