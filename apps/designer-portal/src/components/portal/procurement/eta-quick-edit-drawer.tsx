'use client';

/**
 * EtaQuickEditDrawer — right-slide sheet for the Procurement → By Status view.
 *
 * The PRD vision (W2.4 Decision 5 · ETA tracking, "Manual ETA quick-edit UX"):
 *   A vendor emails saying "your shipment is delayed two weeks." The designer
 *   clicks the ETA cell on the PO row in By Status, types or picks a new
 *   date, optionally notes what the vendor told them, hits save — 3 seconds,
 *   done. The conflict-detection helper (CB1 W2.3) and the unified delivery
 *   calendar both feed off purchase_orders.confirmed_eta, so a single
 *   mutation here surfaces everywhere a designer might already be looking.
 *
 * Mirrors the slide-from-right convention used by LogInspectionDrawer
 * (Sprint 2 CB2) and OrderAssistant (Sprint 1) — same animation, header,
 * footer-button row.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useUpdatePurchaseOrderETA } from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EtaQuickEditPurchaseOrder {
  id: string;
  vendor_po_number: string | null;
  confirmed_eta: string | null;
  vendor?: { name: string };
  project?: { name: string };
}

export interface EtaQuickEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: EtaQuickEditPurchaseOrder;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** "May 26, 2026" — same formatter used in the by-status row, kept local. */
function formatDateLong(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EtaQuickEditDrawer(props: EtaQuickEditDrawerProps) {
  const { open, onOpenChange, purchaseOrder } = props;

  // Pre-fill the date input with the current ETA (or empty if none set).
  // `<input type="date">` expects YYYY-MM-DD; `confirmed_eta` is already
  // stored as a date string, so slice off any time component if present.
  const initialDate = purchaseOrder.confirmed_eta
    ? purchaseOrder.confirmed_eta.slice(0, 10)
    : '';

  const [newEta, setNewEta] = useState<string>(initialDate);
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateEta = useUpdatePurchaseOrderETA();
  const { toast } = useToast();

  // Reset the form whenever the drawer opens or the underlying PO changes.
  useEffect(() => {
    if (!open) return;
    setNewEta(
      purchaseOrder.confirmed_eta
        ? purchaseOrder.confirmed_eta.slice(0, 10)
        : '',
    );
    setNotes('');
    setSubmitError(null);
  }, [open, purchaseOrder.id, purchaseOrder.confirmed_eta]);

  const label = purchaseOrder.vendor_po_number
    ? `PO ${purchaseOrder.vendor_po_number}`
    : 'PO';
  const vendorName = purchaseOrder.vendor?.name ?? 'Unknown vendor';
  const projectName = purchaseOrder.project?.name ?? 'Unknown project';

  const canSave =
    newEta.length === 10 &&
    /^\d{4}-\d{2}-\d{2}$/.test(newEta) &&
    !updateEta.isPending;

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!canSave) return;
    try {
      await updateEta.mutateAsync({
        purchaseOrderId: purchaseOrder.id,
        newEta,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      toast(
        `ETA updated for ${label} — now ${formatDateLong(newEta)}.`,
        'success',
      );
      onOpenChange(false);
    } catch (e) {
      setSubmitError((e as Error)?.message ?? 'Failed to update ETA.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => !updateEta.isPending && onOpenChange(false)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Update ETA for ${label}`}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[440px] max-w-[92vw] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4">
              <div className="min-w-0">
                <div className="type-meta-small text-[var(--color-clay,#C4A57B)]">
                  Update ETA
                </div>
                <div className="mt-0.5 truncate font-heading text-[1rem] font-medium text-[var(--text-primary)]">
                  {label}
                </div>
                <div className="type-meta-small text-[var(--text-muted)]">
                  {vendorName} · {projectName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => !updateEta.isPending && onOpenChange(false)}
                disabled={updateEta.isPending}
                className="shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {/* Current ETA */}
              <div className="mb-5">
                <div
                  className="mb-1"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Current ETA
                </div>
                <div className="text-[0.9rem] text-[var(--text-primary)]">
                  {formatDateLong(purchaseOrder.confirmed_eta)}
                </div>
              </div>

              {/* New ETA */}
              <div className="mb-5">
                <label
                  htmlFor="eta-quickedit-newdate"
                  className="mb-2 block"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  New ETA
                </label>
                <input
                  id="eta-quickedit-newdate"
                  type="date"
                  value={newEta}
                  onChange={(e) => setNewEta(e.target.value)}
                  className="w-full rounded-md border bg-[var(--bg-surface-alt,var(--bg-surface))] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-clay,#C4A57B)]"
                  style={{ borderColor: 'var(--border-default)' }}
                />
              </div>

              {/* Notes */}
              <div className="mb-5">
                <label
                  htmlFor="eta-quickedit-notes"
                  className="mb-2 block"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Notes (optional)
                </label>
                <textarea
                  id="eta-quickedit-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did the vendor tell you?"
                  className="w-full rounded-md border bg-[var(--bg-surface-alt,var(--bg-surface))] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-clay,#C4A57B)]"
                  style={{ borderColor: 'var(--border-default)' }}
                />
                <div
                  className="mt-1.5 text-[0.65rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Appended to PO notes as a timestamped audit line.
                </div>
              </div>

              {submitError && (
                <div
                  className="mt-4 rounded-md border px-3 py-2 text-[0.75rem]"
                  style={{
                    borderColor: 'var(--color-terracotta)',
                    background: 'rgba(212,160,144,0.10)',
                    color: 'var(--color-terracotta)',
                  }}
                  role="alert"
                >
                  {submitError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border-default)] px-5 py-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={updateEta.isPending}
                className="cursor-pointer rounded-md border bg-transparent px-3 py-1.5 text-[0.8rem] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover,rgba(0,0,0,0.04))] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--border-default)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSave}
                className="cursor-pointer rounded-md border-0 px-4 py-1.5 text-[0.8rem] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: 'var(--color-clay,#C4A57B)' }}
              >
                {updateEta.isPending ? 'Saving…' : 'Save new ETA'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default EtaQuickEditDrawer;
