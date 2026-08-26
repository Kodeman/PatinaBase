'use client';

/**
 * The three blocks the shelved spine grows on a project document: the running
 * index, the rooms, the shelves. It owns the small reads that state each line's
 * truth — the same canonical queries the retired not-started band used to make,
 * so the document is no worse off for the reads.
 *
 * NOT deduped against FF&E: that section reads `useProjectFFEItems` with
 * `withLifecycle: true`, which is a different query key, so this is a second
 * fetch of the schedule. Cheap and already paid for before this wave, but the
 * cost is real — do not "optimize" it away by assuming a shared cache entry.
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
import { useProjectBillingAuthority } from '@/hooks/use-commercial-documents';
import { money } from '@/lib/document/project-commerce';
import type {
  DocumentIndexKey,
  ProjectPaperRegion,
} from '@/lib/document/document-index';
import { roomStateRowFromLine, roomStateWord } from '@/lib/document/room-state';
import type { LineStampInput } from '@/lib/document/stamp-derivation';
import type { ShelfKey } from '@/lib/document/shelves';
import type { DocumentRoom } from '@/hooks/use-document-rooms';
import { useDocumentRunningIndex } from '@/hooks/use-document-running-index';
import { useRoomLens } from './room-lens-context';
import { SpineRunningIndex } from './spine-running-index';
import { SpineRoomsBlock } from './spine-rooms-block';
import { SpineShelvesBlock } from './spine-shelves-block';

/** The schedule line as the spine reads it: what `deriveLineStamp` needs, plus
 *  the room it belongs to. */
type SpineFfeRow = LineStampInput & {
  id: string;
  project_room_id: string | null;
};

export function DocSpineShelvedBlocks({
  projectId,
  regions,
  rooms,
  scheduleValue,
  approvalsValue,
  rosterCount,
  callSheetEnabled,
  openShelf,
  onToggleShelf,
}: {
  projectId: string;
  /** The regions THIS spread mounts (`paperRegionsForSection`), already in
   *  `PROJECT_PAPER_ORDER` order — the index prints them as given so it can
   *  never offer a line for a region the spread left off the paper. */
  regions: readonly ProjectPaperRegion[];
  rooms: readonly DocumentRoom[];
  scheduleValue: string;
  approvalsValue: string;
  rosterCount: number;
  callSheetEnabled: boolean;
  openShelf: ShelfKey | null;
  onToggleShelf: (key: ShelfKey) => void;
}) {
  const { heldRoomId, toggleRoom } = useRoomLens();
  const indexKeys = useMemo(
    () => regions.map((region) => region.key),
    [regions],
  );
  const { activeKey, jump } = useDocumentRunningIndex(indexKeys, projectId);

  const { data: ffeRows } = useProjectFFEItems(projectId) as {
    data: SpineFfeRow[] | undefined;
  };
  // R108 — the Design authority line reads the SAME door MoneyRegion states
  // from (React Query dedupes this one: identical key, identical args). A
  // second derivation off `projects.total_amount_cents` said a different
  // number than the region it points at.
  // Only the Project spread prints the Design authority row, so only it reads
  // the door behind it — the install and care spreads filtered that row out.
  const printsMoneyRow = regions.some((region) => region.key === 'money');
  const authorityQuery = useProjectBillingAuthority(projectId, printsMoneyRow);
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
            .map((line) => roomStateRowFromLine(line)),
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
    money: authorityQuery.isLoading
      ? 'Reading…'
      : authorityQuery.error
        ? 'Authority unread'
        : authorityQuery.data
          ? `${money(authorityQuery.data.authorizedCents)} authorized`
          : 'No authority yet',
  };

  const entries = regions.map((region) => ({
    key: region.key,
    label: region.label,
    value: indexValues[region.key],
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
    // The project's spine never offers this row (shelvesFor filters it out);
    // the status is stated so the record stays total.
    clientcopy: 'As sent · live',
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
        callSheetEnabled={callSheetEnabled}
        onToggleShelf={onToggleShelf}
      />
    </>
  );
}
