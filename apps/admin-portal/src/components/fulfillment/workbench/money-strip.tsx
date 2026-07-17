'use client';

import { useMemo } from 'react';
import {
  computeMoneyStrip,
  formatCents,
  formatPct,
  type FulfillmentWorkbenchLine,
  type FulfillmentOrderDTO,
  type FulfillmentConfigNumbers,
} from '@patina/fulfillment';

// The Workbench money strip (S2, spec §5.2) — five mono figures under the
// split, recomputed LIVE from the React Query cache state on every render, so a
// drag/assign re-figures it in the same paint (the "200ms count" of the
// presentation is the value changing; the count animation itself is out of v1
// scope). ALL math is computeMoneyStrip's (@patina/fulfillment) — this
// component holds zero formulas, per the S2 constraint. When margin is below
// the config floor, the strip container + the commission block go terracotta
// (spec §5.2 "warns terracotta below the margin floor").

const TERRACOTTA = 'var(--color-terracotta)';

interface MoneyStripProps {
  lines: FulfillmentWorkbenchLine[];
  order: FulfillmentOrderDTO;
  config: FulfillmentConfigNumbers;
}

function Block({
  label,
  value,
  tone,
  testid,
}: {
  label: string;
  value: string;
  tone?: 'sage' | 'terracotta';
  testid: string;
}) {
  const color =
    tone === 'sage'
      ? 'var(--color-sage)'
      : tone === 'terracotta'
        ? TERRACOTTA
        : 'var(--text-primary)';
  return (
    <div className="flex flex-col" data-testid={testid}>
      <span
        className="text-[0.53rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        {label}
      </span>
      <span
        className="mt-1 text-[0.9rem] tabular-nums"
        style={{ fontFamily: 'var(--font-meta)', color }}
        data-value={value}
      >
        {value}
      </span>
    </div>
  );
}

export function MoneyStrip({ lines, order, config }: MoneyStripProps) {
  const m = useMemo(() => computeMoneyStrip(lines, order, config), [lines, order, config]);

  return (
    <div
      data-testid="money-strip"
      data-below-floor={m.belowFloor}
      className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-3 lg:grid-cols-5"
      style={{
        borderColor: m.belowFloor ? TERRACOTTA : 'var(--border-default)',
      }}
    >
      <Block label="Captured" value={formatCents(m.capturedCents)} testid="money-captured" />
      <Block label="Vendor cost" value={formatCents(m.vendorCostCents)} testid="money-vendor-cost" />
      <Block label="Freight est." value={formatCents(m.freightEstCents)} testid="money-freight" />
      <Block
        label={m.belowFloor ? `Proj. commission · ${formatPct(m.marginPct)} ↓` : 'Proj. commission'}
        value={formatCents(m.projectedCommissionCents)}
        tone={m.belowFloor ? 'terracotta' : undefined}
        testid="money-commission"
      />
      <Block
        label="Pledge accrual · 25%"
        value={formatCents(m.pledgeAccrualCents)}
        tone="sage"
        testid="money-pledge"
      />
    </div>
  );
}
