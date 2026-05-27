'use client';

// TODO(merge): Builder 3 owns the shared PaymentPill at
//   `@/components/portal/procurement/payment-pill`. At merge time, replace
//   the inline `PaymentPill` + `PatinaHandledPill` below with imports from
//   that shared module. The inline versions here mirror dossier §D.5 / §D.7.

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { POPayment, PurchaseOrder } from '@patina/supabase';

// ─── Shared types ──────────────────────────────────────────────────────────

/**
 * In-memory grouping shape produced by `groupByVendor` in the By Vendor page.
 * One VendorGroup represents all purchase orders for a single vendor across
 * any number of projects.
 */
export interface VendorGroup {
  vendorId: string;
  vendorName: string;
  defaultPaymentTerms: string | null;
  orders: PurchaseOrder[];
  totalCents: number;
  itemCount: number;       // count of PO header rows (one per "order/item" in the card sense)
  projectIds: Set<string>; // unique projects this vendor's POs span
  hasDuePayment: boolean;
}

// ─── Formatting helpers ────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PAYMENT_PATTERN_LABELS: Record<string, string> = {
  fifty_fifty: '50 / 50',
  thirty_seventy: '30 / 70',
  full_upfront: 'Full upfront',
  net_30: 'Net 30',
  custom_milestones: 'Custom',
};

function formatPaymentTerms(terms: string | null): string {
  if (!terms) return 'No default terms';
  return PAYMENT_PATTERN_LABELS[terms] ?? terms;
}

// ─── PaymentPill (inline placeholder) ──────────────────────────────────────
//
// TODO: replace at merge with Builder 3's shared PaymentPill from
//   `@/components/portal/procurement/payment-pill`. The shape and color
//   mappings here mirror dossier §D.5 / §D.7 so swapping should be a 1-line
//   import change.

interface PaymentPillProps {
  payment: POPayment;
}

const STATE_STYLES: Record<
  string,
  { bg: string; text: string; stateLabel: string }
> = {
  pending: {
    bg: 'rgba(229, 226, 221, 0.5)',
    text: 'var(--color-aged-oak)',
    stateLabel: 'Pending',
  },
  due: {
    bg: 'rgba(212, 165, 116, 0.18)',
    text: 'var(--color-warning)',
    stateLabel: 'Due',
  },
  paid: {
    bg: 'rgba(122, 155, 118, 0.15)',
    text: 'var(--color-success)',
    stateLabel: 'Paid',
  },
};

function PaymentPill({ payment }: PaymentPillProps) {
  const styles = STATE_STYLES[payment.state] ?? STATE_STYLES.pending;

  const kindLabel =
    payment.kind === 'deposit'
      ? 'Deposit'
      : payment.kind === 'balance'
        ? 'Balance'
        : (payment.label ?? 'Milestone');

  const dateLabel =
    payment.state === 'due' && payment.due_date
      ? ` ${formatDate(payment.due_date)}`
      : '';

  return (
    <span
      className="inline-flex items-center rounded-[3px] px-2 py-0.5"
      style={{
        backgroundColor: styles.bg,
        color: styles.text,
        fontFamily: 'var(--font-meta)',
        fontSize: '0.58rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {kindLabel} · {styles.stateLabel}
      {dateLabel}
    </span>
  );
}

function PatinaHandledPill() {
  return (
    <span
      className="inline-flex items-center rounded-[3px] px-2 py-0.5"
      style={{
        backgroundColor: 'rgba(196, 165, 123, 0.15)',
        color: 'var(--color-clay)',
        fontFamily: 'var(--font-meta)',
        fontSize: '0.58rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      Patina handled
    </span>
  );
}

// ─── PO Status label ───────────────────────────────────────────────────────

const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  in_production: 'In Production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function PoStatusLabel({ status }: { status: string }) {
  return (
    <span className="font-mono text-[0.55rem] uppercase tracking-wider text-[var(--text-muted)]">
      {PO_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Payment terms pill ────────────────────────────────────────────────────

function PaymentTermsPill({ terms }: { terms: string | null }) {
  return (
    <span
      className="inline-flex items-center rounded-[3px] px-2 py-0.5"
      style={{
        backgroundColor: 'rgba(196, 165, 123, 0.10)',
        color: 'var(--color-aged-oak)',
        fontFamily: 'var(--font-meta)',
        fontSize: '0.58rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {formatPaymentTerms(terms)}
    </span>
  );
}

// ─── VendorSectionCard ─────────────────────────────────────────────────────

interface VendorSectionCardProps {
  group: VendorGroup;
  /**
   * Primary action label rendered in the card header. Defaults to "View orders".
   * Click handler is a no-op in Sprint 1 — Wave 1.4 wires the side-panel flow.
   */
  ctaLabel?: string;
  onCtaClick?: () => void;
}

export function VendorSectionCard({
  group,
  ctaLabel = 'View orders',
  onCtaClick,
}: VendorSectionCardProps) {
  const [expanded, setExpanded] = useState(true);

  const projectCount = group.projectIds.size;

  return (
    <section
      className="rounded-md border"
      style={{
        borderColor: group.hasDuePayment
          ? 'var(--color-warning)'
          : 'var(--border-default)',
        background: 'var(--bg-surface)',
      }}
    >
      {/* Card header — vendor name + meta + payment-terms pill + total + CTA */}
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
          )}
          {group.hasDuePayment && (
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: 'var(--color-warning)' }}
              aria-label="Payment due"
            />
          )}
          <span className="truncate font-heading text-[0.95rem] font-medium text-[var(--text-primary)]">
            {group.vendorName}
          </span>
          <PaymentTermsPill terms={group.defaultPaymentTerms} />
        </button>

        <div className="flex flex-shrink-0 items-center gap-4">
          <div className="flex flex-col items-end leading-tight">
            <span className="font-heading text-[0.95rem] font-semibold text-[var(--text-primary)]">
              {formatDollars(group.totalCents)}
            </span>
            <span className="type-meta-small text-[var(--text-muted)]">
              {group.itemCount} order{group.itemCount !== 1 ? 's' : ''}
              {' · '}
              {projectCount} project{projectCount !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onCtaClick}
            className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
            disabled={!onCtaClick}
          >
            {ctaLabel}
          </button>
        </div>
      </header>

      {/* PO rows */}
      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          {group.orders.map((po) => (
            <div
              key={po.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {/* Left: project + PO number + status + ETA */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[0.82rem] font-medium text-[var(--text-primary)]">
                    {po.project?.name ?? 'Unknown project'}
                  </span>
                  {po.vendor_po_number && (
                    <span className="font-mono text-[0.6rem] text-[var(--text-muted)]">
                      {po.vendor_po_number}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <PoStatusLabel status={po.status} />
                  {po.confirmed_eta && (
                    <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
                      ETA {formatDate(po.confirmed_eta)}
                    </span>
                  )}
                </div>
              </div>

              {/* Right: payment pills + total */}
              <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                <span className="font-heading text-[0.85rem] font-semibold text-[var(--text-primary)]">
                  {formatDollars(po.total_cents)}
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  {po.is_patina_catalog ? (
                    <PatinaHandledPill />
                  ) : (
                    (po.payments ?? [])
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((payment) => (
                        <PaymentPill key={payment.id} payment={payment} />
                      ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
