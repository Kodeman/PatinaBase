'use client';

/**
 * DamageClaimDrawer — right-slide sheet for the Procurement → Receiving
 * "Damage Claims" tab. Lets the designer review the auto-drafted claim that
 * came out of `useCreateReceivingInspection`, edit the description, and walk
 * the state machine forward:
 *
 *     drafted  →  vendor_notified  →  resolved
 *
 * Backward transitions are not allowed (matches `useUpdateDamageClaim`
 * validation). The drawer exposes three actions tied to the current state:
 *
 *   • "Save draft"    — partial update, no state transition.
 *   • "Notify vendor" — drafted → vendor_notified (sets vendor_notified_at).
 *   • "Mark resolved" — vendor_notified → resolved (sets resolved_at).
 *
 * Photo evidence is intentionally read-only; uploads happen on iOS.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useUpdateDamageClaim,
  type DamageClaim,
  type DamageClaimState,
} from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DamageClaimDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Claim under review. Source of truth for read-only metadata. */
  claim: DamageClaim | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATE_LABEL: Record<DamageClaimState, string> = {
  drafted: 'Drafted',
  vendor_notified: 'Vendor notified',
  resolved: 'Resolved',
};

const STATE_ACCENT: Record<DamageClaimState, string> = {
  drafted: 'var(--color-terracotta)',
  vendor_notified: 'var(--color-golden-hour)',
  resolved: 'var(--color-sage)',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function DamageClaimDrawer(props: DamageClaimDrawerProps) {
  const { open, onOpenChange, claim } = props;

  const [description, setDescription] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateClaim = useUpdateDamageClaim();
  const { toast } = useToast();

  // Sync the editable fields with the source claim whenever it changes.
  useEffect(() => {
    if (!open || !claim) return;
    setDescription(claim.description ?? '');
    setResolutionNotes(claim.resolution_notes ?? '');
    setSubmitError(null);
  }, [open, claim?.id, claim?.description, claim?.resolution_notes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!claim) {
    // Still render the AnimatePresence wrapper so the drawer can exit
    // gracefully when the parent clears the active claim while open.
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    );
  }

  const insp = claim.inspection;
  const po = insp?.purchase_order;
  const vendorName = po?.vendor?.name ?? 'Unknown vendor';
  const projectName = po?.project?.name ?? 'Unknown project';
  const poId = po?.id ?? '';

  const state = claim.state;
  // "Save" is shown for any non-resolved state (edits description and, when
  // visible, resolution_notes without transitioning state). The two
  // forward-transition buttons appear based on the current state below.
  const canNotifyVendor = state === 'drafted';
  const canMarkResolved = state === 'vendor_notified';
  const showResolutionNotes = state === 'vendor_notified' || state === 'resolved';

  const handleSave = async (nextState?: DamageClaimState) => {
    setSubmitError(null);
    try {
      const updated = await updateClaim.mutateAsync({
        id: claim.id,
        // Only include state when actually transitioning.
        ...(nextState ? { state: nextState } : {}),
        description,
        // Only include resolution_notes when the field is visible.
        ...(showResolutionNotes ? { resolution_notes: resolutionNotes } : {}),
      });
      const msg =
        nextState === 'vendor_notified'
          ? `Claim sent — ${vendorName} notified.`
          : nextState === 'resolved'
            ? `Claim closed — marked resolved.`
            : 'Claim draft saved.';
      toast(msg, nextState === 'resolved' ? 'success' : 'info');
      // Keep the drawer open on save-draft, close on a forward transition.
      if (nextState) onOpenChange(false);
      // Sync the local description back from the server response so the
      // "saved" indicator matches what's persisted.
      setDescription(updated.description ?? '');
      setResolutionNotes(updated.resolution_notes ?? '');
    } catch (e) {
      setSubmitError((e as Error)?.message ?? 'Failed to update damage claim.');
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
            onClick={() => !updateClaim.isPending && onOpenChange(false)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Damage claim for ${vendorName}`}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[480px] max-w-[92vw] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4">
              <div className="min-w-0">
                <div className="type-meta-small text-[var(--color-clay,#C4A57B)]">
                  Damage claim
                </div>
                <div className="mt-0.5 truncate font-heading text-[1rem] font-medium text-[var(--text-primary)]">
                  {vendorName}
                </div>
                <div className="type-meta-small text-[var(--text-muted)]">
                  {projectName}
                  {poId && (
                    <>
                      {' · '}
                      <span style={{ fontFamily: 'var(--font-meta)' }}>
                        PO {poId.slice(0, 8)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span
                  className="inline-flex items-center rounded-[3px] px-2 py-0.5"
                  style={{
                    background: `color-mix(in srgb, ${STATE_ACCENT[state]} 14%, transparent)`,
                    color: STATE_ACCENT[state],
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.58rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                  }}
                >
                  {STATE_LABEL[state]}
                </span>
                <button
                  type="button"
                  onClick={() => !updateClaim.isPending && onOpenChange(false)}
                  disabled={updateClaim.isPending}
                  className="shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {/* Read-only inspection summary */}
              <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.78rem]">
                <dt className="text-[var(--text-muted)]">Inspection date</dt>
                <dd className="text-[var(--text-primary)]">
                  {formatDate(claim.created_at)}
                </dd>
                <dt className="text-[var(--text-muted)]">Outcome</dt>
                <dd className="capitalize text-[var(--text-primary)]">
                  {insp?.outcome ?? '—'}
                </dd>
                {claim.vendor_notified_at && (
                  <>
                    <dt className="text-[var(--text-muted)]">Vendor notified</dt>
                    <dd className="text-[var(--text-primary)]">
                      {formatDate(claim.vendor_notified_at)}
                    </dd>
                  </>
                )}
                {claim.resolved_at && (
                  <>
                    <dt className="text-[var(--text-muted)]">Resolved</dt>
                    <dd className="text-[var(--text-primary)]">
                      {formatDate(claim.resolved_at)}
                    </dd>
                  </>
                )}
              </dl>

              <div
                className="mb-5 rounded-md border border-dashed px-4 py-3 text-[0.72rem] text-[var(--text-muted)]"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <span className="font-medium text-[var(--text-primary)]">
                  Photos viewable in mobile flow.
                </span>{' '}
                Tap the linked inspection from the iOS app to review attached
                photo evidence. Desktop view is text-only for v1.
              </div>

              {/* Editable description */}
              <div className="mb-5">
                <label
                  htmlFor="claim-description"
                  className="mb-2 block"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Description
                </label>
                <textarea
                  id="claim-description"
                  rows={7}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the damage or shortage in detail before notifying the vendor."
                  className="w-full rounded-md border bg-[var(--bg-surface-alt,var(--bg-surface))] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-clay,#C4A57B)]"
                  style={{ borderColor: 'var(--border-default)' }}
                  disabled={state === 'resolved'}
                />
                {state === 'resolved' && (
                  <p className="mt-1 text-[0.65rem] text-[var(--text-muted)]">
                    This claim is resolved. Description is read-only.
                  </p>
                )}
              </div>

              {/* Resolution notes — visible only when vendor_notified or resolved */}
              {showResolutionNotes && (
                <div className="mb-5">
                  <label
                    htmlFor="claim-resolution-notes"
                    className="mb-2 block"
                    style={{
                      fontFamily: 'var(--font-meta)',
                      fontSize: '0.6rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Resolution notes
                  </label>
                  <textarea
                    id="claim-resolution-notes"
                    rows={4}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder={
                      state === 'resolved'
                        ? 'How was this resolved? (e.g. Replacement shipped, credit issued.)'
                        : 'Optional — capture vendor responses as they come in.'
                    }
                    className="w-full rounded-md border bg-[var(--bg-surface-alt,var(--bg-surface))] px-3 py-2 text-[0.85rem] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-clay,#C4A57B)]"
                    style={{ borderColor: 'var(--border-default)' }}
                    disabled={state === 'resolved'}
                  />
                </div>
              )}

              {submitError && (
                <div
                  className="mb-2 rounded-md border px-3 py-2 text-[0.75rem]"
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
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-default)] px-5 py-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={updateClaim.isPending}
                className="cursor-pointer rounded-md border bg-transparent px-3 py-1.5 text-[0.8rem] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover,rgba(0,0,0,0.04))] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--border-default)' }}
              >
                Close
              </button>

              {state !== 'resolved' && (
                <button
                  type="button"
                  onClick={() => handleSave(undefined)}
                  disabled={updateClaim.isPending}
                  className="cursor-pointer rounded-md border bg-transparent px-3 py-1.5 text-[0.8rem] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover,rgba(0,0,0,0.04))] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  {updateClaim.isPending ? 'Saving…' : 'Save'}
                </button>
              )}

              {canNotifyVendor && (
                <button
                  type="button"
                  onClick={() => handleSave('vendor_notified')}
                  disabled={updateClaim.isPending}
                  className="cursor-pointer rounded-md border-0 px-4 py-1.5 text-[0.8rem] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: 'var(--color-golden-hour)' }}
                >
                  {updateClaim.isPending ? 'Notifying…' : 'Notify vendor'}
                </button>
              )}

              {canMarkResolved && (
                <button
                  type="button"
                  onClick={() => handleSave('resolved')}
                  disabled={updateClaim.isPending}
                  className="cursor-pointer rounded-md border-0 px-4 py-1.5 text-[0.8rem] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: 'var(--color-sage)' }}
                >
                  {updateClaim.isPending ? 'Saving…' : 'Mark resolved'}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default DamageClaimDrawer;
