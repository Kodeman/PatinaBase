'use client';

/**
 * LogInspectionDrawer — small right-slide sheet for the Procurement → Receiving
 * "Pending Inspection" tab.
 *
 * The full photo-rich receiving flow lives in the iOS app (PRD §9 says
 * "Log on phone"). On desktop the designer only needs a quick way to record
 * an outcome + notes against a delivered PO when the box is already at the
 * studio. Photos remain mobile-first; this surface explicitly defers photo
 * upload with a placeholder.
 *
 * Submits via `useCreateReceivingInspection`, which:
 *   - inserts the inspection,
 *   - bumps the PO to `delivered` + sets `delivered_date`,
 *   - auto-drafts a `damage_claims` row when the outcome is not 'clean',
 *   - shifts NET-30 balance due_date when applicable.
 *
 * Mirrors the slide-from-right pattern used by the Sprint 1 OrderAssistant.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useCreateReceivingInspection,
  type ReceivingInspectionOutcome,
} from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LogInspectionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PO under inspection. */
  purchaseOrderId: string;
  /** Human-readable PO summary for the drawer header. */
  poLabel: string;
  /** Vendor name shown in the drawer header sub-line. */
  vendorName: string;
  /** Project name shown in the drawer header sub-line. */
  projectName: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

const OUTCOME_OPTIONS: Array<{
  value: ReceivingInspectionOutcome;
  label: string;
  description: string;
  accent: string;
}> = [
  {
    value: 'clean',
    label: 'Clean',
    description: 'All items received undamaged.',
    accent: 'var(--color-sage)',
  },
  {
    value: 'damaged',
    label: 'Damaged',
    description: 'One or more items show damage.',
    accent: 'var(--color-terracotta)',
  },
  {
    value: 'partial',
    label: 'Partial',
    description: 'Delivery is incomplete (missing pieces).',
    accent: 'var(--color-golden-hour)',
  },
];

export function LogInspectionDrawer(props: LogInspectionDrawerProps) {
  const { open, onOpenChange, purchaseOrderId, poLabel, vendorName, projectName } = props;

  const [outcome, setOutcome] = useState<ReceivingInspectionOutcome>('clean');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createInspection = useCreateReceivingInspection();
  const { toast } = useToast();

  // Reset form whenever the drawer reopens for a new PO.
  useEffect(() => {
    if (!open) return;
    setOutcome('clean');
    setNotes('');
    setSubmitError(null);
  }, [open, purchaseOrderId]);

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      await createInspection.mutateAsync({
        purchaseOrderId,
        outcome,
        notes: notes.trim() ? notes.trim() : undefined,
        photoAssetIds: [],
      });
      const successMsg =
        outcome === 'clean'
          ? `Inspection logged — ${poLabel} cleared.`
          : outcome === 'damaged'
            ? `Inspection logged — damage claim drafted for ${vendorName}.`
            : `Inspection logged — partial delivery noted for ${vendorName}.`;
      toast(successMsg, outcome === 'clean' ? 'success' : 'warning');
      onOpenChange(false);
    } catch (e) {
      setSubmitError((e as Error)?.message ?? 'Failed to log inspection.');
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
            onClick={() => !createInspection.isPending && onOpenChange(false)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Log inspection for ${poLabel}`}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[440px] max-w-[92vw] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4">
              <div className="min-w-0">
                <div className="type-meta-small text-[var(--color-clay,#C4A57B)]">
                  Log inspection
                </div>
                <div className="mt-0.5 truncate font-heading text-[1rem] font-medium text-[var(--text-primary)]">
                  {poLabel}
                </div>
                <div className="type-meta-small text-[var(--text-muted)]">
                  {vendorName} · {projectName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => !createInspection.isPending && onOpenChange(false)}
                disabled={createInspection.isPending}
                className="shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mb-5">
                <div
                  className="mb-2"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Outcome
                </div>
                <div className="flex flex-col gap-2">
                  {OUTCOME_OPTIONS.map((opt) => {
                    const isActive = outcome === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setOutcome(opt.value)}
                        className="flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors"
                        style={{
                          borderColor: isActive ? opt.accent : 'var(--border-default)',
                          background: isActive
                            ? `color-mix(in srgb, ${opt.accent} 7%, transparent)`
                            : 'transparent',
                        }}
                      >
                        <span
                          className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            background: isActive ? opt.accent : 'transparent',
                            border: `1px solid ${isActive ? opt.accent : 'var(--border-default)'}`,
                          }}
                          aria-hidden
                        />
                        <span className="flex-1">
                          <span className="block text-[0.85rem] font-medium text-[var(--text-primary)]">
                            {opt.label}
                          </span>
                          <span className="block text-[0.72rem] text-[var(--text-muted)]">
                            {opt.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-5">
                <label
                  htmlFor="inspection-notes"
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
                  id="inspection-notes"
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    outcome === 'clean'
                      ? 'e.g. All 3 pieces accounted for. Packaging intact.'
                      : outcome === 'damaged'
                        ? 'e.g. Chip on canopy of pendant cluster. Estimated 2cm chip.'
                        : 'e.g. 2 of 3 chairs delivered; one back-ordered.'
                  }
                  className="w-full rounded-md border bg-[var(--bg-surface-alt,var(--bg-surface))] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-clay,#C4A57B)]"
                  style={{ borderColor: 'var(--border-default)' }}
                />
              </div>

              {/* Photo placeholder — desktop defers to mobile */}
              <div
                className="rounded-md border border-dashed px-4 py-3 text-[0.75rem] text-[var(--text-muted)]"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <span className="font-medium text-[var(--text-primary)]">
                  Photos: upload via mobile.
                </span>{' '}
                Open the iOS app and tap{' '}
                <span className="italic">Log on phone</span> from the Arriving tab to
                attach photo evidence. Desktop logs the inspection without
                photos.
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
                disabled={createInspection.isPending}
                className="cursor-pointer rounded-md border bg-transparent px-3 py-1.5 text-[0.8rem] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover,rgba(0,0,0,0.04))] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--border-default)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={createInspection.isPending}
                className="cursor-pointer rounded-md border-0 px-4 py-1.5 text-[0.8rem] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background:
                    outcome === 'clean'
                      ? 'var(--color-sage)'
                      : outcome === 'damaged'
                        ? 'var(--color-terracotta)'
                        : 'var(--color-golden-hour)',
                }}
              >
                {createInspection.isPending ? 'Logging…' : 'Log inspection'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default LogInspectionDrawer;
