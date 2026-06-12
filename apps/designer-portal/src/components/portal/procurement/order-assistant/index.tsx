'use client';

/**
 * Order Assistant v2 side panel (W3-T3b step-flow refactor).
 *
 * Launched from the FF&E board ("Create PO") and the By Vendor view ("Order
 * all N"). Walks the designer through discrete steps instead of the v1
 * single scroll:
 *
 *   review   — items + vendor portal deep-link + copy-details helper
 *   details  — vendor PO# + confirmed ETA + payment terms (external vendors)
 *   created  — post-create confirmation; "Done" closes / advances the queue
 *
 * Patina-Catalog routing keeps its one-click path: the catalog submit fires
 * from the last pre-create step (payment terms don't apply — Patina invoices
 * net_30 internally) and `details` is skipped.
 *
 * On submit, calls `useCreatePurchaseOrder` from `@patina/supabase`, which
 * inserts a `purchase_orders` row + the matching `po_payments` rows + links
 * the supplied `project_ffe_items` to the new PO header. The queue contract
 * with both callers is unchanged: closing the panel (Done / ✕ / overlay)
 * advances the caller's PendingOrder queue, and a project/vendor change fully
 * resets the panel state.
 *
 * The panel is intentionally portal-local: it follows the same framer-motion
 * slide-from-right pattern as MessagesPanel rather than depending on the
 * shared `Drawer` primitive, so the visual treatment matches other portal
 * side surfaces.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useCreatePurchaseOrder,
  useFfeInvoiceCoverage,
  useOrganizations,
  type CreatePurchaseOrderInput,
  type PaymentPattern,
  type PurchaseOrder,
} from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import {
  BlockedByDecisionInline,
  getBlockedItems,
} from '@/components/portal/procurement/blocked-by-decision-notice';
import { Button, IconButton } from '@/components/ui/controls';
import {
  formatDollars,
  itemTradeCents,
  nextStep,
  parseDollarsToCents,
  prevStep,
  stepSequence,
  STEP_LABELS,
  type OrderAssistantProps,
  type OrderAssistantStep,
  type OrderAssistantVendor,
} from './types';
import { StepReview, formatItemDetailsForClipboard } from './step-review';
import { StepCoverage, uncoveredItems } from './step-coverage';
import {
  StepDetails,
  depositDefaultForPattern,
  freshMilestone,
  validateDetails,
  type MilestoneRow,
} from './step-details';
import { generateSidemark } from './sidemark';

// Barrel: both call sites + OrderViaPatina import from
// '@/components/portal/procurement/order-assistant' — keep the public
// surface identical to the old single-file module.
export { itemTradeCents } from './types';
export type {
  OrderAssistantFFEItem,
  OrderAssistantProject,
  OrderAssistantProps,
  OrderAssistantVendor,
} from './types';

// ─── Component ─────────────────────────────────────────────────────────────

export function OrderAssistant(props: OrderAssistantProps) {
  const { open, onOpenChange, vendor, project, ffeItems, scopeDisclaimer, onCreated } = props;

  // Vendor TRADE total — Σ COALESCE(trade, unit) × qty (00186), matching the
  // server-computed `purchase_orders.total_cents`. Drives the header display,
  // the deposit prefills, and the custom-milestones sum validation.
  const totalCents = useMemo(
    () => ffeItems.reduce((sum, i) => sum + itemTradeCents(i), 0),
    [ffeItems]
  );

  // Every caller now passes real project_ffe_items rows (the By Vendor view's
  // synthetic display-only draft-PO rows were retired in W3-T3a), so all ids
  // go to the create_purchase_order RPC (which hard-rejects unknown ids, 00186).
  const submittableFfeItemIds = useMemo(
    () => ffeItems.map((i) => i.id),
    [ffeItems]
  );

  // Decision-Framework integrity gate (PT-D-2-T3-1). Any item held by a
  // pending `blocks_procurement` decision disables ordering for the whole
  // batch — a PO covers one vendor's items at once, so the safest behaviour is
  // to refuse the order until the block clears rather than silently splitting.
  const blockedItems = useMemo(() => getBlockedItems(ffeItems), [ffeItems]);
  const hasBlockedItems = blockedItems.length > 0;

  // Three-layer routing detection (PRD §7.1 / S2.9). Catalog routing wins
  // any time the vendor is Patina-handled OR every item is catalog-layer.
  // Studio routing fires when any non-catalog item is studio. Personal is
  // the residual default — Order Assistant works identically to the
  // pre-layer-aware flow.
  const dominantLayer: 'personal' | 'studio' | 'catalog' = useMemo(() => {
    if (vendor.is_patina_catalog) return 'catalog';
    // NOTE: `project_ffe_items` has no `layer` column — neither the FF&E board
    // (ffe/page.tsx) nor the By Vendor view (by-vendor/page.tsx) passes `layer`
    // in the ffeItems map. This branch currently never fires from those callers.
    // When layer data becomes available (e.g. via a product join or a future
    // migration), callers should pass it through and this will activate.
    if (ffeItems.length > 0 && ffeItems.every((i) => i.layer === 'catalog'))
      return 'catalog';
    if (ffeItems.some((i) => i.layer === 'studio')) return 'studio';
    if (ffeItems.some((i) => i.layer === 'personal')) return 'personal';
    return 'studio'; // safest default for vendor flows without explicit layer signal
  }, [vendor.is_patina_catalog, ffeItems]);

  const isCatalog = dominantLayer === 'catalog';
  const machineOpts = { isCatalog };

  // Step machine ------------------------------------------------------------
  const [step, setStep] = useState<OrderAssistantStep>('review');
  const [createdPo, setCreatedPo] = useState<PurchaseOrder | null>(null);

  const goToStep = (next: OrderAssistantStep) => {
    setStep(next);
    setSubmitError(null);
    procurementEvents.orderAssistantStep({ step: next });
  };

  // Client-payment soft gate (00187) -----------------------------------------
  // Fetch while the panel is open so the coverage step renders instantly.
  // Mock/slug projects (and any RPC failure) land in isError — the step shows
  // a neutral "couldn't verify" note and NEVER blocks.
  const coverageQuery = useFfeInvoiceCoverage(project.id, { enabled: open });
  const uncovered = useMemo(
    () =>
      coverageQuery.isError || coverageQuery.isLoading
        ? []
        : uncoveredItems(ffeItems, coverageQuery.data),
    [ffeItems, coverageQuery.data, coverageQuery.isError, coverageQuery.isLoading]
  );
  // Fronted vendor cost for analytics — the TRADE total of uncovered items
  // (what ordering now pulls from studio funds ahead of client payment).
  const uncoveredCents = useMemo(
    () => uncovered.reduce((sum, u) => sum + itemTradeCents(u.item), 0),
    [uncovered]
  );
  // True once the designer proceeded past the gate with uncovered items —
  // stamped onto poCreated as `coverage_overridden`.
  const [coverageOverridden, setCoverageOverridden] = useState(false);
  // coverageGateShown fires once per (vendor, project) session.
  const gateShownRef = useRef(false);

  useEffect(() => {
    if (step !== 'coverage') return;
    if (coverageQuery.isLoading || coverageQuery.isError) return;
    if (uncovered.length === 0 || gateShownRef.current) return;
    gateShownRef.current = true;
    procurementEvents.coverageGateShown({
      uncovered_count: uncovered.length,
      uncovered_cents: uncoveredCents,
      total_count: ffeItems.length,
    });
  }, [
    step,
    coverageQuery.isLoading,
    coverageQuery.isError,
    uncovered,
    uncoveredCents,
    ffeItems.length,
  ]);

  // Sidemark (00186 wire, W3-T3b UI) -----------------------------------------
  // Prefill {STUDIO≤3}-{CLIENT-or-PROJECT≤8}-{ROOM≤3} from what the assistant
  // can see: the studio/organization name (useOrganizations — cached, already
  // used across the portal), the project name (no client name is in the
  // assistant's props), and the room when every item shares one.
  const { data: orgs } = useOrganizations();
  const studioName = (orgs?.[0] as { name?: string } | undefined)?.name;
  const sharedRoomName = useMemo(() => {
    const rooms = new Set(ffeItems.map((i) => i.room).filter(Boolean));
    return rooms.size === 1 ? (Array.from(rooms)[0] as string) : undefined;
  }, [ffeItems]);
  const generatedSidemark = useMemo(
    () =>
      generateSidemark({
        studioName,
        projectName: project.name,
        roomName: sharedRoomName,
      }),
    [studioName, project.name, sharedRoomName]
  );
  const [sidemark, setSidemark] = useState('');
  const [sidemarkEdited, setSidemarkEdited] = useState(false);
  // Keep the prefill live (the org name loads async) until the designer
  // touches the field; the context-reset effect clears the edited flag.
  useEffect(() => {
    if (!open || sidemarkEdited) return;
    setSidemark(generatedSidemark);
  }, [open, sidemarkEdited, generatedSidemark]);

  const handleSidemarkChange = (value: string) => {
    setSidemarkEdited(true);
    setSidemark(value);
  };

  // Details fields ----------------------------------------------------------
  const [vendorPoNumber, setVendorPoNumber] = useState('');
  const [confirmedEta, setConfirmedEta] = useState('');

  // Default the pattern to the vendor's stored default, else `fifty_fifty`.
  const initialPattern: PaymentPattern = vendor.default_payment_terms ?? 'fifty_fifty';
  const [paymentPattern, setPaymentPattern] = useState<PaymentPattern>(initialPattern);
  const [depositDueDate, setDepositDueDate] = useState('');
  // Deposit amount is rendered as a dollars input; derived default depends on
  // the chosen pattern. We track the raw input string so the user can edit
  // freely; conversion to cents happens at submit time.
  const [depositAmountInput, setDepositAmountInput] = useState('');
  const [milestones, setMilestones] = useState<MilestoneRow[]>([
    freshMilestone(),
    freshMilestone(),
  ]);

  // UI / submit state ------------------------------------------------------
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createPO = useCreatePurchaseOrder();
  const { toast } = useToast();

  // ─── One-click Patina order (S3.10) ─────────────────────────────────────
  // For catalog routing, skip the external-vendor details step and create the
  // PO directly with isPatinaCatalog=true. Patina invoices on net_30 by
  // default; deposit/balance milestone fields don't apply.
  const handleCatalogSubmit = async () => {
    setSubmitError(null);
    if (hasBlockedItems) {
      procurementEvents.orderBlocked({
        blocked_item_count: blockedItems.length,
        vendor_id: vendor.id,
        project_id: project.id,
        is_patina_catalog: true,
      });
      setSubmitError(
        `${blockedItems.length} item${blockedItems.length === 1 ? ' is' : 's are'} blocked pending a client decision. Resolve the decision before ordering.`,
      );
      return;
    }
    try {
      const po = await createPO.mutateAsync({
        projectId: project.id,
        vendorId: vendor.id,
        paymentPattern: 'net_30',
        isPatinaCatalog: true,
        ffeItemIds: submittableFfeItemIds,
        // Catalog routing skips the details step, so the designer never sees
        // the sidemark input — ship the generated default (never an edited
        // value; sidemarkEdited stays false on this path).
        sidemark: sidemark.trim() || undefined,
      });
      procurementEvents.poCreated({
        payment_pattern: 'net_30',
        // Server-computed TRADE total (00186) — authoritative.
        total_cents: po.total_cents,
        is_patina_catalog: true,
        coverage_overridden: coverageOverridden,
        sidemark_edited: sidemarkEdited,
        vendor_id: vendor.id,
        project_id: project.id,
      });
      toast(
        `Patina order placed — ${ffeItems.length} item${ffeItems.length === 1 ? '' : 's'} routed through Patina.`,
        'success',
      );
      onCreated?.();
      setCreatedPo(po);
      goToStep('created');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to place order');
    }
  };

  // Focus management: save the triggering element on open and restore it on
  // close so keyboard users land back where they started. The Close button
  // (or first focusable step content) picks up autoFocus inside the panel.
  const triggerRef = useRef<Element | null>(null);
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    } else {
      const el = triggerRef.current;
      triggerRef.current = null;
      if (el && 'focus' in el) {
        window.requestAnimationFrame(() => (el as HTMLElement).focus());
      }
    }
  }, [open]);

  // Reset all fields when the panel opens with a fresh context. Keying off
  // `open` plus `vendor.id`/`project.id` means re-opening (or the queue
  // advancing) for a different vendor/project never inherits stale state.
  useEffect(() => {
    if (!open) return;
    setStep('review');
    setCreatedPo(null);
    setVendorPoNumber('');
    setConfirmedEta('');
    setPaymentPattern(vendor.default_payment_terms ?? 'fifty_fifty');
    setDepositDueDate('');
    setDepositAmountInput('');
    setMilestones([freshMilestone(), freshMilestone()]);
    setSubmitError(null);
    setCopyState('idle');
    // Soft-gate + sidemark session state (W3-T3b). The sidemark VALUE is not
    // cleared here — the prefill effect above owns it and re-generates as
    // soon as the edited flag drops (clearing it here would clobber the
    // same-pass prefill when the queue advances to the next project).
    setCoverageOverridden(false);
    gateShownRef.current = false;
    setSidemarkEdited(false);
  }, [open, vendor.id, vendor.default_payment_terms, project.id]);

  // When the user switches pattern, pre-fill the deposit amount input from
  // the canonical pattern math (50% / 30% / 100% of total). Custom and net_30
  // get their own treatment.
  useEffect(() => {
    setDepositAmountInput(depositDefaultForPattern(paymentPattern, totalCents));
  }, [paymentPattern, totalCents]);

  // ─── Review-step clipboard action ───────────────────────────────────────

  const handleCopyDetails = async () => {
    const text = formatItemDetailsForClipboard(vendor, project, ffeItems);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch (e) {
      console.error('Order Assistant: clipboard write failed', e);
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  // ─── Milestone row helpers ──────────────────────────────────────────────

  const addMilestone = () => {
    setMilestones((prev) =>
      prev.length >= 4 ? prev : [...prev, freshMilestone()]
    );
  };

  const removeMilestone = (key: string) => {
    setMilestones((prev) => (prev.length <= 2 ? prev : prev.filter((m) => m.key !== key)));
  };

  const updateMilestone = (key: string, patch: Partial<MilestoneRow>) => {
    setMilestones((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  };

  // ─── Submit (external-vendor flow, fires from the details step) ─────────

  const handleSubmit = async () => {
    setSubmitError(null);

    if (hasBlockedItems) {
      procurementEvents.orderBlocked({
        blocked_item_count: blockedItems.length,
        vendor_id: vendor.id,
        project_id: project.id,
        is_patina_catalog: false,
      });
      setSubmitError(
        `${blockedItems.length} item${blockedItems.length === 1 ? ' is' : 's are'} blocked pending a client decision. Resolve the decision before ordering.`,
      );
      return;
    }

    const validationError = validateDetails({
      paymentPattern,
      depositAmountInput,
      milestones,
      totalCents,
      sidemark,
    });
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    const input: CreatePurchaseOrderInput = {
      projectId: project.id,
      vendorId: vendor.id,
      vendorPoNumber: vendorPoNumber.trim() || undefined,
      confirmedEta: confirmedEta || undefined,
      paymentPattern,
      isPatinaCatalog: false,
      ffeItemIds: submittableFfeItemIds,
      sidemark: sidemark.trim() || undefined,
    };

    if (paymentPattern === 'fifty_fifty' || paymentPattern === 'thirty_seventy') {
      input.depositDueDate = depositDueDate || undefined;
      const depositCents = parseDollarsToCents(depositAmountInput);
      input.depositAmountCents = depositCents > 0 ? depositCents : undefined;
    } else if (paymentPattern === 'full_upfront') {
      input.depositDueDate = depositDueDate || undefined;
      // depositAmountCents not needed — hook defaults to totalCents.
    } else if (paymentPattern === 'custom_milestones') {
      input.customMilestones = milestones.map((m, idx) => ({
        label: m.label.trim(),
        amountCents: parseDollarsToCents(m.amountInput),
        dueDate: m.dueDate || undefined,
        sortOrder: idx,
      }));
    }
    // net_30: no extra fields; hook builds a single balance row at totalCents.

    try {
      const po = await createPO.mutateAsync(input);

      procurementEvents.poCreated({
        payment_pattern: paymentPattern,
        // Server-computed TRADE total (00186) — authoritative.
        total_cents: po.total_cents,
        is_patina_catalog: false,
        coverage_overridden: coverageOverridden,
        sidemark_edited: sidemarkEdited,
        vendor_id: vendor.id,
        project_id: project.id,
      });

      const successMessage =
        paymentPattern === 'fifty_fifty' || paymentPattern === 'thirty_seventy'
          ? `PO created — deposit of ${formatDollars(
              parseDollarsToCents(depositAmountInput)
            )} due ${depositDueDate || 'soon'}.`
          : paymentPattern === 'full_upfront'
            ? `PO created — full payment of ${formatDollars(po.total_cents)} due ${
                depositDueDate || 'soon'
              }.`
            : paymentPattern === 'net_30'
              ? `PO created — full balance due 30 days after delivery.`
              : `PO created — ${milestones.length} milestone payments scheduled.`;

      toast(successMessage, 'success');
      onCreated?.();
      setCreatedPo(po);
      goToStep('created');
    } catch (e) {
      const msg = (e as Error)?.message ?? 'Failed to create purchase order.';
      setSubmitError(msg);
    }
  };

  const handleSkip = () => {
    if (createPO.isPending) return;
    onOpenChange(false);
  };

  // ─── Footer wiring ──────────────────────────────────────────────────────

  // The gate is "uncovered" only when we have a definitive answer — loading
  // and infra errors never count as uncovered (and never block).
  const gateIsUncovered =
    step === 'coverage' &&
    !coverageQuery.isLoading &&
    !coverageQuery.isError &&
    uncovered.length > 0;

  const handleContinue = () => {
    // Leaving the coverage step with uncovered items is an explicit override
    // (whether continuing to details or one-click submitting a catalog order).
    // Guard: fire coverageOverridden only on the FIRST override — if the
    // designer hits Continue → Back → Continue the flag is already set, so
    // we skip the analytics emission to prevent double-counting.
    if (gateIsUncovered && !coverageOverridden) {
      setCoverageOverridden(true);
      procurementEvents.coverageOverridden({
        uncovered_count: uncovered.length,
        uncovered_cents: uncoveredCents,
        vendor_id: vendor.id,
        project_id: project.id,
      });
    }
    const next = nextStep(step, machineOpts);
    if (next) {
      goToStep(next);
      return;
    }
    // No next step — this is the submit step.
    if (isCatalog) void handleCatalogSubmit();
    else void handleSubmit();
  };

  const handleBack = () => {
    if (createPO.isPending) return;
    const prev = prevStep(step, machineOpts);
    if (prev) goToStep(prev);
  };

  const isSubmitStep = nextStep(step, machineOpts) === null && step !== 'created';
  const sequence = stepSequence(machineOpts);
  const stepIndex = sequence.indexOf(step);

  const primaryLabel =
    isSubmitStep && hasBlockedItems
      ? 'Blocked — decision pending'
      : isSubmitStep && isCatalog
        ? gateIsUncovered
          ? 'Proceed anyway — order via Patina'
          : `One-click order via Patina · ${formatDollars(totalCents)}`
        : isSubmitStep
          ? `Confirm ${ffeItems.length} ordered`
          : gateIsUncovered
            ? 'Proceed anyway'
            : 'Continue';

  const primaryDisabled =
    createPO.isPending || (isSubmitStep && hasBlockedItems);

  // ─── Render ─────────────────────────────────────────────────────────────

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
            onClick={() => !createPO.isPending && onOpenChange(false)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-label={
              step !== 'created' && sequence.length > 1
                ? `Order Assistant for ${vendor.name} — Step ${stepIndex + 1} of ${sequence.length}: ${STEP_LABELS[step]}`
                : `Order Assistant for ${vendor.name}`
            }
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[440px] max-w-[92vw] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl"
          >
            {/* Header */}
            <div className="flex flex-col gap-1 border-b border-[var(--border-default)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="type-meta-small text-[var(--color-clay,#C4A57B)]">
                    Order Assistant · {vendor.name}
                  </div>
                  <div className="mt-0.5 truncate font-heading text-[1rem] font-medium text-[var(--text-primary)]">
                    {ffeItems.length} item{ffeItems.length !== 1 ? 's' : ''} ·{' '}
                    {formatDollars(totalCents)} total
                  </div>
                  <div className="type-meta-small text-[var(--text-muted)]">
                    {project.name}
                  </div>
                  {/* Step progress — hidden once created and for single-step flows. */}
                  {step !== 'created' && sequence.length > 1 && (
                    <div className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      Step {stepIndex + 1} of {sequence.length} · {STEP_LABELS[step]}
                    </div>
                  )}
                </div>
                <IconButton
                  label="Close"
                  onClick={handleSkip}
                  disabled={createPO.isPending}
                  size="sm"
                  // autoFocus lands here so screen readers announce the dialog
                  // label immediately; restored to the trigger on close.
                  autoFocus
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
              {scopeDisclaimer && (
                <p className="mt-1 text-[0.7rem] italic text-[var(--text-muted)]">
                  {scopeDisclaimer}
                </p>
              )}
              <RoutingBadge layer={dominantLayer} />
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {step === 'review' && (
                <StepReview
                  vendor={vendor}
                  ffeItems={ffeItems}
                  copyState={copyState}
                  onCopyDetails={handleCopyDetails}
                />
              )}

              {step === 'coverage' && (
                <StepCoverage
                  projectId={project.id}
                  ffeItems={ffeItems}
                  coverage={coverageQuery.data}
                  isLoading={coverageQuery.isLoading}
                  isError={coverageQuery.isError}
                  uncovered={uncovered}
                  onCreateInvoice={() => onOpenChange(false)}
                />
              )}

              {step === 'details' && (
                <StepDetails
                  vendor={vendor}
                  totalCents={totalCents}
                  sidemark={sidemark}
                  onSidemarkChange={handleSidemarkChange}
                  vendorPoNumber={vendorPoNumber}
                  onVendorPoNumberChange={setVendorPoNumber}
                  confirmedEta={confirmedEta}
                  onConfirmedEtaChange={setConfirmedEta}
                  paymentPattern={paymentPattern}
                  onPaymentPatternChange={setPaymentPattern}
                  depositDueDate={depositDueDate}
                  onDepositDueDateChange={setDepositDueDate}
                  depositAmountInput={depositAmountInput}
                  onDepositAmountInputChange={setDepositAmountInput}
                  milestones={milestones}
                  onAddMilestone={addMilestone}
                  onRemoveMilestone={removeMilestone}
                  onUpdateMilestone={updateMilestone}
                />
              )}

              {step === 'created' && createdPo && (
                <CreatedConfirmation
                  po={createdPo}
                  vendor={vendor}
                  itemCount={ffeItems.length}
                  isCatalog={isCatalog}
                />
              )}

              {/* Decision-Framework integrity gate (PT-D-2-T3-1): when any item
                  in the batch is held by a pending blocks_procurement decision,
                  surface the reason + a deep link and disable the submit
                  controls below. Visible on every pre-create step. */}
              {step !== 'created' && hasBlockedItems && (
                <BlockedByDecisionInline
                  blockedItems={blockedItems}
                  projectId={project.id}
                  className="mb-3"
                />
              )}

              {step !== 'created' && submitError && (
                <div
                  className="mb-3 rounded-[3px] border px-3 py-2 text-[0.7rem]"
                  style={{
                    borderColor: 'var(--color-terracotta,#D4A090)',
                    background: 'rgba(212,160,144,0.08)',
                    color: 'var(--text-primary)',
                  }}
                  role="alert"
                >
                  {submitError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border-default)] px-5 py-3">
              {step === 'created' ? (
                <>
                  <span />
                  <Button variant="primary" size="sm" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </>
              ) : (
                <>
                  {step === 'review' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSkip}
                      disabled={createPO.isPending}
                    >
                      {isCatalog ? 'Cancel' : 'Skip — order externally'}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBack}
                      disabled={createPO.isPending}
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleContinue}
                    disabled={primaryDisabled}
                    loading={isSubmitStep && createPO.isPending}
                    title={
                      isSubmitStep && hasBlockedItems
                        ? 'Ordering is blocked pending a client decision'
                        : undefined
                    }
                  >
                    {primaryLabel}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Created confirmation ──────────────────────────────────────────────────

/**
 * Post-create confirmation panel. The real "send to vendor" step ships with
 * Wave 4 — until then this confirms what was logged and hands control back
 * (Done closes the panel, which advances the caller's queue when more
 * vendor/project orders are pending).
 */
function CreatedConfirmation({
  po,
  vendor,
  itemCount,
  isCatalog,
}: {
  po: PurchaseOrder;
  vendor: OrderAssistantVendor;
  itemCount: number;
  isCatalog: boolean;
}) {
  return (
    <section
      className="rounded-[5px] border px-4 py-4"
      style={{
        borderColor: 'var(--color-sage, #A8B5A0)',
        background: 'rgba(168, 181, 160, 0.10)',
      }}
    >
      <div
        className="type-meta-small"
        style={{ color: 'var(--color-sage, #A8B5A0)', textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        Purchase order created
      </div>
      <div className="mt-1.5 font-heading text-[0.95rem] font-medium text-[var(--text-primary)]">
        {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatDollars(po.total_cents)} ·{' '}
        {vendor.name}
      </div>
      {po.vendor_po_number && (
        <div className="mt-1 font-mono text-[0.62rem] text-[var(--text-muted)]">
          Vendor PO {po.vendor_po_number}
        </div>
      )}
      <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
        {isCatalog
          ? 'Patina handles the deposit and balance internally — track progress from Procurement → By Vendor.'
          : 'Track payments and vendor acknowledgment from Procurement → By Vendor. Sending the PO to the vendor from Patina ships in a follow-up.'}
      </p>
    </section>
  );
}

// ─── Routing badge ─────────────────────────────────────────────────────────

const ROUTING_COPY: Record<
  'personal' | 'studio' | 'catalog',
  { label: string; hint: string; color: string; bg: string }
> = {
  personal: {
    label: 'Personal-library order',
    hint: 'Vendor relationship is informal — confirm payment terms manually.',
    color: 'var(--color-dusty-blue, #8B9CAD)',
    bg: 'rgba(139, 156, 173, 0.12)',
  },
  studio: {
    label: 'Studio-library order',
    hint: 'Stored vendor context pre-fills below. Verify before submitting.',
    color: 'var(--color-sage, #A8B5A0)',
    bg: 'rgba(168, 181, 160, 0.12)',
  },
  catalog: {
    label: 'Patina-handled order',
    hint: 'One-click ordering through Patina — payment terms are handled internally.',
    color: 'var(--color-clay, #C4A57B)',
    bg: 'rgba(196, 165, 123, 0.15)',
  },
};

/**
 * Small inline badge surfacing the three-layer routing mode. Sits below
 * the scope disclaimer in the panel header so the designer knows which
 * procurement path applies before they start filling in PO details.
 */
function RoutingBadge({ layer }: { layer: 'personal' | 'studio' | 'catalog' }) {
  const copy = ROUTING_COPY[layer];
  return (
    <div
      className="mt-2 flex flex-col gap-1 rounded-md px-2 py-1.5"
      style={{ background: copy.bg }}
    >
      <span
        className="type-meta-small"
        style={{
          color: copy.color,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {copy.label}
      </span>
      <span className="text-[0.7rem] text-[var(--text-muted)]">{copy.hint}</span>
    </div>
  );
}
