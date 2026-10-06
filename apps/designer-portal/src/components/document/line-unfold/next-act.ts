/**
 * C-14 (D1-03, §3.4): the one act lifted above the unfold's cells. The order
 * readiness rule decides whether Order is on offer; past that, the PO's
 * lifecycle decides. Order → Send → Log the ack → Mark in production → Mark
 * shipped → Log inspection → Mark installed. Every other act still applicable
 * stays where it lives (its cell, or the action row).
 */

/**
 * C-03 (D1-07): the one forward move a PO can record from the line. Delivered
 * is not here — it comes from receiving check-in.
 */
export const NEXT_PO_STATUS: Record<
  string,
  { to: 'in_production' | 'shipped'; label: string }
> = {
  confirmed: { to: 'in_production', label: 'Mark in production' },
  in_production: { to: 'shipped', label: 'Mark shipped' },
};

export type NextAct =
  | { kind: 'order' }
  | { kind: 'send' }
  | { kind: 'log-ack' }
  | { kind: 'advance'; to: 'in_production' | 'shipped'; label: string }
  | { kind: 'inspect' }
  | { kind: 'install' };

export interface NextActPo {
  status?: string | null;
  sent_at?: string | null;
  acknowledged_at?: string | null;
  is_patina_catalog?: boolean | null;
}

/** C-10: the Orders ledger's canAck predicate, read on the line. */
export function canLogAck(po: NextActPo | null): boolean {
  return (
    !!po &&
    !!po.sent_at &&
    !po.acknowledged_at &&
    !po.is_patina_catalog &&
    po.status !== 'cancelled'
  );
}

/** R18: Send is offered for drafted, never-sent POs only. */
export function canSend(po: NextActPo | null): boolean {
  return !!po && po.status === 'draft' && !po.sent_at;
}

/** Inspection opens once the goods are moving toward the studio. */
export function canInspect(po: NextActPo | null, itemStatus: string): boolean {
  return !!po && (itemStatus === 'shipped' || itemStatus === 'delivered');
}

export function deriveNextAct({
  itemStatus,
  po,
  ready,
  inspected,
  hasOpenClaim,
}: {
  /** `project_ffe_items.status`. */
  itemStatus: string;
  /** The line's PO, with any just-recorded status move already applied. */
  po: NextActPo | null;
  /** `deriveOrderReadiness(...).ready`. */
  ready: boolean;
  /** The receipt has been inspected (`received_quantity` recorded). */
  inspected: boolean;
  /** An open claim carries its own lead act (Notify vendor / Mark resolved). */
  hasOpenClaim: boolean;
}): NextAct | null {
  if (!po) {
    if (ready) return { kind: 'order' };
    return itemStatus === 'delivered' && !hasOpenClaim
      ? { kind: 'install' }
      : null;
  }
  if (canSend(po)) return { kind: 'send' };
  if (canLogAck(po)) return { kind: 'log-ack' };
  const advance = NEXT_PO_STATUS[po.status ?? ''];
  if (advance) return { kind: 'advance', ...advance };
  if (hasOpenClaim) return null;
  if (itemStatus === 'delivered' && inspected) return { kind: 'install' };
  if (canInspect(po, itemStatus)) return { kind: 'inspect' };
  return null;
}
