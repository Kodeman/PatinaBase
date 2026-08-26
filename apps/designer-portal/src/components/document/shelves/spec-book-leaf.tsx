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
import { useProjectFFEItems } from '@patina/supabase';
import { fmtUsd } from '@/lib/document/format';
import { liftByRoom } from '@/lib/document/room-state';
import {
  deriveLineStamp,
  lineStampLabel,
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

/** Every field `deriveLineStamp` reads is already in this fetch — the leaf's
 *  call and the paper's differ only in the PO embed (`withLifecycle`). */
interface SpecRow {
  id: string;
  name: string;
  status: string;
  project_room_id: string | null;
  line_total_cents: number | null;
  blocked: boolean | null;
  received_quantity: number | null;
  quantity?: number | null;
  blocking_decision?: { status: string; due_date: string | null } | null;
  item_claims?: { state: string }[] | null;
  trade_scope_document_id?: string | null;
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
                    value={stampWord(row)}
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

/** F58: the same derivation the paper stamps from, so one line reads one word
 *  in both places. `null` trade progress, never `undefined` — the leaf does not
 *  resolve a scope's real state, and a trade line stays quiet rather than
 *  borrowing the goods machine's vocabulary. */
function stampWord(row: SpecRow): string | undefined {
  return lineStampLabel(deriveLineStamp(row, null).kind) || undefined;
}
