'use client';

/**
 * The spec book, on a shelf — the compiled reference: what is specified, by
 * room, read-only. The working state stays on the paper, in FF&E; this is the
 * same rows regrouped, never a second place to change them.
 *
 * NOT deduped against the FF&E section: that call passes `withLifecycle: true`,
 * which is a different query key, so this is its own read of the schedule. The
 * rows are the same rows; the fetch is not the same fetch.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useProjectFFEItems, useProjectRoomPlacements } from '@patina/supabase';
import { fmtUsd } from '@/lib/document/format';
import {
  specAlsoInLine,
  specQuantityLabel,
  type SpecRoomPlacement,
} from '@/lib/spec-books/model';
import { liftByRoom } from '@/lib/document/room-state';
import {
  deriveLineStamp,
  isLaborLine,
  LABOR_STAMP_LABEL,
  laborPiece,
  lineStageInputFromRow,
  lineStampLabel,
  type LineStampRow,
} from '@/lib/document/stamp-derivation';
import { useRoomLens } from '../room-lens-context';
import type { DocumentRoom } from '@/hooks/use-document-rooms';
import {
  ShelfSection,
  ShelfGroup,
  ShelfRow,
  ShelfNote,
  ShelfDoor,
  ShelfLifted,
} from './shelf-parts';

/** Every field `deriveLineStamp` reads, D1's included, is already in this
 *  fetch — the leaf's call and the paper's differ only in the PO embed
 *  (`withLifecycle`). */
type SpecRow = LineStampRow & {
  id: string;
  name: string;
  project_room_id: string | null;
  line_total_cents: number | null;
  unit?: string | null;
};

export function SpecBookLeaf({
  projectId,
  rooms,
}: {
  projectId: string;
  rooms: readonly DocumentRoom[];
}) {
  const { heldRoomId } = useRoomLens();
  const { data, isLoading, isError } = useProjectFFEItems(projectId) as {
    data: SpecRow[] | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  const groups = useMemo(() => {
    const rows = data ?? [];
    const byRoom = rooms.map((room) => ({
      id: room.id,
      name: room.name,
      rows: rows.filter((r) => r.project_room_id === room.id),
    }));
    const loose = rows.filter(
      (r) => !r.project_room_id || !rooms.some((rm) => rm.id === r.project_room_id),
    );
    return [
      ...liftByRoom(byRoom, heldRoomId, (g) => g.id),
      ...(loose.length > 0
        ? [{ id: null as string | null, name: 'Throughout', rows: loose }]
        : []),
    ];
  }, [data, rooms, heldRoomId]);

  // D7 phase 1: a line placed in several rooms stays one row, in its primary
  // room, with the others named under it. Money is never split or repeated.
  const { data: roomPlacements } = useProjectRoomPlacements(projectId);
  const placementsByLine = useMemo(() => {
    const roomName = new Map(rooms.map((room) => [room.id, room.name]));
    const byLine = new Map<string, SpecRoomPlacement[]>();
    for (const placement of roomPlacements ?? []) {
      const name = roomName.get(placement.projectRoomId);
      if (!name) continue;
      byLine.set(placement.ffeItemId, [
        ...(byLine.get(placement.ffeItemId) ?? []),
        { roomName: name, quantity: placement.quantity, areaNote: placement.areaNote },
      ]);
    }
    return byLine;
  }, [roomPlacements, rooms]);

  if (isError) return <ShelfNote>The spec book could not be read.</ShelfNote>;
  if (isLoading) return <ShelfNote>Reading the schedule…</ShelfNote>;

  const heldRoom = rooms.find((r) => r.id === heldRoomId) ?? null;
  const liftedCount =
    groups.find((g) => g.id === heldRoomId)?.rows.length ?? 0;

  return (
    <>
      <ShelfLifted roomName={heldRoom?.name ?? null} found={liftedCount} />
      <ShelfSection label="Specified · by room">
        {groups.every((g) => g.rows.length === 0) ? (
          <ShelfNote>Nothing specified yet.</ShelfNote>
        ) : (
          groups
            .filter((g) => g.rows.length > 0)
            .map((group) => (
              <ShelfGroup
                key={group.id ?? 'throughout'}
                name={group.name}
                lifted={group.id != null && group.id === heldRoomId}
              >
                {group.rows.map((row) => (
                  <ShelfRow
                    key={row.id}
                    name={row.name}
                    meta={
                      specAlsoInLine(
                        placementsByLine.get(row.id),
                        group.id != null ? group.name : null,
                        row.unit,
                      ) ?? undefined
                    }
                    value={stampWord(row, data)}
                    sub={rowSub(row)}
                  />
                ))}
              </ShelfGroup>
            ))
        )}
      </ShelfSection>

      <ShelfNote>
        The compiled reference. Working state lives on the paper, in FF&amp;E.
      </ShelfNote>

      <ShelfDoor>
        <Link href={`/doc/${projectId}/spec-book`} className="block">
          Open the spec book →
        </Link>
      </ShelfDoor>
    </>
  );
}

/** The money, after the quantity when the line counts something other than
 *  pieces (`913 sq ft · $9,545`). A line counted in `each` prints as before. */
function rowSub(row: SpecRow): string | undefined {
  const parts = [
    row.unit && row.unit !== 'each' && row.quantity != null
      ? specQuantityLabel(row.quantity, row.unit)
      : null,
    row.line_total_cents != null ? fmtUsd(row.line_total_cents) : null,
  ].filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** F58: the same derivation the paper stamps from, so one line reads one word
 *  in both places. `null` trade progress, never `undefined` — the leaf does not
 *  resolve a scope's real state, and a trade line stays quiet rather than
 *  borrowing the goods machine's vocabulary. US-21 D1: before an order the
 *  word is the line's stage (a4 `SPECCED`, a3 `READY` / `PLACEHOLDER`), and a
 *  labor line reads `Labor` beside it. */
function stampWord(row: SpecRow, rows: readonly SpecRow[] | undefined): string | undefined {
  const word = lineStampLabel(
    deriveLineStamp({ ...row, stage: lineStageInputFromRow(row, laborPiece(row, rows)) }, null)
      .kind,
  );
  if (!word) return undefined;
  return isLaborLine(row) ? `${LABOR_STAMP_LABEL} · ${word}` : word;
}
