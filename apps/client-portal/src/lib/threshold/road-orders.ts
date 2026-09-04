import type { DirectOrder } from '@patina/supabase';

import { journeyStageIndexForStatus } from '@/components/commercial/journey-stepper';

/* ── PIECES BOUGHT DIRECT, ON THE ROAD ───────────────────────────────────────
   A direct order is a piece the client bought herself. It travels the same road
   as everything the studio specified, so it stands at a stop on the same six —
   read from what the order actually knows: nothing has been paid for it yet
   (agreed), it is paid (released to the maker), or the maker has given it a
   tracking number (in transit). A direct order carries no arrival signal at
   all, so it never reports itself home; that is the record, not an omission.

   An order that was cancelled or refunded is not on the road: it is not
   coming. It is not lost either — `toClosedOrders` keeps it, with the word
   `/orders` used for it and the day it was raised, so a refunded piece still
   has somewhere to be read once that page retires.

   An order raised without a project stands on the road of exactly ONE of the
   client's houses — it has no house of its own, and the same lamp drawn in two
   houses reads as two lamps. `standsUnfiled` is the caller's answer to "is
   this the house that holds the unfiled ones", decided the same deterministic
   way the unfiled asks are (the lowest project id the client can open), so the
   lamp stands in the same house on every visit. It says so on its own line
   either way. ────────────────────────────────────────────────────────────── */

export interface RoadOrderModel {
  id: string;
  name: string;
  quantity: number;
  amountCents: number;
  currency: string;
  stageIndex: number;
  /** Payable here: no Checkout session has ever been claimed for it. */
  payable: boolean;
  /**
   * Checkout completed and stamped a PaymentIntent, but the row is still
   * `pending_payment` — an ACH debit clearing. `/orders` said so in as many
   * words; a surface that goes silent on money the client believes has left
   * her account is the one thing this road may not do.
   */
  inFlight: boolean;
  /** Bought direct against no project at all — it belongs to no house. */
  houseless: boolean;
  /** The row itself says the money landed. */
  settled: boolean;
}

/** A piece that is not coming: the word `/orders` gave it, and its date. */
export interface ClosedOrderModel {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  /** `Refunded` / `Canceled` — `/orders`' own words. */
  word: string;
  raisedAt: string | null;
  /** Bought direct against no project at all — the same clause the road gives. */
  houseless: boolean;
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
  standsUnfiled = true,
): RoadOrderModel[] {
  return (orders ?? [])
    .filter((order) => order.status === 'pending_payment' || order.status === 'paid')
    .filter((order) =>
      order.project_id ? order.project_id === projectId : standsUnfiled,
    )
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
      inFlight: order.status === 'pending_payment' && Boolean(order.stripe_payment_intent_id),
      houseless: !order.project_id,
      settled: order.status === 'paid',
    }));
}

const CLOSED_WORD: Record<string, string> = {
  refunded: 'Refunded',
  canceled: 'Canceled',
};

/** Cancelled and refunded orders of this house, newest first. */
export function toClosedOrders(
  orders: DirectOrder[] | undefined,
  projectId: string,
  standsUnfiled = true,
): ClosedOrderModel[] {
  return (orders ?? [])
    .filter((order) => order.status === 'refunded' || order.status === 'canceled')
    .filter((order) =>
      order.project_id ? order.project_id === projectId : standsUnfiled,
    )
    .map((order) => ({
      id: order.id,
      name: order.product_name,
      amountCents: order.amount_cents,
      currency: order.currency || 'USD',
      word: CLOSED_WORD[order.status] ?? 'Closed',
      raisedAt: order.created_at ?? null,
      houseless: !order.project_id,
    }))
    .sort((a, b) => (b.raisedAt ?? '').localeCompare(a.raisedAt ?? ''));
}
