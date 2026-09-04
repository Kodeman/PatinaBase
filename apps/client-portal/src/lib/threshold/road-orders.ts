import type { DirectOrder } from '@patina/supabase';

import { journeyStageIndexForStatus } from '@/components/commercial/journey-stepper';

/* ── PIECES BOUGHT DIRECT, ON THE ROAD ───────────────────────────────────────
   A direct order is a piece the client bought herself. It travels the same road
   as everything the studio specified, so it stands at a stop on the same six —
   read from what the order actually knows: nothing has been paid for it yet
   (agreed), it is paid (released to the maker), or the maker has given it a
   tracking number (in transit). A direct order carries no arrival signal at
   all, so it never reports itself home; that is the record, not an omission.

   An order that was cancelled or refunded is not on the road: it is not coming.
   An order raised without a project stands on the road of the house she is
   standing in — it has no other house to stand in. ───────────────────────── */

export interface RoadOrderModel {
  id: string;
  name: string;
  quantity: number;
  amountCents: number;
  currency: string;
  stageIndex: number;
  /** Payable here: no Checkout session has ever been claimed for it. */
  payable: boolean;
}

const AGREED = journeyStageIndexForStatus('approved');
const ORDERED = journeyStageIndexForStatus('ordered');
const IN_TRANSIT = journeyStageIndexForStatus('shipped');

function stopOf(order: DirectOrder): number {
  if (order.status !== 'paid') return AGREED;
  return order.shipping?.tracking_number ? IN_TRANSIT : ORDERED;
}

export function toRoadOrders(
  orders: DirectOrder[] | undefined,
  projectId: string,
): RoadOrderModel[] {
  return (orders ?? [])
    .filter((order) => order.status === 'pending_payment' || order.status === 'paid')
    .filter((order) => !order.project_id || order.project_id === projectId)
    .map((order) => ({
      id: order.id,
      name: order.product_name,
      quantity: order.quantity,
      amountCents: order.amount_cents,
      currency: order.currency || 'USD',
      stageIndex: stopOf(order),
      // An order already in flight (a stamped PaymentIntent, an ACH debit
      // settling) has no failed state to retry from — a second session would
      // only orphan the first.
      payable: order.status === 'pending_payment' && !order.stripe_payment_intent_id,
    }));
}
