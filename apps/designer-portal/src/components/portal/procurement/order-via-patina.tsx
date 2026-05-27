'use client';

/**
 * OrderViaPatina — one-click Patina Catalog order confirmation.
 *
 * For Patina Catalog vendors (vendors.is_patina_catalog = true), Patina is the
 * merchant: it handles deposit + balance internally. The designer never logs
 * payments or visits an external vendor portal. The value of the Catalog
 * concept is the one-click experience — this dialog is intentionally minimal:
 *
 *   - Title         "Order via Patina"
 *   - Body          "Order N items totalling $X.XX from <vendor> via Patina?
 *                    Patina handles deposit and balance internally — you won't
 *                    see payment pills for these items."
 *   - Footer        secondary "Cancel" / primary "Confirm order"
 *
 * On confirm we call useCreatePurchaseOrder with `isPatinaCatalog: true`. The
 * payment pattern is set to `full_upfront` to satisfy the NOT NULL constraint
 * on purchase_orders.payment_pattern — `is_patina_catalog = true` overrides
 * the visual treatment downstream (PaymentPill renders "Patina handled" instead
 * of pattern-specific pills).
 *
 * NOT in scope (per the W1.4 IE2 lane):
 *   - Multi-step OrderAssistant (owned by IE1 for external vendors)
 *   - Stripe / Patina-side fulfillment plumbing (eventual orders-service work)
 */

import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import { useCreatePurchaseOrder } from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface OrderViaPatinaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: { id: string; name: string };
  project: { id: string; name: string };
  ffeItems: Array<{ id: string; name: string; line_total_cents: number }>;
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

  const totalCents = useMemo(
    () => ffeItems.reduce((sum, item) => sum + (item.line_total_cents ?? 0), 0),
    [ffeItems],
  );
  const itemCount = ffeItems.length;

  const handleConfirm = () => {
    if (itemCount === 0) {
      toast('No items to order.', 'warning');
      return;
    }

    createPO.mutate(
      {
        projectId: project.id,
        vendorId: vendor.id,
        // payment_pattern is NOT NULL on the table. Catalog POs are handled by
        // Patina internally — `full_upfront` is the most accurate single-row
        // payment shape ("Patina charges once on our side") and the
        // is_patina_catalog flag overrides the UI treatment anyway.
        paymentPattern: 'full_upfront',
        totalCents,
        ffeItemIds: ffeItems.map((i) => i.id),
        isPatinaCatalog: true,
      },
      {
        onSuccess: () => {
          toast(
            `Ordered ${itemCount} item${itemCount === 1 ? '' : 's'} via Patina. We'll handle the deposit and balance.`,
            'success',
          );
          onOpenChange(false);
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

  const isSubmitting = createPO.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order via Patina</DialogTitle>
          <DialogDescription className="pt-2">
            Order {itemCount} item{itemCount === 1 ? '' : 's'} totalling{' '}
            <strong className="font-medium text-[var(--text-primary)]">
              {formatDollars(totalCents)}
            </strong>{' '}
            from{' '}
            <strong className="font-medium text-[var(--text-primary)]">
              {vendor.name}
            </strong>{' '}
            via Patina? Patina handles deposit and balance internally — you
            won&rsquo;t see payment pills for these items.
          </DialogDescription>
          {itemCount > 0 && (
            <p
              className="pt-3 text-[0.7rem] text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-meta)' }}
            >
              Project: {project.name}
            </p>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || itemCount === 0}
            className="rounded-[3px] px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-clay)' }}
          >
            {isSubmitting ? 'Placing order…' : 'Confirm order'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrderViaPatina;
