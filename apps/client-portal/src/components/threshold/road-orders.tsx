'use client';

import { useEffect, useRef, useState } from 'react';

import { useStartDirectOrderCheckout } from '@patina/supabase';

import { GOODS_JOURNEY_STAGES } from '@/components/commercial/journey-stepper';
import { ScoredAction } from '@/components/making/scored-action';
import { moneyInWords } from '@/components/making/standing-sentence';
import {
  revealReturnAnchor,
  useCheckoutConfirmation,
  useCheckoutReturn,
} from '@/lib/threshold/checkout-return';
import { parseSourceDate } from '@/lib/threshold/derive';
import type { ClosedOrderModel, RoadOrderModel } from '@/lib/threshold/road-orders';

/* ── THE PIECES SHE BOUGHT HERSELF ───────────────────────────────────────────
   The same road, the same stops, one line each — and, on a piece that has not
   been paid for, the act that pays for it. The act goes to the till and the
   till returns to this address, which is where the receipt below is read.

   The receipt waits for the order's own row. `?checkout=success` says only
   that Checkout handed the browser back; a bank transfer takes three to five
   business days, and the house does not tell a client she has paid on the
   strength of a query string she could have typed herself.

   Pieces that are not coming — refunded, cancelled — stand at the end with
   their word and the day they were raised. ──────────────────────────────── */

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const LONG_MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function longDate(value: string | null, today?: Date): string | null {
  const date = parseSourceDate(value);
  if (!date) return null;
  return today && today.getFullYear() !== date.getFullYear()
    ? LONG_MONTH_DAY_YEAR.format(date)
    : LONG_MONTH_DAY.format(date);
}

export interface RoadOrdersProps {
  orders: RoadOrderModel[];
  /** Refunded and cancelled pieces — kept, never on the road. */
  closed?: ClosedOrderModel[];
  /** Re-read the direct orders while a return from the till is waiting. */
  onRefetch?: () => void | Promise<unknown>;
  today?: Date;
}

export function RoadOrders({ orders, closed = [], onRefetch, today }: RoadOrdersProps) {
  const startCheckout = useStartDirectOrderCheckout({ errorSurface: 'inline' });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  // Only a return naming a piece standing on THIS road is spoken to: the
  // address is the client's to type, and the house asserts no payment it
  // cannot see a row for.
  const returned = useCheckoutReturn();
  const returnedOrder = returned?.orderId
    ? (orders.find((order) => order.id === returned.orderId) ?? null)
    : null;
  const settlement = returnedOrder ? returned : null;
  const confirm = useCheckoutConfirmation(
    settlement?.outcome === 'settled',
    Boolean(returnedOrder?.settled),
    onRefetch,
  );

  const rail = useRef<HTMLDivElement | null>(null);
  const revealed = useRef(false);
  useEffect(() => {
    if (!settlement || revealed.current) return;
    revealed.current = true;
    revealReturnAnchor(rail.current);
  }, [settlement]);

  const pay = async (orderId: string) => {
    if (startCheckout.isPending) return;
    setPayError(null);
    setPayingId(orderId);
    try {
      const { url } = await startCheckout.mutateAsync({ directOrderId: orderId });
      window.location.assign(url);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Unable to start payment.');
      setPayingId(null);
    }
  };

  if (orders.length === 0 && closed.length === 0) return null;

  return (
    <div ref={rail} data-testid="road-orders">
      {settlement && (
        <p
          role="status"
          data-testid="road-orders-receipt"
          data-confirm={confirm ?? undefined}
          className="mt-4 max-w-[60ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {settlement.outcome !== 'settled'
            ? 'Nothing changed.'
            : confirm === 'confirmed'
              ? `${returnedOrder?.name ?? 'This piece'} · Payment received — thank you! A receipt is on its way to your inbox.`
              : confirm === 'unconfirmed'
                ? 'Your bank transfer has been started. Bank transfers take 3–5 business days to clear — we’ll email your receipt as soon as it lands.'
                : 'Confirming payment… This usually takes a few seconds.'}
        </p>
      )}

      <ul className="mt-4 list-none">
        {orders.map((order) => (
          <li
            key={order.id}
            data-road-order={order.id}
            data-stop-index={order.stageIndex}
            className="border-t border-[var(--border-subtle)] py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <span className="font-heading text-[1.08rem] tracking-[-0.008em]">{order.name}</span>
              <span className="text-[15px] text-[var(--text-body)]">
                {`${GOODS_JOURNEY_STAGES[order.stageIndex]} · ${
                  order.houseless ? 'bought direct, not tied to this house' : 'bought direct'
                }${order.inFlight ? ' · bank transfer pending' : ''}${
                  order.quantity > 1 ? ` · ${order.quantity} of them` : ''
                } · ${moneyInWords(order.amountCents, order.currency)}`}
              </span>
            </div>

            {order.payable && (
              <div className="mt-1">
                <ScoredAction
                  actionKey="order_settle"
                  regionKey="road"
                  surfaceKey="the_threshold"
                  variant="primary"
                  loading={payingId === order.id && startCheckout.isPending}
                  onClick={() => void pay(order.id)}
                >
                  Pay for this piece
                </ScoredAction>
              </div>
            )}
          </li>
        ))}
      </ul>

      {closed.length > 0 && (
        <div data-testid="road-orders-closed" className="mt-4">
          <p className="mb-1 font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
            No longer coming
          </p>
          <ul className="list-none">
            {closed.map((order) => {
              const raised = longDate(order.raisedAt, today);
              return (
                <li
                  key={order.id}
                  data-closed-order={order.id}
                  className="border-t border-[var(--border-subtle)] py-2 text-[15px] leading-[1.62] text-[var(--text-body)]"
                >
                  {`${order.name} · ${order.word}${
                    order.houseless ? ' · bought direct, not tied to this house' : ''
                  }${raised ? ` · bought ${raised}` : ''} · ${moneyInWords(
                    order.amountCents,
                    order.currency,
                  )}`}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {payError && (
        <p
          role="alert"
          data-testid="road-orders-error"
          className="mt-2 max-w-[60ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {payError}
        </p>
      )}
    </div>
  );
}
