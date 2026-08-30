'use client';

/**
 * The Worktable frame (Start to Signature W2, flag `worktable`).
 *
 * The paper's fixed skeleton — spine, letterhead, guide, margin, the bands, the
 * Record, the colophon, the shelves — is identical whether the flag is on or
 * off. This frame is the only thing that changes: the middle of the paper, and
 * only its composition. With no table it renders its children and nothing else,
 * which is the composition this document has always printed.
 *
 * What the frame adds, per table:
 *   · the turn line, when the derivation has moved off the pinned composition
 *   · the seal's note, arriving on the Delivery table
 *   · Intake's honest future seams
 *   · Speccing's four mount slots, which W3 fills and which print nothing empty
 *
 * The frame carried the job ticket's one mount until R127. The lens band stands
 * at the document's own top on every composition, so the frame prints no header
 * of its own and takes no node for one.
 */

import type { ReactNode } from 'react';

import type { TableComposition } from '@/lib/document/table-derivation';
import { IntakeFutureSeams } from './future-seam';
import { SealTurnNote } from './seal-turn-note';
import { TableSlot, type SpeccingTableSlots } from './table-slots';
import { TableTurnLine } from './table-turn-line';

export function TableFrame({
  composition,
  pending,
  onTurn,
  sealTurn,
  slots,
  children,
}: {
  /** null = the flag is off (or the row has not answered): no table. */
  composition: TableComposition | null;
  /** The composition the derivation would compose now, when it has moved. */
  pending: TableComposition | null;
  onTurn: () => void;
  /** Present only on the one arrival that followed a seal. */
  sealTurn: { signedDate: string | null } | null;
  slots: SpeccingTableSlots;
  children: ReactNode;
}) {
  if (!composition) return <>{children}</>;
  const { table, setting } = composition;

  return (
    <>
      {pending && <TableTurnLine onTurn={onTurn} />}
      {table === 'delivery' && sealTurn && (
        <SealTurnNote signedDate={sealTurn.signedDate} />
      )}
      <div data-table={table} data-table-setting={setting}>
        {table === 'speccing' && (
          <TableSlot name="rooms-rail" node={slots['rooms-rail']} />
        )}
        {children}
        {table === 'intake' && <IntakeFutureSeams />}
        {table === 'speccing' && (
          <>
            <TableSlot name="scheme" node={slots.scheme} />
            <TableSlot name="boards-strip" node={slots['boards-strip']} />
            <TableSlot name="reach-in" node={slots['reach-in']} />
          </>
        )}
      </div>
    </>
  );
}
