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
 *   - inserts the inspection (DB triggers from migration 00184 then stamp
 *     `delivered_date`, advance the PO on clean outcomes, shift the NET-30
 *     balance due_date, and mark linked FF&E items received),
 *   - auto-drafts a `damage_claims` row when the outcome is not 'clean',
 *   - (W5-T2) writes per-item received_quantity for the counts entered in
 *     the "Items received" section below — the 00184 trigger only stamps
 *     full quantities on clean outcomes, so short/partial counts are owned
 *     by this client path.
 *
 * W5-T2 also auto-suggests the 'partial' outcome while the designer hasn't
 * explicitly picked one: any received count below the ordered quantity
 * preselects Partial; restoring full counts reverts to Clean.
 *
 * Mirrors the slide-from-right pattern used by the Sprint 1 OrderAssistant.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useCreateReceivingInspection,
  useProcurementItems,
  type ReceivingInspectionOutcome,
} from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { Button, IconButton, Input, Textarea } from '@/components/ui/controls';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LogInspectionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PO under inspection. */
  purchaseOrderId: string;
  /**
   * Project the PO belongs to. When provided, the FF&E caches for the
   * project are invalidated after a logged inspection (the 00184 triggers
   * advance linked FF&E items server-side on clean outcomes).
   */
  projectId?: string;
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
  const {
    open,
    onOpenChange,
    purchaseOrderId,
    projectId,
    poLabel,
    vendorName,
    projectName,
  } = props;

  const [outcome, setOutcome] = useState<ReceivingInspectionOutcome>('clean');
  // W5-T2 — once the designer explicitly picks an outcome, the per-item
  // auto-suggest below stops overriding it.
  const [outcomeTouched, setOutcomeTouched] = useState(false);
  const [notes, setNotes] = useState('');
  // W5-T2 — per-item received counts, keyed by project_ffe_items.id. Sparse:
  // untouched rows fall back to the full ordered quantity.
  const [received, setReceived] = useState<Record<string, number>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [damagedItemIds, setDamagedItemIds] = useState<string[]>([]);

  const createInspection = useCreateReceivingInspection();
  const { toast } = useToast();

  // W5-T2 — the PO's linked FF&E lines for the per-item receipt section.
  const itemsQuery = useProcurementItems({ purchaseOrderId });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  // Reset form whenever the drawer reopens for a new PO.
  useEffect(() => {
    if (!open) return;
    setOutcome('clean');
    setOutcomeTouched(false);
    setNotes('');
    setReceived({});
    setSubmitError(null);
    setDamagedItemIds([]);
  }, [open, purchaseOrderId]);

  const receivedFor = (itemId: string, ordered: number): number =>
    received[itemId] ?? ordered;

  const anyShort = useMemo(
    () => items.some((it) => receivedFor(it.id, it.quantity) < it.quantity),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, received],
  );

  // Auto-suggest 'partial' while the designer hasn't explicitly chosen an
  // outcome: any short count preselects Partial, restoring full counts
  // reverts to Clean. An explicit click (outcomeTouched) always wins.
  useEffect(() => {
    if (!open || outcomeTouched) return;
    setOutcome(anyShort ? 'partial' : 'clean');
  }, [open, outcomeTouched, anyShort]);

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const photoAssetIds: string[] = [];
      const result = await createInspection.mutateAsync({
        purchaseOrderId,
        projectId,
        outcome,
        notes: notes.trim() ? notes.trim() : undefined,
        photoAssetIds,
        // W5-T2 — per-item received counts. The hook skips clean-outcome
        // rows at full quantity (the 00184 trigger already stamped those).
        items:
          items.length > 0
            ? items.map((it) => ({
                ffeItemId: it.id,
                receivedQuantity: receivedFor(it.id, it.quantity),
                orderedQuantity: it.quantity,
              }))
            : undefined,
        // R7 (The Document) — item-grain claim attribution: one drafted
        // claim per picked piece; those lines carry the DAMAGED stamp.
        damagedFfeItemIds:
          outcome !== 'clean' && damagedItemIds.length > 0 ? damagedItemIds : undefined,
      });

      procurementEvents.inspectionLogged({
        outcome,
        has_photos: photoAssetIds.length > 0,
      });
      // Fire procurement_damage_claim_created only when the damage_claim
      // INSERT actually succeeded. Previously this fired on `outcome !== 'clean'`,
      // which double-counted in the compensating-delete path: when step 4
      // failed, the hook deleted the inspection AND threw, but the event
      // had already fired purely on outcome. Now the hook's resolved value
      // carries `damageClaimCreated`, which is `true` only after a clean
      // damage_claims INSERT (W3.5.5 HIGH-1).
      if (result.damageClaimCreated) {
        procurementEvents.damageClaimCreated({ outcome });
      }

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
              <IconButton
                label="Close"
                onClick={() => !createInspection.isPending && onOpenChange(false)}
                disabled={createInspection.isPending}
                size="sm"
              >
                <X size={18} />
              </IconButton>
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
                        onClick={() => {
                          setOutcome(opt.value);
                          setOutcomeTouched(true);
                        }}
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

              {/* W5-T2 — per-item received counts. Defaults to the full
                  ordered quantity; lowering any count auto-suggests the
                  Partial outcome above (until the designer picks one). */}
              {itemsQuery.isLoading ? (
                <div className="mb-5 text-[0.72rem] italic text-[var(--text-muted)]">
                  Loading linked items…
                </div>
              ) : items.length > 0 ? (
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
                    Items received
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((it) => {
                      const value = receivedFor(it.id, it.quantity);
                      const missing = it.quantity - value;
                      return (
                        <div
                          key={it.id}
                          className="flex items-center gap-3 rounded-md border px-3 py-2"
                          style={{
                            borderColor:
                              missing > 0
                                ? 'var(--color-golden-hour)'
                                : 'var(--border-default)',
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[0.8rem] text-[var(--text-primary)]">
                              {it.name}
                            </div>
                            <div className="text-[0.65rem] text-[var(--text-muted)]">
                              {it.quantity} ordered
                              {missing > 0 && (
                                <span style={{ color: 'var(--color-golden-hour)' }}>
                                  {' '}
                                  · {missing} missing
                                </span>
                              )}
                            </div>
                          </div>
                          <Input
                            id={`received-qty-${it.id}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={it.quantity}
                            value={value}
                            disabled={createInspection.isPending}
                            aria-label={`Received quantity for ${it.name}`}
                            title={`Received quantity (0–${it.quantity})`}
                            onChange={(e) => {
                              const raw = Number.parseInt(e.target.value, 10);
                              const next = Number.isNaN(raw)
                                ? 0
                                : Math.max(0, Math.min(it.quantity, raw));
                              setReceived((prev) => ({ ...prev, [it.id]: next }));
                            }}
                            className="w-[76px] text-right"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[0.68rem] text-[var(--text-muted)]">
                    Counts below the ordered quantity suggest a partial
                    delivery.
                  </p>
                </div>
              ) : null}

              {/* R7 (The Document) — item-grain claim attribution: with a
                  non-clean outcome the designer picks WHICH pieces; one
                  drafted claim per pick, and exactly those lines carry the
                  DAMAGED stamp in the document. */}
              {outcome !== 'clean' && items.length > 0 && (
                <div className="mb-5">
                  <p
                    className="mb-2"
                    style={{
                      fontFamily: 'var(--font-meta)',
                      fontSize: '0.6rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Which pieces? (claims attach per item)
                  </p>
                  <div className="space-y-1.5">
                    {items.map((it) => (
                      <label
                        key={it.id}
                        className="flex items-center gap-2 text-[0.74rem]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <input
                          type="checkbox"
                          checked={damagedItemIds.includes(it.id)}
                          onChange={(e) =>
                            setDamagedItemIds((prev) =>
                              e.target.checked
                                ? [...prev, it.id]
                                : prev.filter((x) => x !== it.id),
                            )
                          }
                        />
                        {it.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

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
                <Textarea
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={createInspection.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={createInspection.isPending}
                loading={createInspection.isPending}
              >
                Log inspection
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default LogInspectionDrawer;
