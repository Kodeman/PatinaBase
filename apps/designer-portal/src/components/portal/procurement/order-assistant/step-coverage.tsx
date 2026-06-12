'use client';

/**
 * Order Assistant v2 — client-payment coverage step (the soft gate, W3-T3b).
 *
 * Before a designer commits studio money to a vendor order, surface whether
 * the client has been invoiced — and has paid — for the items going on this
 * PO (00187 `get_ffe_invoice_coverage` via useFfeInvoiceCoverage). This is a
 * SOFT gate: ordering ahead of client payment is sometimes the right call
 * (deadlines, price locks), so the primary action is always available —
 * "Proceed anyway" when items are uncovered, plain Continue otherwise. Infra
 * failures (RPC error, mock projects) NEVER block: a neutral note renders
 * and the designer continues.
 *
 * The query + uncovered summary live in the panel shell (index.tsx) because
 * the footer's primary label and the coverageGateShown/coverageOverridden
 * analytics depend on them; this module owns the rendering plus the pure
 * per-item chip derivation (`deriveCoverageChip`, unit-tested).
 */

import Link from 'next/link';
import type { FfeInvoiceCoverageMap, FfeItemCoverage } from '@patina/supabase';
import { Button } from '@/components/ui/controls';
import {
  formatDollars,
  itemTradeCents,
  type OrderAssistantFFEItem,
} from './types';

// ─── Per-item chip derivation (pure) ───────────────────────────────────────

export interface CoverageChip {
  kind: 'not_invoiced' | 'draft' | 'sent_unpaid' | 'partially_paid';
  label: string;
}

/**
 * Chip for one item's billing state, or `null` when the item is fully
 * covered by a paid invoice (no chip — covered items aren't listed).
 *
 * A MISSING coverage entry means the RPC didn't return the item (not in the
 * project, or RLS-hidden) — treated as 'uninvoiced' for display only, never
 * gated harder (see FfeInvoiceCoverageMap docs).
 */
export function deriveCoverageChip(
  coverage: FfeItemCoverage | undefined,
): CoverageChip | null {
  if (!coverage || coverage.coverage === 'uninvoiced') {
    return { kind: 'not_invoiced', label: 'Not invoiced' };
  }
  if (coverage.coverage === 'paid') return null;
  // coverage === 'invoiced' — refine by the invoice header status.
  if (coverage.invoiceStatus === 'draft') {
    return { kind: 'draft', label: 'Draft invoice' };
  }
  if (coverage.invoiceStatus === 'partially_paid') {
    return { kind: 'partially_paid', label: 'Partially paid' };
  }
  return { kind: 'sent_unpaid', label: 'Invoice sent — unpaid' };
}

/** Items not covered by a PAID invoice, with their display chips. */
export function uncoveredItems(
  items: OrderAssistantFFEItem[],
  coverage: FfeInvoiceCoverageMap | undefined,
): Array<{ item: OrderAssistantFFEItem; chip: CoverageChip }> {
  const out: Array<{ item: OrderAssistantFFEItem; chip: CoverageChip }> = [];
  for (const item of items) {
    const chip = deriveCoverageChip(coverage?.[item.id]);
    if (chip) out.push({ item, chip });
  }
  return out;
}

// ─── Chip styling (golden-hour warning family, per kind) ───────────────────

const CHIP_STYLE: Record<CoverageChip['kind'], { color: string; bg: string }> = {
  not_invoiced: {
    color: 'var(--color-golden-hour, #E8C547)',
    bg: 'rgba(232, 197, 71, 0.12)',
  },
  draft: {
    color: 'var(--color-aged-oak, #867257)',
    bg: 'rgba(134, 114, 87, 0.10)',
  },
  sent_unpaid: {
    color: 'var(--color-golden-hour, #E8C547)',
    bg: 'rgba(232, 197, 71, 0.12)',
  },
  partially_paid: {
    color: 'var(--color-aged-oak, #867257)',
    bg: 'rgba(232, 197, 71, 0.08)',
  },
};

function CoverageChipPill({ chip }: { chip: CoverageChip }) {
  const style = CHIP_STYLE[chip.kind];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-[3px] px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.05em]"
      style={{ color: style.color, background: style.bg }}
    >
      {chip.label}
    </span>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export interface StepCoverageProps {
  projectId: string;
  ffeItems: OrderAssistantFFEItem[];
  /** Coverage map from useFfeInvoiceCoverage (owned by the panel shell). */
  coverage: FfeInvoiceCoverageMap | undefined;
  isLoading: boolean;
  isError: boolean;
  uncovered: Array<{ item: OrderAssistantFFEItem; chip: CoverageChip }>;
  /**
   * Fired when the designer leaves for the invoice composer — the shell
   * closes the panel (abandoning this order session; the queue advances).
   */
  onCreateInvoice: () => void;
}

export function StepCoverage({
  projectId,
  ffeItems,
  isLoading,
  isError,
  uncovered,
  onCreateInvoice,
}: StepCoverageProps) {
  // Loading — keep it quiet; the footer Continue stays enabled (never block).
  if (isLoading) {
    return (
      <section className="mb-3 rounded-[5px] border border-[var(--border-default)] px-3 py-3">
        <div className="type-meta-small text-[var(--text-muted)]">
          Checking client invoice coverage…
        </div>
      </section>
    );
  }

  // Infra failure — neutral note, never a gate.
  if (isError) {
    return (
      <section className="mb-3 rounded-[5px] border border-[var(--border-default)] px-3 py-3">
        <div className="type-meta-small text-[var(--text-primary)]">
          Client invoice coverage
        </div>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
          Couldn&rsquo;t verify invoice coverage — you can continue.
        </p>
      </section>
    );
  }

  // All covered — sage confirmation.
  if (uncovered.length === 0) {
    return (
      <section
        className="mb-3 rounded-[5px] border px-3 py-3"
        style={{
          borderColor: 'var(--color-sage, #A8B5A0)',
          background: 'rgba(168, 181, 160, 0.10)',
        }}
      >
        <div
          className="type-meta-small"
          style={{
            color: 'var(--color-sage, #A8B5A0)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Covered by client payment
        </div>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-[var(--text-primary)]">
          All {ffeItems.length} item{ffeItems.length !== 1 ? 's are' : ' is'} covered
          by paid client invoices.
        </p>
      </section>
    );
  }

  // Some items uncovered — golden-hour warning panel (NOT the terracotta
  // error treatment: this is a judgment call, not a failure).
  const uncoveredCents = uncovered.reduce(
    (sum, u) => sum + itemTradeCents(u.item),
    0,
  );
  const invoiceHref = `/portal/billing/invoices/new?projectId=${projectId}&ffeItemIds=${uncovered
    .map((u) => u.item.id)
    .join(',')}`;

  return (
    <section
      className="mb-3 rounded-[5px] border px-3 py-3"
      style={{
        borderColor: 'var(--color-golden-hour, #E8C547)',
        background: 'rgba(232, 197, 71, 0.06)',
      }}
      role="region"
      aria-labelledby="coverage-warning-heading"
    >
      <div
        id="coverage-warning-heading"
        className="type-meta-small"
        style={{
          color: 'var(--color-golden-hour, #E8C547)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Client payment not confirmed
      </div>
      <p className="mt-1 text-[0.78rem] font-medium text-[var(--text-primary)]">
        {uncovered.length} item{uncovered.length !== 1 ? 's' : ''} not covered by a
        paid client invoice
      </p>
      <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
        Ordering now means fronting {formatDollars(uncoveredCents)} of vendor cost
        from studio funds until the client pays. You can invoice the client first,
        or proceed if the timeline calls for it.
      </p>

      <div className="mt-2 flex flex-col gap-1.5">
        {uncovered.map(({ item, chip }) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5"
          >
            <div className="min-w-0">
              <div className="truncate text-[0.72rem] text-[var(--text-primary)]">
                {item.name}
              </div>
              {item.room && (
                <div className="type-meta-small text-[var(--text-muted)]">{item.room}</div>
              )}
            </div>
            <CoverageChipPill chip={chip} />
          </div>
        ))}
      </div>

      <div className="mt-3">
        {/* Leaving for the composer abandons this order session (the panel
            closes and the caller's queue advances) — W3-T4 wires the
            composer's ffeItemIds prefill. */}
        <Button asChild variant="secondary" size="sm" onClick={onCreateInvoice}>
          <Link href={invoiceHref}>Create client invoice &rarr;</Link>
        </Button>
      </div>
    </section>
  );
}
