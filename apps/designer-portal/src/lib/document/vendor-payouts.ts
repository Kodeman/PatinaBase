/**
 * Vendor payouts — what has actually left the studio for the makers, and what
 * is still standing undrawn against a purchase order.
 *
 * `po_payments` is the only place the product records money moving TO a
 * vendor; `purchase_orders.total_cents` and the executed instruments record
 * what is owed. The money ladder's `Moved` rung is the difference, which is
 * why this file exists at all (ruling 10).
 *
 * A partial refund leaves `state = 'paid'` with no column recording the
 * refunded amount (00277 flips the state only on a FULL refund), so a
 * partially-refunded payment still counts its whole face amount as paid out.
 */

import type { POPayment, POPaymentState, PurchaseOrder } from '@patina/supabase';

/** Payment states that have not yet moved money to the maker. */
const UNDRAWN_STATES: readonly POPaymentState[] = ['due', 'pending'];

function allPayments(pos: readonly PurchaseOrder[]): POPayment[] {
  return pos.flatMap((po) => po.payments ?? []);
}

/**
 * Money actually paid out to makers across a set of purchase orders — the sum
 * of every `po_payments` row in state `paid`. `refunded` rows are excluded:
 * that money came back to the studio and never stayed moved.
 */
export function sumPaidVendorPayments(pos: readonly PurchaseOrder[]): number {
  return allPayments(pos)
    .filter((payment) => payment.state === 'paid')
    .reduce((sum, payment) => sum + (payment.amount_cents ?? 0), 0);
}

export interface UndrawnVendorPayments {
  /** Total of every `due` / `pending` payment across the given orders. */
  cents: number;
  /** The kind of the earliest undrawn payment — `deposit`, `balance`, `milestone`. */
  kind: POPayment['kind'] | null;
  /** Our own outbound PO number for that payment's order, when one was assigned. */
  poNumber: string | null;
  /** That payment's own label — `50% at release` and the like. */
  label: string | null;
}

/**
 * What is committed on paper and not yet drawn. The figure is the whole
 * undrawn total; the naming fields describe the payment that comes due first,
 * so the rung can say which tranche it is talking about.
 */
export function selectUndrawnVendorPayments(
  pos: readonly PurchaseOrder[],
): UndrawnVendorPayments {
  const undrawn = pos.flatMap((po) =>
    (po.payments ?? [])
      .filter((payment) => UNDRAWN_STATES.includes(payment.state))
      .map((payment) => ({ payment, po })),
  );

  const cents = undrawn.reduce(
    (sum, { payment }) => sum + (payment.amount_cents ?? 0),
    0,
  );

  const lead = [...undrawn].sort((a, b) => {
    const aDue = a.payment.due_date;
    const bDue = b.payment.due_date;
    if (aDue !== bDue) {
      if (aDue == null) return 1;
      if (bDue == null) return -1;
      return aDue < bDue ? -1 : 1;
    }
    return (a.payment.sort_order ?? 0) - (b.payment.sort_order ?? 0);
  })[0];

  return {
    cents,
    kind: lead?.payment.kind ?? null,
    poNumber: lead?.po.po_number ?? null,
    label: lead?.payment.label ?? null,
  };
}
