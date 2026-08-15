'use client';

/**
 * The spec book, on a shelf — the compiled reference: what is specified, by
 * room, read-only. The working state stays on the paper, in FF&E; this is the
 * same rows regrouped, never a second place to change them.
 *
 * `useProjectFFEItems` is the section's own query — React Query hands back the
 * cached rows rather than reading again.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useProjectFFEItems } from '@patina/supabase';
import { fmtUsd } from '@/lib/document/format';
import { liftByRoom } from '@/lib/document/room-state';
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

interface SpecRow {
  id: string;
  name: string;
  status: string | null;
  project_room_id: string | null;
  line_total_cents: number | null;
}

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
                    value={row.status ? prettyStatus(row.status) : undefined}
                    sub={
                      row.line_total_cents != null
                        ? fmtUsd(row.line_total_cents)
                        : undefined
                    }
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

function prettyStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
