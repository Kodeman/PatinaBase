'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { POPayment, PurchaseOrder } from '@patina/supabase';
import { useStartPoCheckout } from '@patina/supabase';
import { PaymentPill } from './payment-pill';
import { LogAcknowledgmentPopover } from './log-acknowledgment-popover';
import { PoSendPopover, clientVendorEmailHint } from './po-send-actions';
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
    // A refund keeps `paid_date` (migration 00277) rather than stamping a
    // separate refunded_at — surface that date, not the (likely stale/null)
    // due_date, so the pill's long form reads "Deposit $500 refunded Apr 8".
    dueDate:
      payment.state === 'paid' || payment.state === 'refunded'
        ? payment.paid_date
        : payment.due_date,
  };
}

// ─── Pay-now visibility (Phase 4 — designer pays at order time) ───────────

/**
 * The po_payment row a "Pay now" affordance should target for this PO, or
 * `null` when none should render. Exported as a pure predicate (no React,
 * no hooks) so the visibility rule has its own unit test without needing a
 * component-rendering harness:
 *
 *   - vendor must be Patina Catalog (non-catalog POs are paid directly with
 *     the vendor — Patina never handles that money);
 *   - PO must not be cancelled (nothing left to pay for);
 *   - at least one po_payment row must be unpaid (`pending` or `due`) with a
 *     positive amount — mirrors the create-checkout-session edge function's
 *     own guard (state !== 'paid' && amount_cents > 0), so "Pay now" is never
 *     shown for a payment the edge function would 409 on.
 *
 * full_upfront (the only pattern OrderViaPatina creates) produces exactly
 * one po_payments row, but the predicate doesn't assume that — it picks the
 * lowest sort_order unpaid row so it degrades sensibly if a catalog PO ever
 * carries a split pattern.
 */
export function payNowPayment(
  po: Pick<PurchaseOrder, 'is_patina_catalog' | 'payments' | 'status'>,
): POPayment | null {
  if (!po.is_patina_catalog) return null;
  if (po.status === 'cancelled') return null;
  const payable = (po.payments ?? [])
    .filter((p) => (p.state === 'pending' || p.state === 'due') && p.amount_cents > 0)
    .sort((a, b) => a.sort_order - b.sort_order);
  return payable[0] ?? null;
}

/**
 * Persistent "Pay now" CTA for an unpaid Patina-catalog PO (Phase 4). Fires
 * useStartPoCheckout and redirects to Stripe hosted Checkout on success; a
 * failure surfaces via the global mutation-error toast (no options passed to
 * useStartPoCheckout — same default as PoSendPopover/LogAcknowledgmentPopover
 * in this file), since this is a plain retryable action, not a flow that
 * needs to explain a just-completed side effect the way OrderViaPatina does.
 */
function PayNowButton({
  poPaymentId,
  amountCents,
}: {
  poPaymentId: string;
  amountCents: number;
}) {
  const startCheckout = useStartPoCheckout();

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={() =>
        startCheckout.mutate(
          { poPaymentId },
          {
            onSuccess: ({ url }) => {
              window.location.href = url;
            },
          },
        )
      }
      disabled={startCheckout.isPending}
      loading={startCheckout.isPending}
    >
      Pay now · {formatDollars(amountCents)}
    </Button>
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
  /**
   * PO id to scroll into view and highlight on mount (Phase 4 — the
   * ?po=<id>&checkout=success|cancelled Stripe Checkout return). `undefined`/
   * `null` renders every row unhighlighted.
   */
  highlightPoId?: string | null;
}

export function VendorSectionCard({
  group,
  ctaLabel = 'View orders',
  onCtaClick,
  onOrderViaPatina,
  onOrderAllClick,
  orderAllLabel,
  orderAllDisabledReason,
  highlightPoId,
}: VendorSectionCardProps) {
  const [expanded, setExpanded] = useState(true);
  // Optimistic sent-at stamps: keyed by PO id so the row immediately renders
  // "Sent {date}" after the popover confirms send, without waiting for the
  // ['purchase-orders'] cache invalidation to complete and re-render the list.
  const [localSentByPoId, setLocalSentByPoId] = useState<Record<string, string>>({});

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
            <PoRow
              key={po.id}
              po={po}
              highlighted={!!highlightPoId && po.id === highlightPoId}
              localSentAt={localSentByPoId[po.id]}
              onSent={(sentAtIso) =>
                setLocalSentByPoId((prev) => ({ ...prev, [po.id]: sentAtIso }))
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── PoRow ──────────────────────────────────────────────────────────────────

function PoRow({
  po,
  highlighted,
  localSentAt,
  onSent,
}: {
  po: PurchaseOrder;
  /** True when this row is the target of a ?po=<id> Checkout return
   *  (Phase 4) — scrolls itself into view and renders a temporary tint. */
  highlighted: boolean;
  localSentAt?: string;
  onSent: (sentAtIso: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // The Checkout return lands here pre-addressed — scroll the named row into
  // view, mirroring the Desk's act-addressed scroll (accounts-receivables).
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  const payable = payNowPayment(po);

  return (
    <div
      ref={ref}
      className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 transition-colors last:border-b-0"
      style={{
        borderColor: 'var(--border-subtle)',
        backgroundColor: highlighted ? 'rgba(196,165,123,0.12)' : undefined,
      }}
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
          {/* Vendor acknowledgment (W3-T3a, widened by 00190): any
              unacknowledged, non-cancelled, non-Patina-Catalog PO
              gets the log-acknowledgment popover — a vendor can
              acknowledge late, after the PO has advanced past draft
              (the RPC stamps acknowledged_at without moving the
              status; only draft → confirmed). Acknowledged POs show
              a muted "Ack {date}" meta instead. Patina Catalog
              orders have no vendor-ack loop, and cancelled POs are
              refused server-side. */}
          {po.acknowledged_at ? (
            <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
              Ack {formatDate(po.acknowledged_at)}
            </span>
          ) : !po.is_patina_catalog && po.status !== 'cancelled' ? (
            <LogAcknowledgmentPopover
              purchaseOrderId={po.id}
              vendorPoNumber={po.vendor_po_number}
              confirmedEta={po.confirmed_eta}
            />
          ) : null}
          {/* Outbound PO document (W4-T4): sent POs show a muted
              "Sent {date}" meta; unsent external-vendor POs get the
              send popover (Preview PDF / Email / Mark as sent).
              Patina Catalog orders have no outbound vendor doc, and
              cancelled POs can't be sent (server 409s).
              localSentAt provides an optimistic stamp so the row
              flips to "Sent" immediately after the popover confirms,
              without waiting for the purchase-orders cache refetch. */}
          {po.sent_at ?? localSentAt ? (
            <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
              Sent {formatDate(po.sent_at ?? localSentAt)}
            </span>
          ) : !po.is_patina_catalog && po.status !== 'cancelled' ? (
            <PoSendPopover
              purchaseOrderId={po.id}
              vendorId={po.vendor_id}
              vendorEmailHint={clientVendorEmailHint(po.vendor)}
              onSent={onSent}
            />
          ) : null}
        </div>
      </div>

      {/* Right: payment pills / Pay now + total */}
      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <span className="font-heading text-[0.85rem] font-semibold text-[var(--text-primary)]">
          {formatDollars(po.total_cents)}
        </span>
        <div className="flex flex-wrap justify-end gap-1">
          {po.is_patina_catalog ? (
            payable ? (
              // Phase 4 — designer pays at order time. This is the
              // "PO exists but unpaid" recoverable state: OrderViaPatina's
              // own checkout-start may have failed, or the designer closed
              // Checkout without finishing — either way, the order is real
              // and payment is always one click away from here.
              <PayNowButton poPaymentId={payable.id} amountCents={payable.amount_cents} />
            ) : (po.payments ?? []).length > 0 ? (
              (po.payments ?? [])
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((payment) => (
                  <PaymentPill key={payment.id} {...poPaymentToPillProps(payment)} />
                ))
            ) : (
              // No payment rows at all — shouldn't happen post-00186 (the
              // atomic RPC always inserts at least one), but keep the old
              // static fallback for any pre-existing catalog PO missing rows.
              <PaymentPill state="patina_handled" />
            )
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
  );
}
