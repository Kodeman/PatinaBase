'use client';

/**
 * OrderViaPatina — one-click Patina Catalog order confirmation.
 *
 * For Patina Catalog vendors (vendors.is_patina_catalog = true), Patina is
 * the merchant of record — the designer pays Patina directly, at order time,
 * via Stripe hosted Checkout (Phase 4). This is NOT "Patina handles deposit
 * and balance internally with no payment surface" — that copy described an
 * earlier, unbuilt plan. The real flow:
 *
 *   - Title         "Order via Patina"
 *   - Body          "Order N items totalling $X.XX from <vendor> via Patina?
 *                    You'll pay Patina now to place the order."
 *   - Footer        secondary "Cancel" / primary "Confirm & pay"
 *
 * On confirm we call useCreatePurchaseOrder with `isPatinaCatalog: true` and
 * `paymentPattern: 'full_upfront'` (satisfies the NOT NULL constraint on
 * purchase_orders.payment_pattern; the create_purchase_order RPC — migration
 * 00186 — inserts exactly ONE po_payments row for that pattern). The RPC
 * returns only the purchase_orders header (no nested payments), so on
 * success we resolve that single payment row via fetchPOPayments, then call
 * useStartPoCheckout to open Stripe Checkout and redirect
 * (window.location.href = url). The PO already exists at this point and is
 * NEVER rolled back if checkout-start fails — the designer can always finish
 * payment later from the by-vendor page's "Pay now" affordance, so a
 * checkout-start failure surfaces as an inline, recoverable message instead
 * of an error toast.
 *
 * NOT in scope (per the W1.4 IE2 lane):
 *   - Multi-step OrderAssistant (owned by IE1 for external vendors)
 */

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import { useCreatePurchaseOrder, useStartPoCheckout, fetchPOPayments } from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import {
  BlockedByDecisionInline,
  getBlockedItems,
} from '@/components/portal/procurement/blocked-by-decision-notice';
import { itemTradeCents } from '@/components/portal/procurement/order-assistant';
import { Button } from '@/components/ui/controls';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface OrderViaPatinaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: { id: string; name: string };
  project: { id: string; name: string };
  ffeItems: Array<{
    id: string;
    name: string;
    line_total_cents: number;
    // Dual-pricing fields (00185/00186) — the displayed total is the vendor
    // TRADE total (COALESCE(trade, unit) × qty via itemTradeCents), matching
    // the total the create_purchase_order RPC stores server-side. Items
    // without either unit price fall back to line_total_cents.
    quantity?: number;
    unit_price_cents?: number | null;
    trade_price_cents?: number | null;
    // Decision-Framework integrity fields (PT-D-2-T3-1). Optional — callers
    // without blocking context leave them undefined.
    blocked?: boolean | null;
    blocked_by_decision_id?: string | null;
    blocked_reason?: string | null;
  }>;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  // Two decimals when there are any cents, otherwise no decimals — matches
  // the rest of the procurement workspace formatting.
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OrderViaPatina({
  open,
  onOpenChange,
  vendor,
  project,
  ffeItems,
}: OrderViaPatinaProps) {
  const { toast } = useToast();
  const createPO = useCreatePurchaseOrder();
  // Checkout-start failures must NOT roll back the already-created PO and
  // must NOT use the global mutation-error toast — they render inline in
  // this dialog instead (requirement: "show an inline error stating the
  // order was created and payment can be completed from the procurement
  // page"). See useStartPoCheckout's R83 errorSurface doc.
  const startCheckout = useStartPoCheckout({ errorSurface: 'inline' });

  // Set once the PO is created and we're resolving its po_payment id /
  // starting Checkout. While true the dialog stays open (even though the
  // order already exists) showing a "redirecting" state instead of the
  // normal Confirm/Cancel footer.
  const [isRedirecting, setIsRedirecting] = useState(false);
  // Set only if checkout-start fails after the PO was successfully created —
  // the recoverable, inline-error state described above.
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Vendor TRADE total — Σ COALESCE(trade, unit) × qty (00186), the same
  // computation as the Order Assistant and the server-stored PO total. The
  // old client-price sum here disagreed with the stored total whenever trade
  // and client prices diverged.
  const totalCents = useMemo(
    () => ffeItems.reduce((sum, item) => sum + itemTradeCents(item), 0),
    [ffeItems],
  );
  const itemCount = ffeItems.length;

  // Decision-Framework integrity gate (PT-D-2-T3-1).
  const blockedItems = useMemo(() => getBlockedItems(ffeItems), [ffeItems]);
  const hasBlockedItems = blockedItems.length > 0;

  const handleConfirm = () => {
    if (itemCount === 0) {
      toast('No items to order.', 'warning');
      return;
    }

    if (hasBlockedItems) {
      procurementEvents.orderBlocked({
        blocked_item_count: blockedItems.length,
        vendor_id: vendor.id,
        project_id: project.id,
        is_patina_catalog: true,
      });
      toast(
        `${blockedItems.length} item${blockedItems.length === 1 ? ' is' : 's are'} blocked pending a client decision. Resolve the decision before ordering.`,
        'warning',
      );
      return;
    }

    setCheckoutError(null);

    createPO.mutate(
      {
        projectId: project.id,
        vendorId: vendor.id,
        // payment_pattern is NOT NULL on the table. `full_upfront` is the
        // pattern the create_purchase_order RPC (00186) maps to a single
        // po_payments row for the full trade total — the one row Stripe
        // Checkout collects below. is_patina_catalog drives everything else
        // (PaymentPill / Pay-now treatment downstream).
        // total_cents is server-computed by the create_purchase_order RPC
        // (00186) as the vendor TRADE total over the linked items.
        paymentPattern: 'full_upfront',
        ffeItemIds: ffeItems.map((i) => i.id),
        isPatinaCatalog: true,
      },
      {
        onSuccess: async (po) => {
          procurementEvents.poCreated({
            payment_pattern: 'full_upfront',
            // Server-computed TRADE total (00186) — authoritative.
            total_cents: po.total_cents,
            is_patina_catalog: true,
            vendor_id: vendor.id,
            project_id: project.id,
          });
          toast(
            `Ordered ${itemCount} item${itemCount === 1 ? '' : 's'} via Patina — redirecting you to payment…`,
            'success',
          );

          // The PO now exists — from here on we never roll it back. Resolve
          // its single full_upfront po_payment row (the RPC returns only the
          // purchase_orders header, no nested payments) and hand off to
          // Stripe hosted Checkout.
          setIsRedirecting(true);
          try {
            const payments = await fetchPOPayments(po.id);
            const payment = payments[0];
            if (!payment) {
              throw new Error('No payment record was found for this order.');
            }
            const { url } = await startCheckout.mutateAsync({ poPaymentId: payment.id });
            window.location.href = url;
            // Intentionally no further state updates past this point — the
            // browser is navigating away to Stripe.
          } catch (err) {
            setIsRedirecting(false);
            setCheckoutError(
              err instanceof Error
                ? err.message
                : "Payment couldn't be started.",
            );
          }
        },
        onError: (err: Error) => {
          toast(
            err.message
              ? `Couldn't place order via Patina: ${err.message}`
              : "Couldn't place order via Patina. Please try again.",
            'error',
          );
        },
      },
    );
  };

  const isSubmitting = createPO.isPending || isRedirecting;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Block the close-on-outside-click / Escape paths for the whole
        // submitting window — while the create mutation is in flight AND while
        // we're mid redirect (PO created, Checkout about to open). Dismissing
        // here would either drop the dialog mid-request or flash it away right
        // before the Stripe navigation, not perform an actual cancel.
        if (isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order via Patina</DialogTitle>
          {checkoutError ? (
            <DialogDescription className="pt-2">
              Order placed — {checkoutError} You can complete payment any
              time from the Procurement workspace: open this vendor&rsquo;s
              orders and use &ldquo;Pay now&rdquo; on this purchase order.
            </DialogDescription>
          ) : (
            <DialogDescription className="pt-2">
              Order {itemCount} item{itemCount === 1 ? '' : 's'} totalling{' '}
              <strong className="font-medium text-[var(--text-primary)]">
                {formatDollars(totalCents)}
              </strong>{' '}
              from{' '}
              <strong className="font-medium text-[var(--text-primary)]">
                {vendor.name}
              </strong>{' '}
              via Patina? You&rsquo;ll pay Patina now, via Stripe, to place
              the order.
            </DialogDescription>
          )}
          {itemCount > 0 && !checkoutError && (
            <p
              className="pt-3 text-[0.7rem] text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-meta)' }}
            >
              Project: {project.name}
            </p>
          )}
          {/* Integrity gate (PT-D-2-T3-1): refuse the order when any item is
              held by a pending decision; the Confirm button is disabled too. */}
          {hasBlockedItems && !checkoutError && (
            <BlockedByDecisionInline
              blockedItems={blockedItems}
              projectId={project.id}
              className="mt-3"
            />
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          {checkoutError ? (
            <Button variant="primary" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={isSubmitting || itemCount === 0 || hasBlockedItems}
                loading={isSubmitting}
                title={
                  hasBlockedItems
                    ? 'Ordering is blocked pending a client decision'
                    : undefined
                }
              >
                {hasBlockedItems
                  ? 'Blocked — decision pending'
                  : isRedirecting
                    ? 'Redirecting to payment…'
                    : 'Confirm & pay'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrderViaPatina;
