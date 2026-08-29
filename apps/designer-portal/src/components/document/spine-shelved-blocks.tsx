'use client';

/**
 * The one block the spine grows on a project document: the running index, and
 * the values its lines state. The rooms and the shelves left for the ticket on
 * the paper (B1) — the spine is what D12 says it is again.
 *
 * NOT deduped against FF&E: that section reads `useProjectFFEItems` with
 * `withLifecycle: true`, which is a different query key, so this is a second
 * fetch of the schedule. Cheap and already paid for before this wave, but the
 * cost is real — do not "optimize" it away by assuming a shared cache entry.
 *
 * The page hands down the facts it has already derived — the schedule's
 * position, the approvals count — so the spine never states a second version of
 * a sentence the letterhead or a region already speaks.
 */

import { useMemo } from 'react';
import { useProjectFFEItems } from '@patina/supabase';
import { useMoneyLadder } from '@/hooks/use-money-ladder';
import { formatLadderRung, selectIndexRung } from '@/lib/document/money-ladder';
import type {
  DocumentIndexKey,
  ProjectPaperRegion,
} from '@/lib/document/document-index';
import type { DocumentRoom } from '@/hooks/use-document-rooms';
import { useDocumentRunningIndex } from '@/hooks/use-document-running-index';
import { SpineRunningIndex } from './spine-running-index';

interface SpineShelvedBlocksProps {
  projectId: string;
  /** The regions THIS spread mounts (`paperRegionsForSection`), already in
   *  `PROJECT_PAPER_ORDER` order — the index prints them as given so it can
   *  never offer a line for a region the spread left off the paper. */
  regions: readonly ProjectPaperRegion[];
  /** Counted, not listed: the rooms themselves are the ticket's row now. */
  rooms: readonly DocumentRoom[];
  scheduleValue: string;
  approvalsValue: string;
}

export function DocSpineShelvedBlocks(props: SpineShelvedBlocksProps) {
  // Only the Project spread prints the Money row, so only it mounts the ladder
  // behind it. Two of the ladder's six reads (`usePurchaseOrders`,
  // `useProjectInvoices`) carry no `enabled` gate, so the gate has to be a
  // conditional MOUNT — calling them on install/care and discarding the answer
  // is two round trips this component alone would pay for.
  const printsMoneyRow = props.regions.some((region) => region.key === 'money');
  return printsMoneyRow ? (
    <SpineBlocksWithMoney {...props} />
  ) : (
    <SpineBlocks {...props} moneyIndexValue="" />
  );
}

/** R108 — the index's money value reads the SAME six-rung ladder MoneyRegion
 *  derives, through the one hook both call. */
function SpineBlocksWithMoney(props: SpineShelvedBlocksProps) {
  const { ladder, settled, failed } = useMoneyLadder(props.projectId);
  // F09/F61 — the index no longer states the one empty tier ("No authority
  // yet"); it reports the live rung the ladder settled on.
  const rung = selectIndexRung(ladder);
  const moneyIndexValue =
    (rung && formatLadderRung(rung)) ??
    (failed ? 'Money unread' : settled ? 'Nothing moving yet' : 'Reading…');
  return <SpineBlocks {...props} moneyIndexValue={moneyIndexValue} />;
}

function SpineBlocks({
  projectId,
  regions,
  rooms,
  scheduleValue,
  approvalsValue,
  moneyIndexValue,
}: SpineShelvedBlocksProps & { moneyIndexValue: string }) {
  const indexKeys = useMemo(
    () => regions.map((region) => region.key),
    [regions],
  );
  const { activeKey, jump } = useDocumentRunningIndex(indexKeys, projectId);

  const { data: ffeRows } = useProjectFFEItems(projectId) as {
    data: unknown[] | undefined;
  };
  const lineCount = (ffeRows ?? []).length;

  const indexValues: Record<DocumentIndexKey, string> = {
    schedule: scheduleValue,
    approvals: approvalsValue,
    ffe: `${lineCount} ${lineCount === 1 ? 'piece' : 'pieces'} · ${
      rooms.length
    } ${rooms.length === 1 ? 'room' : 'rooms'}`,
    money: moneyIndexValue,
    // The closeout band and the record carry no value line in this block; the
    // ladder (W2-L1) is what prints theirs. Blank is what they rendered before
    // the key union widened, so this is the type catching up, not a change.
    care: '',
    record: '',
  };

  const entries = regions.map((region) => ({
    key: region.key,
    label: region.label,
    value: indexValues[region.key],
  }));

  return (
    <SpineRunningIndex entries={entries} activeKey={activeKey} onJump={jump} />
  );
}
