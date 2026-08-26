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
  useProjectInvoices,
  usePurchaseOrders,
} from '@patina/supabase';
import {
  useProjectBillingAuthority,
  useProjectInstruments,
  useTradeScopes,
  useWorkingBudget,
} from '@/hooks/use-commercial-documents';
import { deriveMoneyLadder, formatLadderRung } from '@/lib/document/money-ladder';
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
  // R108 — the Money line reads the SAME six-rung ladder MoneyRegion derives
  // (React Query dedupes every one of these hooks: identical key, identical
  // args). Only the Project spread prints the Money row, so only it reads the
  // hooks behind it — the install and care spreads filtered that row out.
  const printsMoneyRow = regions.some((region) => region.key === 'money');
  const authorityQuery = useProjectBillingAuthority(projectId, printsMoneyRow);
  const budgetQuery = useWorkingBudget(projectId, printsMoneyRow);
  const instrumentsQuery = useProjectInstruments(projectId, printsMoneyRow);
  const tradeScopesQuery = useTradeScopes(projectId, printsMoneyRow);
  // Neither hook below takes an `enabled` gate (money-region.tsx calls them
  // the same, unconditional way) — on install/care, where MoneyRegion never
  // mounts, this is a real fetch this component alone now pays for.
  const purchaseOrdersQuery = usePurchaseOrders({ projectId });
  const invoicesQuery = useProjectInvoices(projectId);
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

  const authority = authorityQuery.data ?? null;
  const authorityFailed = Boolean(authorityQuery.error);
  const authoritySettled = !authorityQuery.isLoading && !authorityFailed;

  const budgetVersion = budgetQuery.data?.version ?? null;
  const budgetFailed = Boolean(budgetQuery.error);
  const budgetSettled = !budgetQuery.isLoading && !budgetFailed;
  const planLines = budgetVersion?.lines ?? [];
  const planCents = planLines.reduce((sum, line) => sum + line.targetCents, 0);

  const committedFailed = Boolean(
    instrumentsQuery.error || tradeScopesQuery.error,
  );
  const committedSettled =
    !instrumentsQuery.isLoading &&
    !tradeScopesQuery.isLoading &&
    !committedFailed;
  const executedInstruments = (instrumentsQuery.data ?? []).filter(
    (instrument) => instrument.state === 'executed',
  );
  const executedScopes = (tradeScopesQuery.data ?? []).filter(
    (scope) => scope.state === 'executed',
  );
  const executedCount = executedInstruments.length + executedScopes.length;
  const committedCents =
    executedInstruments.reduce(
      (sum, instrument) => sum + instrument.totalAmountCents,
      0,
    ) +
    executedScopes.reduce((sum, scope) => sum + scope.clientPriceCents, 0);

  const purchaseOrdersFailed = Boolean(purchaseOrdersQuery.error);
  const purchaseOrdersSettled =
    !purchaseOrdersQuery.isLoading && !purchaseOrdersFailed;
  const invoicesFailed = Boolean(invoicesQuery.error);
  const invoicesSettled = !invoicesQuery.isLoading && !invoicesFailed;

  const moneyLadder = useMemo(
    () =>
      deriveMoneyLadder({
        budget: {
          settled: authoritySettled,
          failed: authorityFailed,
          authorizedCents: authority ? authority.authorizedCents : null,
        },
        plan: {
          settled: budgetSettled,
          failed: budgetFailed,
          versionNumber: budgetVersion?.version ?? null,
          lineCount: planLines.length,
          targetCents: planCents,
        },
        authorized: {
          settled: committedSettled,
          failed: committedFailed,
          executedCount,
          committedCents,
        },
        purchaseOrders: {
          settled: purchaseOrdersSettled,
          failed: purchaseOrdersFailed,
          rows: purchaseOrdersQuery.data ?? [],
        },
        invoices: {
          settled: invoicesSettled,
          failed: invoicesFailed,
          rows: invoicesQuery.data ?? [],
        },
      }),
    [
      authority,
      authorityFailed,
      authoritySettled,
      budgetFailed,
      budgetSettled,
      budgetVersion?.version,
      planCents,
      planLines.length,
      committedCents,
      committedFailed,
      committedSettled,
      executedCount,
      purchaseOrdersQuery.data,
      purchaseOrdersFailed,
      purchaseOrdersSettled,
      invoicesQuery.data,
      invoicesFailed,
      invoicesSettled,
    ],
  );

  // F09/F61 — the index no longer states the one empty tier ("No authority
  // yet"); it reports the live rung the ladder settled on. `Owed` is the
  // receivable the specimen names; if nothing is owed the index falls through
  // to the next rung with a figure rather than printing a rung with none.
  const moneyIndexValue = printsMoneyRow
    ? (formatLadderRung(moneyLadder.owed) ??
      formatLadderRung(moneyLadder.moved) ??
      formatLadderRung(moneyLadder.authorized) ??
      formatLadderRung(moneyLadder.budget) ??
      (authorityFailed || purchaseOrdersFailed || invoicesFailed
        ? 'Money unread'
        : authoritySettled && purchaseOrdersSettled && invoicesSettled
          ? 'Nothing moving yet'
          : 'Reading…'))
    : '';

  const indexValues: Record<DocumentIndexKey, string> = {
    schedule: scheduleValue,
    approvals: approvalsValue,
    ffe: `${rows.length} ${rows.length === 1 ? 'piece' : 'pieces'} · ${
      rooms.length
    } ${rooms.length === 1 ? 'room' : 'rooms'}`,
    money: moneyIndexValue,
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
    // F17 — the trade word stays; the gloss names what the room holds.
    planroom: `the drawing set · ${
      sheetCount === 0
        ? 'nothing filed'
        : `${sheetCount} ${sheetCount === 1 ? 'sheet' : 'sheets'}`
    }`,
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
    // F12 — the knowledge shelf is retired; the key stays in ShelfKey (its
    // only remaining reference is `shelfDefinition`'s throw, which is
    // unreachable now that no row offers it) so the record stays total.
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
