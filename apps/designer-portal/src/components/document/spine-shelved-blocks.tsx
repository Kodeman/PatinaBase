'use client';

/**
 * The three blocks the shelved spine grows on a project document: the running
 * index, the rooms, the shelves. It owns the small reads that state each line's
 * truth — the same canonical queries the surfaces themselves call, deduped by
 * React Query rather than fetched again (they are the reads the retired
 * not-started band used to make).
 *
 * The page hands down the facts it has already derived — the schedule's
 * position, the approvals count, the money figure — so the spine never states a
 * second version of a sentence the letterhead or a region already speaks.
 */

import { useMemo } from 'react';
import {
  useProjectBoards,
  useProjectFFEItems,
  useProjectOwnedBoards,
  usePlanRoom,
} from '@patina/supabase';
import {
  DOCUMENT_INDEX_KEYS,
  DOCUMENT_INDEX_LABELS,
  type DocumentIndexKey,
} from '@/lib/document/document-index';
import { roomStateWord } from '@/lib/document/room-state';
import type { ShelfKey } from '@/lib/document/shelves';
import type { DocumentRoom } from '@/hooks/use-document-rooms';
import { useDocumentRunningIndex } from '@/hooks/use-document-running-index';
import { useRoomLens } from './room-lens-context';
import { SpineRunningIndex } from './spine-running-index';
import { SpineRoomsBlock } from './spine-rooms-block';
import { SpineShelvesBlock } from './spine-shelves-block';

interface SpineFfeRow {
  id: string;
  status: string | null;
  project_room_id: string | null;
}

export function DocSpineShelvedBlocks({
  projectId,
  rooms,
  scheduleValue,
  approvalsValue,
  moneyValue,
  rosterCount,
  openShelf,
  onToggleShelf,
}: {
  projectId: string;
  rooms: readonly DocumentRoom[];
  scheduleValue: string;
  approvalsValue: string;
  moneyValue: string;
  rosterCount: number;
  openShelf: ShelfKey | null;
  onToggleShelf: (key: ShelfKey) => void;
}) {
  const { heldRoomId, toggleRoom } = useRoomLens();
  const { activeKey, jump } = useDocumentRunningIndex(
    DOCUMENT_INDEX_KEYS,
    projectId,
  );

  const { data: ffeRows } = useProjectFFEItems(projectId) as {
    data: SpineFfeRow[] | undefined;
  };
  const planRoom = usePlanRoom(projectId);
  const liveBoards = useProjectOwnedBoards(projectId);
  const frozenBoards = useProjectBoards(projectId);

  const rows = useMemo(() => ffeRows ?? [], [ffeRows]);

  const spineRooms = useMemo(
    () =>
      rooms.map((room) => ({
        id: room.id,
        name: room.name,
        stateWord: roomStateWord(
          rows
            .filter((r) => r.project_room_id === room.id)
            .map((r) => ({ installed: r.status === 'installed' })),
        ),
      })),
    [rooms, rows],
  );

  const indexValues: Record<DocumentIndexKey, string> = {
    schedule: scheduleValue,
    approvals: approvalsValue,
    ffe: `${rows.length} ${rows.length === 1 ? 'piece' : 'pieces'} · ${
      rooms.length
    } ${rooms.length === 1 ? 'room' : 'rooms'}`,
    money: moneyValue,
  };

  const entries = DOCUMENT_INDEX_KEYS.map((key) => ({
    key,
    label: DOCUMENT_INDEX_LABELS[key],
    value: indexValues[key],
  }));

  const sheetCount = planRoom.data?.sheets.length ?? 0;
  const boardCount =
    (liveBoards.data ?? []).filter((b) => b.status !== 'archived').length +
    (frozenBoards.data ?? []).length;

  const shelfStatuses: Record<ShelfKey, string> = {
    planroom:
      sheetCount === 0
        ? 'Nothing filed'
        : `${sheetCount} ${sheetCount === 1 ? 'sheet' : 'sheets'}`,
    specbook:
      rows.length === 0
        ? 'Nothing specified'
        : `${rows.length} specified · by room`,
    moodboards:
      boardCount === 0
        ? 'No boards yet'
        : `${boardCount} ${boardCount === 1 ? 'board' : 'boards'}`,
    callsheet:
      rosterCount === 0
        ? 'Nobody on it yet'
        : `${rosterCount} on the roster`,
    knowledge: 'Studio library',
  };

  return (
    <>
      <SpineRunningIndex
        entries={entries}
        activeKey={activeKey}
        onJump={jump}
      />
      <SpineRoomsBlock
        rooms={spineRooms}
        heldRoomId={heldRoomId}
        onToggleRoom={toggleRoom}
      />
      <SpineShelvesBlock
        openShelf={openShelf}
        statuses={shelfStatuses}
        onToggleShelf={onToggleShelf}
      />
    </>
  );
}
