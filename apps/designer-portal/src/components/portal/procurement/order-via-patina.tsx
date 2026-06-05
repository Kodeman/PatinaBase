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
import { procurementEvents } from '@/lib/analytics/procurement-events';
import {
  BlockedByDecisionInline,
  getBlockedItems,
} from '@/components/portal/procurement/blocked-by-decision-notice';
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

  const totalCents = useMemo(
    () => ffeItems.reduce((sum, item) => sum + (item.line_total_cents ?? 0), 0),
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
          procurementEvents.poCreated({
            payment_pattern: 'full_upfront',
            total_cents: totalCents,
            is_patina_catalog: true,
            vendor_id: vendor.id,
            project_id: project.id,
          });
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
          {/* Integrity gate (PT-D-2-T3-1): refuse the order when any item is
              held by a pending decision; the Confirm button is disabled too. */}
          {hasBlockedItems && (
            <BlockedByDecisionInline
              blockedItems={blockedItems}
              projectId={project.id}
              className="mt-3"
            />
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
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
              : 'Confirm order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrderViaPatina;
