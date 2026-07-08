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
 * from the last pre-create step, creates the PO with `full_upfront`, then
 * hands the designer to Stripe hosted Checkout to pay Patina at order time
 * (Phase 4 — designer pays at order time); `details` is skipped.
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
  useStartPoCheckout,
  fetchPOPayments,
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
import {
  PoSendActions,
  clientVendorEmailHint,
} from '@/components/portal/procurement/po-send-actions';
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
  const { open, onOpenChange, vendor, project, ffeItems, scopeDisclaimer, onCreated, queueLength } =
    props;
  // Item 11 — more than one PendingOrder still queued behind this one. See
  // the queueLength doc in types.ts for why this changes the catalog path.
  const isQueued = (queueLength ?? 1) > 1;

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
  // Checkout-start failures on the catalog path must NOT roll back the
  // already-created PO and must NOT use the global mutation-error toast — they
  // render inline on the created panel instead. See useStartPoCheckout's R83
  // errorSurface doc.
  const startCheckout = useStartPoCheckout({ errorSurface: 'inline' });

  // Set once the catalog PO is created and we're resolving its po_payment id /
  // starting Checkout. While true the panel keeps its submitting UI (even
  // though the order already exists) and refuses to close.
  const [isRedirecting, setIsRedirecting] = useState(false);
  // Set only if catalog checkout-start fails after the PO was created — the
  // recoverable, inline message shown on the created panel.
  const [catalogCheckoutError, setCatalogCheckoutError] = useState<string | null>(null);

  // Item 11 — multi-order queue. Set on the created panel instead of
  // auto-redirecting when `isQueued` is true at submit time: the resolved
  // po_payment id backing a manual "Pay now" button, plus its own pending/
  // error state (kept separate from `isRedirecting`/`catalogCheckoutError`,
  // which describe the auto-redirect path).
  const [deferredPoPaymentId, setDeferredPoPaymentId] = useState<string | null>(null);
  const [payNowPending, setPayNowPending] = useState(false);
  const [payNowError, setPayNowError] = useState<string | null>(null);

  // "Busy" = the create mutation is in flight OR we're mid Stripe redirect.
  // Both must block close/back/skip and keep the primary control disabled.
  // The deferred manual "Pay now" click (payNowPending) is NOT busy in this
  // sense — the PO already exists and the queue must stay closeable while
  // that request is in flight.
  const isBusy = createPO.isPending || isRedirecting;

  // ─── One-click Patina order (S3.10 → Phase 4 pay-at-order) ──────────────
  // For catalog routing, skip the external-vendor details step, create the PO
  // with isPatinaCatalog=true + full_upfront, then take the designer to Stripe
  // hosted Checkout to pay Patina now. The PO is NEVER rolled back if checkout
  // fails — the "Pay now" affordance on By Vendor recovers it.
  const handleCatalogSubmit = async () => {
    setSubmitError(null);
    setCatalogCheckoutError(null);
    setDeferredPoPaymentId(null);
    setPayNowError(null);
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

    let po: PurchaseOrder;
    try {
      po = await createPO.mutateAsync({
        projectId: project.id,
        vendorId: vendor.id,
        // Designer pays Patina at order time (Phase 4). `full_upfront` is the
        // pattern the create_purchase_order RPC (00186) maps to a single
        // po_payments row for the full trade total — the one row Stripe
        // Checkout collects below.
        paymentPattern: 'full_upfront',
        isPatinaCatalog: true,
        ffeItemIds: submittableFfeItemIds,
        // Catalog routing skips the details step, so the designer never sees
        // the sidemark input — ship the generated default (never an edited
        // value; sidemarkEdited stays false on this path).
        sidemark: sidemark.trim() || undefined,
      });
    } catch (err) {
      // PO creation itself failed — nothing was created; surface inline and
      // stay on the submit step so the designer can retry.
      setSubmitError(err instanceof Error ? err.message : 'Failed to place order');
      return;
    }

    procurementEvents.poCreated({
      payment_pattern: 'full_upfront',
      // Server-computed TRADE total (00186) — authoritative.
      total_cents: po.total_cents,
      is_patina_catalog: true,
      coverage_overridden: coverageOverridden,
      sidemark_edited: sidemarkEdited,
      vendor_id: vendor.id,
      project_id: project.id,
    });
    // The PO now exists — from here it is NEVER rolled back. Notify the caller
    // (advances its queue / refreshes lists) first either way.
    onCreated?.();

    // Item 11 — more than one PendingOrder is still queued behind this one.
    // Auto-redirecting here would navigate the whole tab to Stripe and
    // silently abandon every entry still behind it in the caller's queue.
    // Create the PO (already done above) and resolve its po_payment so the
    // created panel can offer a manual "Pay now" instead — Done still
    // advances the queue normally.
    if (isQueued) {
      toast(
        `Order placed via Patina — pay from the panel below, or later from By Vendor.`,
        'success',
      );
      try {
        const payments = await fetchPOPayments(po.id);
        setDeferredPoPaymentId(payments[0]?.id ?? null);
      } catch {
        // Resolution failure just means the created panel won't offer the
        // inline "Pay now" button — the persistent one on By Vendor still
        // picks up the unpaid po_payment once caches refresh, so this is
        // never fatal to the order.
        setDeferredPoPaymentId(null);
      }
      setCreatedPo(po);
      goToStep('created');
      return;
    }

    // Single order — unchanged: hand off to Stripe Checkout immediately.
    toast(
      `Order placed via Patina — redirecting you to payment…`,
      'success',
    );

    setIsRedirecting(true);
    try {
      // The RPC returns only the purchase_orders header (no nested payments) —
      // resolve the single full_upfront po_payment row before starting checkout.
      const payments = await fetchPOPayments(po.id);
      const payment = payments[0];
      if (!payment) {
        throw new Error('No payment record was found for this order.');
      }
      const { url } = await startCheckout.mutateAsync({ poPaymentId: payment.id });
      window.location.href = url;
      // Navigating away to Stripe — no further state updates past this point.
    } catch (err) {
      // Checkout-start failed AFTER the PO was created. Keep the PO; land the
      // designer on the created panel with an honest, recoverable message —
      // payment can be finished from Procurement → By Vendor ("Pay now").
      setIsRedirecting(false);
      setCatalogCheckoutError(
        err instanceof Error ? err.message : "Payment couldn't be started.",
      );
      setCreatedPo(po);
      goToStep('created');
    }
  };

  // ─── Manual "Pay now" from the created panel (Item 11 deferred path) ────
  const handleDeferredPayNow = async () => {
    if (!deferredPoPaymentId || payNowPending) return;
    setPayNowError(null);
    setPayNowPending(true);
    try {
      const { url } = await startCheckout.mutateAsync({ poPaymentId: deferredPoPaymentId });
      window.location.href = url;
      // Navigating away — no further state updates past this point.
    } catch (err) {
      setPayNowPending(false);
      setPayNowError(err instanceof Error ? err.message : "Payment couldn't be started.");
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
    setIsRedirecting(false);
    setCatalogCheckoutError(null);
    // Item 11 — deferred manual "Pay now" state must not leak from one
    // queue entry's created panel into the next entry's review step.
    setDeferredPoPaymentId(null);
    setPayNowPending(false);
    setPayNowError(null);
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
    if (isBusy) return;
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
    if (isBusy) return;
    const prev = prevStep(step, machineOpts);
    if (prev) goToStep(prev);
  };

  const isSubmitStep = nextStep(step, machineOpts) === null && step !== 'created';
  const sequence = stepSequence(machineOpts);
  const stepIndex = sequence.indexOf(step);

  const primaryLabel =
    isRedirecting
      ? 'Redirecting to payment…'
      : isSubmitStep && hasBlockedItems
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
    isBusy || (isSubmitStep && hasBlockedItems);

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
            onClick={() => !isBusy && onOpenChange(false)}
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
                  disabled={isBusy}
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
                  checkoutError={catalogCheckoutError}
                  deferredPayNow={
                    deferredPoPaymentId
                      ? {
                          pending: payNowPending,
                          error: payNowError,
                          onPayNow: () => void handleDeferredPayNow(),
                        }
                      : null
                  }
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
                      disabled={isBusy}
                    >
                      {isCatalog ? 'Cancel' : 'Skip — order externally'}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBack}
                      disabled={isBusy}
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleContinue}
                    disabled={primaryDisabled}
                    loading={isSubmitStep && isBusy}
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

// ─── Created confirmation + send step (W4-T4) ──────────────────────────────

/**
 * Post-create confirmation panel. External-vendor orders gain the Wave 4
 * send actions (Preview PDF / Email to vendor / Mark as sent manually —
 * shared PoSendActions, also used by the By Vendor row popover); Patina
 * Catalog orders skip them — Patina is the merchant, there is no outbound
 * vendor document to send. Done closes the panel, which advances the
 * caller's queue when more vendor/project orders are pending.
 */
function CreatedConfirmation({
  po,
  vendor,
  itemCount,
  isCatalog,
  checkoutError,
  deferredPayNow,
}: {
  po: PurchaseOrder;
  vendor: OrderAssistantVendor;
  itemCount: number;
  isCatalog: boolean;
  /**
   * Set only on the catalog path when Stripe checkout-start failed after the
   * PO was created (Phase 4). The PO is real and unpaid; this drives the
   * honest, recoverable message directing the designer to "Pay now".
   */
  checkoutError?: string | null;
  /**
   * Item 11 — set only on the catalog path when this order was created as
   * part of a multi-order queue (`queueLength > 1`). The PO was NOT
   * auto-redirected to Stripe (that would abandon the rest of the queue),
   * so this renders a manual "Pay now" button instead — reusing the same
   * useStartPoCheckout mutation and resolved po_payment id, just deferred
   * to an explicit click. `null`/`undefined` means the single-order
   * auto-redirect path applies and no manual button is shown.
   */
  deferredPayNow?: {
    pending: boolean;
    error: string | null;
    onPayNow: () => void;
  } | null;
}) {
  return (
    <>
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
            ? checkoutError
              ? `Order placed, but payment wasn’t completed — ${checkoutError} You can pay Patina any time from Procurement → By Vendor using “Pay now” on this order.`
              : deferredPayNow
                ? 'Order placed — each payment opens Stripe, so pay them one at a time. Pay now below, or any time from Procurement → By Vendor.'
                : 'Order placed — finish paying Patina from Procurement → By Vendor using “Pay now” on this order.'
            : 'Track payments and vendor acknowledgment from Procurement → By Vendor.'}
        </p>
        {deferredPayNow && (
          <div className="mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={deferredPayNow.onPayNow}
              disabled={deferredPayNow.pending}
              loading={deferredPayNow.pending}
            >
              Pay now · {formatDollars(po.total_cents)}
            </Button>
            {deferredPayNow.error && (
              <p
                className="mt-2 text-[0.7rem]"
                style={{ color: 'var(--color-terracotta,#D4A090)' }}
                role="alert"
              >
                {deferredPayNow.error}
              </p>
            )}
          </div>
        )}
      </section>

      {!isCatalog && (
        <section className="mt-4">
          <div className="type-label mb-1">Send to vendor</div>
          <p className="mb-3 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
            Preview assigns the PO number and renders the document; emailing
            or marking sent stamps the sent date. You can also do this later
            from Procurement → By Vendor.
          </p>
          <PoSendActions
            purchaseOrderId={po.id}
            vendorId={vendor.id}
            vendorEmailHint={clientVendorEmailHint(vendor)}
            sentAt={po.sent_at}
          />
        </section>
      )}
    </>
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
    label: 'Order via Patina',
    hint: 'Order through Patina and pay now, via Stripe, to place the order.',
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
