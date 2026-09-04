'use client';

import { useState } from 'react';

import { useStartDirectOrderCheckout } from '@patina/supabase';

import { GOODS_JOURNEY_STAGES } from '@/components/commercial/journey-stepper';
import { ScoredAction } from '@/components/making/scored-action';
import { moneyInWords } from '@/components/making/standing-sentence';
import { useCheckoutReturn } from '@/lib/threshold/checkout-return';
import type { RoadOrderModel } from '@/lib/threshold/road-orders';

/* ── THE PIECES SHE BOUGHT HERSELF ───────────────────────────────────────────
   The same road, the same stops, one line each — and, on a piece that has not
   been paid for, the act that pays for it. The act goes to the till and the
   till returns to this address, which is where the receipt below is read.
   ───────────────────────────────────────────────────────────────────────── */

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

export interface RoadOrdersProps {
  orders: RoadOrderModel[];
  today?: Date;
}

export function RoadOrders({ orders, today }: RoadOrdersProps) {
  const startCheckout = useStartDirectOrderCheckout({ errorSurface: 'inline' });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const returned = useCheckoutReturn();
  const settlement = returned?.orderId ? returned : null;

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

  if (orders.length === 0) return null;

  return (
    <div data-testid="road-orders">
      {settlement && (
        <p
          role="status"
          data-testid="road-orders-receipt"
          className="mt-4 max-w-[60ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {settlement.outcome === 'settled'
            ? `Paid ${LONG_MONTH_DAY.format(today ?? new Date())}. Receipt in your email.`
            : 'Nothing changed.'}
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
                {`${GOODS_JOURNEY_STAGES[order.stageIndex]} · bought direct${
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
