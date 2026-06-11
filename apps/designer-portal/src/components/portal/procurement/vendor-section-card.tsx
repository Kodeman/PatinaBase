'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { POPayment, PurchaseOrder } from '@patina/supabase';
import { PaymentPill } from './payment-pill';
import { LogAcknowledgmentPopover } from './log-acknowledgment-popover';
import { Button } from '@/components/ui/controls';

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
  /**
   * True when this vendor is part of the Patina Catalog
   * (vendors.is_patina_catalog = true). Drives the gold "Order via Patina"
   * CTA in the card header (PRD slide §5). Derived by groupByVendor from
   * the joined `vendor.is_patina_catalog` column.
   */
  isPatinaCatalog: boolean;
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

function poPaymentToPillProps(payment: POPayment) {
  const kind =
    payment.kind === 'deposit'
      ? 'Deposit'
      : payment.kind === 'balance'
        ? 'Balance'
        : (payment.label ?? 'Milestone');
  return {
    state: payment.state,
    kind,
    amount: payment.amount_cents,
    dueDate: payment.state === 'paid' ? payment.paid_date : payment.due_date,
  };
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
   * Ignored for Patina Catalog vendors — those always render the gold
   * "Order via Patina" CTA via `onOrderViaPatina` instead (PRD §5).
   */
  ctaLabel?: string;
  onCtaClick?: () => void;
  /**
   * Click handler for the gold "Order via Patina" CTA. Only rendered when
   * `group.isPatinaCatalog === true`. When provided, replaces the standard
   * neutral CTA — Catalog vendors only see the one-click Patina-handled flow.
   */
  onOrderViaPatina?: () => void;
  /**
   * Click handler for the "Order all N" CTA (non-Catalog vendors). Launches
   * the Order Assistant fed with the vendor's approved, unordered FF&E items
   * (W3-T3a). When `undefined` AND `orderAllDisabledReason` is supplied, the
   * button renders disabled with the reason as its tooltip; when both are
   * `undefined` the button is not rendered.
   */
  onOrderAllClick?: () => void;
  /** Label for the "Order all N" CTA (e.g. "Order all 3"). */
  orderAllLabel?: string;
  /**
   * Tooltip shown on the disabled "Order all" CTA when the vendor has no
   * orderable items (e.g. "No approved, unordered items for this vendor.").
   */
  orderAllDisabledReason?: string;
}

export function VendorSectionCard({
  group,
  ctaLabel = 'View orders',
  onCtaClick,
  onOrderViaPatina,
  onOrderAllClick,
  orderAllLabel,
  orderAllDisabledReason,
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
          {group.isPatinaCatalog ? (
            // PRD §5 line 470 — Catalog vendor pill replaces the
            // per-vendor payment-terms pill. Same clay tint, "Patina Catalog"
            // label — signals that this vendor's payments are handled by
            // Patina internally.
            <span
              className="inline-flex items-center rounded-[3px] px-2 py-0.5"
              style={{
                backgroundColor: 'rgba(196, 165, 123, 0.15)',
                color: 'var(--color-clay)',
                fontFamily: 'var(--font-meta)',
                fontSize: '0.58rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
              }}
            >
              Patina Catalog
            </span>
          ) : (
            <PaymentTermsPill terms={group.defaultPaymentTerms} />
          )}
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
          {group.isPatinaCatalog ? (
            // PRD §5 — Catalog vendors get the gold/champagne pill-shaped CTA.
            // Matches .btn-c (background:var(--cl);color:white) from the PRD
            // mock, executed via the --color-clay design token.
            //
            // v1 scope: the underlying Catalog ordering flow is not yet wired
            // (the "ready items" feed lands in a follow-up wave). We keep the
            // gold styling for visual continuity with the PRD mock but render
            // the button as disabled with an explanatory tooltip when no
            // handler is supplied. This avoids opening an OrderViaPatina
            // dialog that would show "Order 0 items totalling $0" with a
            // disabled Confirm button (dead UI).
            <Button
              variant="primary"
              size="sm"
              onClick={onOrderViaPatina}
              disabled={!onOrderViaPatina}
              title={
                !onOrderViaPatina
                  ? 'Catalog ordering ships in a follow-up — see workspace for status.'
                  : undefined
              }
              aria-label={
                !onOrderViaPatina
                  ? 'Order via Patina (Catalog ordering ships in a follow-up — see workspace for status.)'
                  : undefined
              }
            >
              Order via Patina
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              {(onOrderAllClick || orderAllDisabledReason) && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onOrderAllClick}
                  disabled={!onOrderAllClick}
                  title={!onOrderAllClick ? orderAllDisabledReason : undefined}
                  aria-label={
                    !onOrderAllClick && orderAllDisabledReason
                      ? `Order all (${orderAllDisabledReason})`
                      : undefined
                  }
                >
                  {orderAllLabel ?? 'Order all'}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={onCtaClick}
                disabled={!onCtaClick}
              >
                {ctaLabel}
              </Button>
            </div>
          )}
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
                  {/* Vendor acknowledgment (W3-T3a): draft POs get the
                      log-acknowledgment popover; acknowledged POs show a
                      muted "Ack {date}" meta instead. POs advanced past
                      draft without an acknowledgment show neither. */}
                  {po.acknowledged_at ? (
                    <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
                      Ack {formatDate(po.acknowledged_at)}
                    </span>
                  ) : po.status === 'draft' ? (
                    <LogAcknowledgmentPopover
                      purchaseOrderId={po.id}
                      vendorPoNumber={po.vendor_po_number}
                      confirmedEta={po.confirmed_eta}
                    />
                  ) : null}
                </div>
              </div>

              {/* Right: payment pills + total */}
              <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                <span className="font-heading text-[0.85rem] font-semibold text-[var(--text-primary)]">
                  {formatDollars(po.total_cents)}
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  {po.is_patina_catalog ? (
                    <PaymentPill state="patina_handled" />
                  ) : (
                    (po.payments ?? [])
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((payment) => (
                        <PaymentPill key={payment.id} {...poPaymentToPillProps(payment)} />
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
