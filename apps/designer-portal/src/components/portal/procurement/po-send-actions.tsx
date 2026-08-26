'use client';

/**
 * PO send actions (Wave 4, W4-T4) — the three outbound-document actions for a
 * purchase order, shared between the Order Assistant's created step and the
 * By Vendor row popover (`PoSendPopover` below):
 *
 *   Preview PDF           — mode 'preview': number + render + store the PDF,
 *                           open the signed URL in a new tab. No email, no
 *                           sent_at — always available, even on legacy POs.
 *   Email to {recipient}  — mode 'send': email the vendor with the PDF
 *                           attached; stamps sent_at on first send. Disabled
 *                           (with tooltip) when no vendor email is known
 *                           client-side — resolution is authoritative
 *                           server-side (orders_email → contact_info email);
 *                           the hint here only drives the disabled state and
 *                           the button label.
 *   Mark as sent manually — mode 'mark_sent': render + store + stamp sent_at
 *                           without emailing — for orders placed through
 *                           vendor portals / phone / showroom.
 *
 * Once sent (prop `sentAt` or a successful send in this mount), the email +
 * manual actions collapse into a muted "Sent {date}" line; Preview stays
 * available (mirrors the server, which always allows preview).
 *
 * TODO(W4 follow-up): useSendPurchaseOrder supports an optional personal
 * `message` rendered into the vendor email — v1 deliberately ships without
 * the textarea to keep the step minimal.
 */

import { useEffect, useRef, useState } from 'react';
import {
  useSendPurchaseOrder,
  type PurchaseOrderSendMode,
} from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { Button } from '@/components/ui/controls';

// ─── Pure helpers (exported for unit tests) ─────────────────────────────────

/**
 * Client-side best guess of the vendor recipient — mirrors the po-send edge
 * function's fallback chain (orders_email → contact_info->>'email') minus the
 * explicit override. Drives ONLY the disabled-state heuristic + label hint;
 * the server resolves the real recipient.
 */
export function clientVendorEmailHint(
  vendor:
    | {
        orders_email?: string | null;
        contact_info?: Record<string, unknown> | null;
      }
    | null
    | undefined,
): string | null {
  const orders = vendor?.orders_email?.trim();
  if (orders) return orders;
  const contact = vendor?.contact_info?.email;
  if (typeof contact === 'string' && contact.trim()) return contact.trim();
  return null;
}

/**
 * The 422 po_out_of_sync detail, VERBATIM from the po-send edge function
 * (PO_OUT_OF_SYNC_DETAIL in supabase/functions/po-send/lib.ts — the hook
 * rejects with the error CODE, so the human copy is duplicated here; a deno
 * test pins the server string, keep them in lockstep).
 */
export const PO_OUT_OF_SYNC_MESSAGE =
  "This PO's payment schedule no longer matches its item pricing — item prices " +
  'may have changed since creation, or the PO predates trade-cost totals. ' +
  'Recreate the PO or mark it sent manually.';

/**
 * Map a po-send failure (the hook rejects with the response's `error` code)
 * to designer-readable copy. Unknown codes fall through with the raw text so
 * infra failures stay debuggable.
 */
export function poSendErrorMessage(raw: string): string {
  if (raw.includes('po_out_of_sync')) {
    return PO_OUT_OF_SYNC_MESSAGE;
  }
  if (raw.includes('no_recipient')) {
    return 'No vendor email on file — add an orders email to this vendor and try again.';
  }
  if (raw.includes('po_cancelled')) {
    return 'A cancelled purchase order cannot be sent.';
  }
  if (raw.includes('no_items')) {
    return 'This purchase order has no linked FF&E items to print.';
  }
  return `Couldn't prepare the PO document — ${raw}`;
}

/** Short "Jun 11" label matching the By Vendor row meta date format. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ─── PoSendActions ───────────────────────────────────────────────────────────

export interface PoSendActionsProps {
  purchaseOrderId: string;
  /** For the procurement_po_sent analytics event. */
  vendorId?: string;
  /** Resolved client-side recipient hint (see clientVendorEmailHint). */
  vendorEmailHint: string | null;
  /** ISO sent_at when the PO was already sent — renders the muted state. */
  sentAt?: string | null;
  /**
   * Fires after a successful send / mark_sent with the ISO timestamp that was
   * stamped locally. The popover uses this to close itself and bubble the
   * timestamp up so the parent row can flip to "Sent" immediately.
   */
  onSent?: (sentAtIso: string) => void;
}

export function PoSendActions({
  purchaseOrderId,
  vendorId,
  vendorEmailHint,
  sentAt,
  onSent,
}: PoSendActionsProps) {
  const sendPo = useSendPurchaseOrder();
  const { toast } = useToast();
  const [pendingMode, setPendingMode] = useState<PurchaseOrderSendMode | null>(null);
  // Stamped locally on a successful send/mark_sent so surfaces holding a
  // stale row (the assistant's createdPo) flip to "Sent" immediately; list
  // rows re-render from the invalidated purchase-orders cache instead.
  const [localSentAt, setLocalSentAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Non-blocking caution from a successful preview (the server flags an
  // out-of-sync PO via `warnings` instead of refusing the look).
  const [notice, setNotice] = useState<string | null>(null);

  const effectiveSentAt = sentAt ?? localSentAt;
  const busy = sendPo.isPending;

  const run = async (mode: PurchaseOrderSendMode) => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setPendingMode(mode);
    try {
      const result = await sendPo.mutateAsync({ purchaseOrderId, mode });
      if (mode === 'preview') {
        procurementEvents.poSent({ method: 'preview', vendor_id: vendorId });
        if (result.warnings?.includes('po_out_of_sync')) {
          setNotice(PO_OUT_OF_SYNC_MESSAGE);
        }
        if (result.signedUrl) {
          window.open(result.signedUrl, '_blank', 'noopener,noreferrer');
        } else {
          // Render + upload succeeded but signing failed (server warns) —
          // rare; tell the designer instead of silently doing nothing.
          setError('PDF stored, but the preview link could not be created — try again.');
        }
      } else if (mode === 'send') {
        procurementEvents.poSent({ method: 'email', vendor_id: vendorId });
        const sentAt = new Date().toISOString();
        setLocalSentAt(sentAt);
        toast(`PO ${result.poNumber} sent to ${result.recipient}`, 'success');
        onSent?.(sentAt);
      } else {
        procurementEvents.poSent({ method: 'manual', vendor_id: vendorId });
        const sentAt = new Date().toISOString();
        setLocalSentAt(sentAt);
        toast(`PO ${result.poNumber} marked as sent.`, 'success');
        onSent?.(sentAt);
      }
    } catch (e) {
      setError(poSendErrorMessage((e as Error)?.message ?? 'unknown error'));
    } finally {
      setPendingMode(null);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void run('preview')}
        disabled={busy}
        loading={pendingMode === 'preview'}
      >
        Preview PDF
      </Button>

      {effectiveSentAt ? (
        <span className="px-1 py-1 text-center font-mono text-[0.62rem] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          Sent {shortDate(effectiveSentAt)}
        </span>
      ) : (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void run('send')}
            disabled={busy || !vendorEmailHint}
            loading={pendingMode === 'send'}
            title={!vendorEmailHint ? 'No vendor email on file' : undefined}
            aria-label={
              !vendorEmailHint
                ? 'Email to vendor (No vendor email on file)'
                : undefined
            }
          >
            <span className="max-w-[230px] truncate">
              {vendorEmailHint ? `Email to ${vendorEmailHint}` : 'Email to vendor'}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void run('mark_sent')}
            disabled={busy}
            loading={pendingMode === 'mark_sent'}
            title="For orders placed through a vendor portal, phone, or showroom — stamps the sent date without emailing."
          >
            Mark as sent manually
          </Button>
        </>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-[3px] border px-2.5 py-1.5 text-[0.68rem] leading-snug"
          style={{
            borderColor: 'var(--color-terracotta,#D4A090)',
            background: 'rgba(212,160,144,0.08)',
            color: 'var(--text-primary)',
          }}
        >
          {error}
        </div>
      )}

      {!error && notice && (
        <div
          role="status"
          className="rounded-[3px] border px-2.5 py-1.5 text-[0.68rem] leading-snug"
          style={{
            borderColor: 'var(--border-default)',
            color: 'var(--text-muted)',
          }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}

// ─── PoSendPopover (By Vendor row idiom) ─────────────────────────────────────

export interface PoSendPopoverProps {
  purchaseOrderId: string;
  vendorId?: string;
  vendorEmailHint: string | null;
  /**
   * Fires after a successful send or mark_sent with the ISO timestamp that was
   * stamped. Lets the parent row flip to "Sent {date}" immediately without
   * waiting for the invalidated purchase-orders cache refetch to land.
   */
  onSent?: (sentAtIso: string) => void;
}

/**
 * Small anchored popover (log-acknowledgment-popover idiom — relative
 * container, mousedown-outside close, flat border, NO shadow) wrapping
 * PoSendActions for unsent PO rows on the By Vendor cards. Rows with
 * sent_at never render this — vendor-section-card shows the muted
 * "Sent {date}" meta instead.
 */
export function PoSendPopover({
  purchaseOrderId,
  vendorId,
  vendorEmailHint,
  onSent,
}: PoSendPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="font-mono text-[0.58rem] uppercase tracking-[0.05em] text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:decoration-solid"
      >
        Send to vendor
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Send purchase order to vendor"
          className="absolute left-0 top-full z-30 mt-2 w-[280px] rounded-md border bg-[var(--bg-surface)] p-4"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="type-label">Send to vendor</span>
          </div>
          <p className="mb-3 text-[0.68rem] leading-snug text-[var(--text-muted)]">
            Preview assigns the PO number and renders the document; emailing
            or marking sent stamps the sent date.
          </p>
          <PoSendActions
            purchaseOrderId={purchaseOrderId}
            vendorId={vendorId}
            vendorEmailHint={vendorEmailHint}
            onSent={(sentAtIso) => {
              setOpen(false);
              onSent?.(sentAtIso);
            }}
          />
        </div>
      )}
    </div>
  );
}
