'use client';

/**
 * Log-acknowledgment popover (W3-T3a).
 *
 * Small anchored popover (faceted-filter-popover idiom — relative container,
 * mousedown-outside close; deliberately NOT a drawer) that records the
 * vendor's confirmation of a purchase order via the `log_po_acknowledgment`
 * RPC (00186). The acknowledged date is stamped server-side (NOW(), idempotent)
 * — the popover only collects the two optional coalesce-updated fields:
 *
 *   - Vendor PO #   (prefilled from the row; blank preserves the stored value)
 *   - Confirmed ETA (date; blank preserves the stored value)
 *
 * On success the RPC also advances a draft PO to confirmed; any later
 * non-cancelled status keeps its status (00190 — acknowledging late never
 * moves the lifecycle). The hook's invalidations refresh the By Vendor and
 * By Status caches.
 */

import { useEffect, useRef, useState } from 'react';
import { useLogPOAcknowledgment } from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { Button } from '@/components/ui/controls';

export interface LogAcknowledgmentPopoverProps {
  purchaseOrderId: string;
  /** Current vendor PO number — prefills the input. */
  vendorPoNumber?: string | null;
  /** Current confirmed ETA (ISO date) — prefills the date input. */
  confirmedEta?: string | null;
}

export function LogAcknowledgmentPopover({
  purchaseOrderId,
  vendorPoNumber,
  confirmedEta,
}: LogAcknowledgmentPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [poNumberInput, setPoNumberInput] = useState(vendorPoNumber ?? '');
  const [etaInput, setEtaInput] = useState(confirmedEta ? confirmedEta.slice(0, 10) : '');
  const logAck = useLogPOAcknowledgment();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Re-seed from the row on every open so a stale draft from a previous open
  // never leaks into a fresh acknowledgment.
  useEffect(() => {
    if (!open) return;
    setPoNumberInput(vendorPoNumber ?? '');
    setEtaInput(confirmedEta ? confirmedEta.slice(0, 10) : '');
  }, [open, vendorPoNumber, confirmedEta]);

  const handleConfirm = async () => {
    try {
      await logAck.mutateAsync({
        purchaseOrderId,
        // undefined preserves the stored value (the RPC coalesces NULL inputs).
        vendorPoNumber: poNumberInput.trim() || undefined,
        confirmedEta: etaInput || undefined,
      });
      // sent_at doesn't exist on purchase_orders until Wave 4 — pass null so
      // the dashboard's days-to-ack metric stays honest about missing data.
      procurementEvents.poAcknowledgmentLogged({ days_since_sent: null });
      // Status-agnostic on purpose: only a draft PO advances to confirmed —
      // a late ack on an in-flight PO keeps its status (00190).
      toast('Acknowledgment logged.', 'success');
      setOpen(false);
    } catch {
      /* global mutation error toast already fired */
    }
  };

  const todayLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="relative inline-flex" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="font-mono text-[0.58rem] uppercase tracking-[0.05em] text-[var(--color-clay,#C4A57B)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:decoration-solid"
      >
        Log acknowledgment
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Log vendor acknowledgment"
          className="absolute left-0 top-full z-30 mt-2 w-[280px] rounded-md border bg-[var(--bg-surface)] p-4"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="type-label">Log acknowledgment</span>
            <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
              Ack date: {todayLabel}
            </span>
          </div>
          <p className="mb-3 text-[0.68rem] leading-snug text-[var(--text-muted)]">
            Stamped automatically as of now. PO # and ETA are optional — blank
            keeps the values already on file.
          </p>

          <label className="mb-2 block">
            <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
              Vendor PO #
            </span>
            <input
              type="text"
              value={poNumberInput}
              onChange={(e) => setPoNumberInput(e.target.value)}
              placeholder="NA-2026-..."
              className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </label>
          <label className="mb-3 block">
            <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
              Confirmed ETA
            </span>
            <input
              type="date"
              value={etaInput}
              onChange={(e) => setEtaInput(e.target.value)}
              className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </label>

          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleConfirm()}
              disabled={logAck.isPending}
              loading={logAck.isPending}
            >
              Confirm acknowledgment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
