// po-send: the spec snapshot and revision at send (C-34, SQ-432).
//
// snapshot_purchase_order_spec (00711) records each line's resolved spec and
// returns the PO's revision. It writes a new revision only when the line set
// or a line's values changed since the latest one, so a retry after a failed
// send reuses the revision it took. po-send calls it after every refusal
// guard and before the render, because the PDF has to print the revision it
// carries. Accepted cost (SQ-432 ruling): a send that fails after the
// snapshot, followed by an edit, can skip a revision number the vendor sees.

import type { CallerRpcClient } from './lib.ts';

export type PoSendMode = 'preview' | 'send' | 'mark_sent';

/** A send by email or a send recorded outside Patina; never a preview. */
export function snapshotsSpecOnSend(mode: PoSendMode): boolean {
  return mode === 'send' || mode === 'mark_sent';
}

export type SpecSnapshotResult =
  | { ok: true; revision: number }
  | { ok: false; detail: string };

/** Snapshot the PO's spec as the caller (created_by records the sender). */
export async function snapshotPurchaseOrderSpec(
  client: CallerRpcClient,
  purchaseOrderId: string,
): Promise<SpecSnapshotResult> {
  const { data, error } = await client.rpc('snapshot_purchase_order_spec', {
    p_po_id: purchaseOrderId,
  });
  if (error) {
    const message = (error as { message?: unknown }).message;
    return { ok: false, detail: typeof message === 'string' ? message : 'spec snapshot failed' };
  }
  if (typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
    return { ok: false, detail: 'spec snapshot returned no revision' };
  }
  return { ok: true, revision: data };
}

/** The PO number as printed: "PO-1043 · Revision 2" once the order has been revised. */
export function revisionedPoNumber(poNumber: string, revision: number | null): string {
  return revision !== null && revision > 1 ? `${poNumber} · Revision ${revision}` : poNumber;
}
