'use client';

import { useState } from 'react';
import { ListRow, StatusDot } from '@/components/portal';
import {
  CONCIERGE_STAGE_LABELS,
  formatAgeInStage,
  formatCountdown,
  isDeadlineUrgent,
  nextUndoneRequiredItem,
  paymentFlagVariant,
  PAYMENT_FLAG_LABELS,
  type ConciergeStage,
} from '@/lib/concierge-stages';
import type { ConciergeOrder } from '@/services/concierge-orders';
import { useConciergeOrders } from '@/hooks/use-concierge-orders';
import { OrderDetail } from './order-detail';

// The Transaction Tracker's ledger-style list (WP-2.3). Designed for 10-20
// concurrent orders — a hairline row list, not a BI grid. Each row shows title
// / maker / stage chip / age-in-stage / next undone checklist item / payment
// StatusDot (terracotta on mismatch) / damage countdown badge; clicking a row
// expands its full detail (checklists, linked docs, freight, damage, advance).

const STAGE_CHIP_COLOR: Record<ConciergeStage, string> = {
  po_draft: 'var(--text-muted)',
  po_sent: 'var(--color-dusty-blue, var(--color-info))',
  freight_booked: 'var(--color-aged-oak)',
  in_transit: 'var(--color-clay)',
  delivered: 'var(--color-sage, var(--color-success))',
  reconciled: 'var(--color-success)',
  cancelled: 'var(--text-subtle)',
};

function StageChip({ stage }: { stage: ConciergeStage }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.66rem] font-medium uppercase tracking-wide"
      style={{
        color: STAGE_CHIP_COLOR[stage],
        border: `1px solid ${STAGE_CHIP_COLOR[stage]}`,
        opacity: stage === 'cancelled' ? 0.6 : 1,
      }}
    >
      {CONCIERGE_STAGE_LABELS[stage]}
    </span>
  );
}

function DamageBadge({ deadline }: { deadline: string | null }) {
  const urgent = isDeadlineUrgent(deadline);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.66rem] font-medium"
      style={{
        color: urgent ? 'var(--color-terracotta, var(--color-error))' : 'var(--text-muted)',
        border: `1px solid ${urgent ? 'var(--color-terracotta, var(--color-error))' : 'var(--border-default)'}`,
      }}
      title={`Carrier deadline: ${deadline ?? 'unset'}`}
    >
      Damage · {formatCountdown(deadline)}
    </span>
  );
}

function OrderListItem({ order }: { order: ConciergeOrder }) {
  const [expanded, setExpanded] = useState(false);
  const stage = order.stage;
  const nextItem = nextUndoneRequiredItem(order.checklists?.[stage]);
  const damageActive = !!order.damage && order.damage.state !== 'resolved';

  return (
    <div>
      <ListRow
        title={order.title}
        onClick={() => setExpanded((v) => !v)}
        meta={[
          <StageChip key="stage" stage={stage} />,
          order.vendor_name || 'No maker',
          stage === 'cancelled'
            ? 'cancelled'
            : `in stage ${formatAgeInStage(order.stage_entered_at)}`,
          nextItem ? `Next: ${nextItem.label}` : (stage === 'cancelled' ? undefined : 'stage clear'),
        ]}
        right={
          <div className="flex items-center gap-3">
            {damageActive && <DamageBadge deadline={order.damage!.carrier_deadline} />}
            <StatusDot
              variant={paymentFlagVariant(order.payment_flag)}
              label={PAYMENT_FLAG_LABELS[order.payment_flag]}
              size="sm"
            />
            <span
              className="text-[0.7rem] text-[var(--text-subtle)]"
              aria-hidden
              data-testid="expand-caret"
            >
              {expanded ? '▾' : '▸'}
            </span>
          </div>
        }
      />
      {expanded && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle,transparent)] px-0 pb-6">
          <OrderDetail id={order.id} />
        </div>
      )}
    </div>
  );
}

export function OrdersList({
  filterStage,
  filterFlag,
}: {
  filterStage?: ConciergeStage;
  filterFlag?: 'mismatch';
}) {
  const { data: orders, isLoading, error } = useConciergeOrders({
    stage: filterStage,
    payment_flag: filterFlag,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 py-6" data-testid="orders-loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded bg-[var(--bg-hover)]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center type-body text-[var(--color-error)]">
        Failed to load orders: {(error as Error).message}
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="type-body text-[var(--text-muted)]">No concierge orders yet.</p>
        <p className="type-meta-small mt-1 text-[var(--text-subtle)]">
          Create one to start tracking a Rail-A order through its lifecycle.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="orders-list">
      {orders.map((order) => (
        <OrderListItem key={order.id} order={order} />
      ))}
    </div>
  );
}
