'use client';

/**
 * Order Assistant side panel (Sprint 1 / Wave 1.4)
 *
 * Launched from the By Vendor view when a designer clicks "Order all N" on a
 * vendor card. Walks through the four-step PRD §6 flow:
 *
 *   1. Open vendor portal       — informational, deep-link
 *   2. Copy item details        — informational, clipboard helper
 *   3. Confirm order placed     — captures vendor PO # + confirmed ETA
 *   4. Payment terms (new v1)   — captures payment pattern + deposit/milestone data
 *
 * On submit, calls `useCreatePurchaseOrder` from `@patina/supabase`, which
 * inserts a `purchase_orders` row + the matching `po_payments` rows + links the
 * supplied `project_ffe_items` to the new PO header. On success the panel
 * closes and the parent view's React Query cache invalidates automatically.
 *
 * The panel is intentionally portal-local: it follows the same framer-motion
 * slide-from-right pattern as MessagesPanel rather than depending on the
 * shared `Drawer` primitive, so the visual treatment matches other portal
 * side surfaces.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import {
  useCreatePurchaseOrder,
  type CreatePurchaseOrderInput,
  type PaymentPattern,
} from '@patina/supabase';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import {
  BlockedByDecisionInline,
  getBlockedItems,
} from '@/components/portal/procurement/blocked-by-decision-notice';
import { Button, IconButton } from '@/components/ui/controls';

// ─── Shared types ──────────────────────────────────────────────────────────

export interface OrderAssistantVendor {
  id: string;
  name: string;
  default_payment_terms: PaymentPattern | null;
  trade_portal_url?: string;
  trade_account_email?: string;
  /**
   * Mirrors `vendors.is_patina_catalog` (migration 00149). When true, the
   * order is routed through Patina as the merchant — a different
   * payment + invoicing path than the external-vendor flow. Optional
   * for now; one-click Catalog ordering ships in S3.10 (Sprint 3).
   */
  is_patina_catalog?: boolean;
}

export interface OrderAssistantProject {
  id: string;
  name: string;
}

export interface OrderAssistantFFEItem {
  id: string;
  name: string;
  room?: string;
  line_total_cents: number;
  /**
   * Dual-pricing fields (00185/00186). The PO total is the vendor TRADE
   * total — COALESCE(trade, unit) × quantity per item — matching what the
   * `create_purchase_order` RPC computes server-side. Items without either
   * unit price (e.g. the By Vendor view's synthetic rows) fall back to
   * `line_total_cents` for the display total.
   */
  quantity?: number;
  unit_price_cents?: number | null;
  trade_price_cents?: number | null;
  /**
   * True when `id` is NOT a real `project_ffe_items.id` (e.g. the By Vendor
   * view passes draft-PO rows for display only). Display-only items are
   * excluded from the `ffeItemIds` sent to `create_purchase_order` — the
   * RPC hard-rejects unknown ids (00186).
   */
  displayOnly?: boolean;
  /**
   * Three-layer catalog layer of the underlying product, when known.
   * Drives the routing-mode badge in the assistant header and (in
   * Sprint 3) selects between the Patina one-click path and the
   * external-vendor manual PO flow. Optional during the transition —
   * callers may leave it undefined.
   */
  layer?: 'personal' | 'studio' | 'catalog';
  /**
   * Decision-Framework integrity fields (PT-D-2-T3-1). When `blocked` is true
   * and a `blocked_by_decision_id` is present the item is held by a pending
   * `blocks_procurement` client decision — the assistant disables ordering and
   * links the designer to the decision. Optional; callers that don't carry
   * blocking context (e.g. the By Vendor draft-PO list) leave them undefined
   * and the assistant behaves exactly as before.
   */
  blocked?: boolean | null;
  blocked_by_decision_id?: string | null;
  blocked_reason?: string | null;
}

export interface OrderAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: OrderAssistantVendor;
  project: OrderAssistantProject;
  ffeItems: OrderAssistantFFEItem[];
  /**
   * Optional disclaimer rendered in the panel header when the vendor's items
   * span multiple projects. Communicates that the assistant is scoped to a
   * single project for v1 (one PO covers one project per the data model).
   */
  scopeDisclaimer?: string;
  /**
   * Fires after a purchase order is successfully created (external or Patina
   * catalog), before the panel closes. Lets the launching surface react —
   * e.g. the FF&E board advances the ordered items to the "ordered" stage and
   * refreshes its list. Optional; the By Vendor view does not use it.
   */
  onCreated?: () => void;
}

// ─── Static config ─────────────────────────────────────────────────────────

const PAYMENT_PATTERN_OPTIONS: Array<{ value: PaymentPattern; label: string }> = [
  { value: 'fifty_fifty', label: '50% deposit / 50% before ship' },
  { value: 'thirty_seventy', label: '30% deposit / 70% before ship' },
  { value: 'full_upfront', label: 'Full payment upfront' },
  { value: 'net_30', label: 'NET-30 from delivery' },
  { value: 'custom_milestones', label: 'Custom milestones' },
];

/** Studio ship-to surface is out of scope for Wave 1.4; PRD shows a static placeholder. */
const SHIP_TO_PLACEHOLDER = 'Middlewest Studio · Madison WI';

// ─── Formatting helpers ────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function centsToDollarString(cents: number): string {
  // Plain string for input default (no commas, no symbol) — converted back
  // via `parseDollarsToCents` on submit.
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/**
 * Vendor-facing TRADE amount for one item: COALESCE(trade, unit) × quantity,
 * mirroring the `create_purchase_order` total computation (00186). Items
 * without dual-pricing data (synthetic display-only rows) fall back to
 * `line_total_cents`.
 */
function itemTradeCents(item: OrderAssistantFFEItem): number {
  const unit = item.trade_price_cents ?? item.unit_price_cents;
  if (unit === null || unit === undefined) return item.line_total_cents;
  return unit * (item.quantity ?? 1);
}

function formatItemDetailsForClipboard(
  vendor: OrderAssistantVendor,
  project: OrderAssistantProject,
  items: OrderAssistantFFEItem[]
): string {
  const lines: string[] = [];
  lines.push(`${vendor.name} — ${project.name}`);
  lines.push('');
  items.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.name}`);
    if (item.room) lines.push(`   Room: ${item.room}`);
    lines.push(`   Ship to: ${SHIP_TO_PLACEHOLDER}`);
    // Vendor-facing amounts are TRADE cost (00186) — never client prices.
    lines.push(`   ${formatDollars(itemTradeCents(item))}`);
    lines.push('');
  });
  const total = items.reduce((sum, i) => sum + itemTradeCents(i), 0);
  lines.push(`Total: ${formatDollars(total)}`);
  return lines.join('\n');
}

// ─── Milestone row helper type ─────────────────────────────────────────────

interface MilestoneRow {
  /** Locally-stable key for React lists. */
  key: string;
  label: string;
  amountInput: string; // dollars string while editing
  dueDate: string; // YYYY-MM-DD or empty
}

function freshMilestone(): MilestoneRow {
  return {
    key: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    amountInput: '',
    dueDate: '',
  };
}

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

  // Only real project_ffe_items rows are sent to the RPC — it rejects
  // unknown ids (00186). Display-only rows (By Vendor synthetics) drop out.
  const submittableFfeItemIds = useMemo(
    () => ffeItems.filter((i) => !i.displayOnly).map((i) => i.id),
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
    if (ffeItems.length > 0 && ffeItems.every((i) => i.layer === 'catalog'))
      return 'catalog';
    if (ffeItems.some((i) => i.layer === 'studio')) return 'studio';
    if (ffeItems.some((i) => i.layer === 'personal')) return 'personal';
    return 'studio'; // safest default for vendor flows without explicit layer signal
  }, [vendor.is_patina_catalog, ffeItems]);

  // Step 3 fields ----------------------------------------------------------
  const [vendorPoNumber, setVendorPoNumber] = useState('');
  const [confirmedEta, setConfirmedEta] = useState('');

  // Step 4 fields ----------------------------------------------------------
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
  // For catalog routing, skip the multi-step external-vendor flow and
  // create the PO directly with isPatinaCatalog=true. Patina invoices
  // on net_30 by default; deposit/balance milestone fields don't apply.
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
        // The sidemark input ships with the v2 Order Assistant UI — the
        // wire is ready, the field just isn't rendered yet.
        sidemark: undefined,
      });
      procurementEvents.poCreated({
        payment_pattern: 'net_30',
        // Server-computed TRADE total (00186) — authoritative.
        total_cents: po.total_cents,
        is_patina_catalog: true,
        vendor_id: vendor.id,
        project_id: project.id,
      });
      toast(
        `Patina order placed — ${ffeItems.length} item${ffeItems.length === 1 ? '' : 's'} routed through Patina.`,
        'success',
      );
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to place order');
    }
  };

  // Reset all fields when the panel opens with a fresh context. Keying off
  // `open` plus `vendor.id`/`project.id` means re-opening for a different
  // vendor/project never inherits stale state.
  useEffect(() => {
    if (!open) return;
    setVendorPoNumber('');
    setConfirmedEta('');
    setPaymentPattern(vendor.default_payment_terms ?? 'fifty_fifty');
    setDepositDueDate('');
    setDepositAmountInput('');
    setMilestones([freshMilestone(), freshMilestone()]);
    setSubmitError(null);
    setCopyState('idle');
  }, [open, vendor.id, vendor.default_payment_terms, project.id]);

  // When the user switches pattern, pre-fill the deposit amount input from
  // the canonical pattern math (50% / 30% / 100% of total). Custom and net_30
  // get their own treatment.
  useEffect(() => {
    if (paymentPattern === 'fifty_fifty') {
      setDepositAmountInput(centsToDollarString(Math.floor(totalCents / 2)));
    } else if (paymentPattern === 'thirty_seventy') {
      setDepositAmountInput(centsToDollarString(Math.floor(totalCents * 0.3)));
    } else if (paymentPattern === 'full_upfront') {
      setDepositAmountInput(centsToDollarString(totalCents));
    } else {
      setDepositAmountInput('');
    }
  }, [paymentPattern, totalCents]);

  // ─── Step 2 clipboard action ────────────────────────────────────────────

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

  // ─── Validation ─────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!paymentPattern) return 'Payment pattern is required.';

    if (paymentPattern === 'fifty_fifty' || paymentPattern === 'thirty_seventy') {
      const depositCents = parseDollarsToCents(depositAmountInput);
      if (depositCents < 0) return 'Deposit amount must be zero or greater.';
    }

    if (paymentPattern === 'custom_milestones') {
      if (milestones.length < 2 || milestones.length > 4) {
        return 'Custom milestones requires 2–4 rows.';
      }
      for (const m of milestones) {
        if (!m.label.trim()) return 'Each milestone needs a label.';
        if (parseDollarsToCents(m.amountInput) <= 0) {
          return 'Each milestone amount must be greater than zero.';
        }
      }
      // The create_purchase_order RPC (00186) rejects milestone sets that
      // don't sum to the trade total — validate here first so the designer
      // gets a field-level message instead of a raw RPC error.
      const milestoneSum = milestones.reduce(
        (sum, m) => sum + parseDollarsToCents(m.amountInput),
        0
      );
      if (milestoneSum !== totalCents) {
        return `Milestone amounts (${formatDollars(milestoneSum)}) must add up to the order total (${formatDollars(totalCents)}).`;
      }
    }

    return null;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────

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

    const validationError = validate();
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
      // The sidemark input ships with the v2 Order Assistant UI — the wire
      // is ready, the field just isn't rendered yet.
      sidemark: undefined,
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
      onOpenChange(false);
    } catch (e) {
      const msg = (e as Error)?.message ?? 'Failed to create purchase order.';
      setSubmitError(msg);
    }
  };

  const handleSkip = () => {
    if (createPO.isPending) return;
    onOpenChange(false);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const showSplitFields =
    paymentPattern === 'fifty_fifty' || paymentPattern === 'thirty_seventy';
  const showFullUpfrontFields = paymentPattern === 'full_upfront';
  const showNet30Note = paymentPattern === 'net_30';
  const showCustomMilestones = paymentPattern === 'custom_milestones';

  // Balance hint for split patterns ("Balance $X will become due ..."):
  const splitBalanceCents = showSplitFields
    ? Math.max(totalCents - parseDollarsToCents(depositAmountInput), 0)
    : 0;

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
            aria-label={`Order Assistant for ${vendor.name}`}
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
                </div>
                <IconButton
                  label="Close"
                  onClick={handleSkip}
                  disabled={createPO.isPending}
                  size="sm"
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
              {/* Step 1 — Open vendor portal */}
              <section
                className="mb-3 rounded-[5px] border px-3 py-3"
                style={{
                  borderColor: 'rgba(196,165,123,0.2)',
                  background: 'rgba(196,165,123,0.06)',
                }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="type-meta-small text-[var(--color-clay,#C4A57B)]">
                    Step 1 · Open vendor portal
                  </div>
                  {vendor.trade_portal_url ? (
                    <a
                      href={vendor.trade_portal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
                    >
                      Open in new tab
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
                      No trade portal on file
                    </span>
                  )}
                </div>
                <div className="text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
                  {vendor.trade_portal_url ?? '—'}
                  {vendor.trade_account_email ? ` · ${vendor.trade_account_email}` : ''}
                </div>
              </section>

              {/* Step 2 — Copy item details */}
              <section className="mb-3 rounded-[5px] border border-[var(--border-default)] px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="type-meta-small text-[var(--text-primary)]">
                    Step 2 · Copy item details
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyDetails}
                  >
                    <Copy className="h-3 w-3" />
                    {copyState === 'copied'
                      ? 'Copied!'
                      : copyState === 'error'
                        ? 'Copy failed'
                        : 'Copy details'}
                  </Button>
                </div>
                <div
                  className="border-l-2 pl-3 text-[0.7rem] leading-[1.7] text-[var(--text-primary)]"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {ffeItems.map((item, idx) => (
                    <div key={item.id} className={idx > 0 ? 'mt-2' : ''}>
                      <div>
                        <strong>{idx + 1}.</strong> {item.name}
                        {item.room ? ` · ${item.room}` : ''}
                      </div>
                      <div className="text-[var(--text-muted)]">
                        Ship to: {SHIP_TO_PLACEHOLDER}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Step 3 — Confirm order placed */}
              <section className="mb-3 rounded-[5px] border border-[var(--border-default)] px-3 py-3">
                <div className="mb-2 type-meta-small text-[var(--text-primary)]">
                  Step 3 · Confirm order placed
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                      Vendor PO #
                    </span>
                    <input
                      type="text"
                      value={vendorPoNumber}
                      onChange={(e) => setVendorPoNumber(e.target.value)}
                      placeholder="NA-2026-..."
                      className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                      Confirmed ETA
                    </span>
                    <input
                      type="date"
                      value={confirmedEta}
                      onChange={(e) => setConfirmedEta(e.target.value)}
                      className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                    />
                  </label>
                </div>
              </section>

              {/* Step 4 — Payment terms */}
              <section
                className="mb-3 rounded-[5px] border px-3 py-3"
                style={{
                  borderColor: 'var(--color-clay,#C4A57B)',
                  background: 'rgba(196,165,123,0.04)',
                }}
              >
                <div className="mb-2 flex items-baseline gap-2">
                  <div className="type-meta-small text-[var(--color-clay,#C4A57B)]">
                    Step 4 · Payment terms
                  </div>
                  <span className="font-mono text-[0.55rem] italic text-[var(--text-muted)]">
                    new in v1
                  </span>
                </div>

                <label className="block">
                  <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                    Terms
                  </span>
                  <select
                    value={paymentPattern}
                    onChange={(e) => setPaymentPattern(e.target.value as PaymentPattern)}
                    className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                  >
                    {PAYMENT_PATTERN_OPTIONS.map((opt) => {
                      const isDefault = vendor.default_payment_terms === opt.value;
                      return (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {isDefault ? ` (${vendor.name} default)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>

                {showSplitFields && (
                  <>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                          Deposit due
                        </span>
                        <input
                          type="date"
                          value={depositDueDate}
                          onChange={(e) => setDepositDueDate(e.target.value)}
                          className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                          Deposit amount
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={depositAmountInput}
                          onChange={(e) => setDepositAmountInput(e.target.value)}
                          placeholder="0.00"
                          className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-[0.62rem] italic text-[var(--color-aged-oak,#867257)]">
                      Balance {formatDollars(splitBalanceCents)} will become due
                      automatically when item enters &ldquo;Shipped&rdquo; stage.
                    </p>
                  </>
                )}

                {showFullUpfrontFields && (
                  <div className="mt-2">
                    <label className="block">
                      <span className="block text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                        Payment due
                      </span>
                      <input
                        type="date"
                        value={depositDueDate}
                        onChange={(e) => setDepositDueDate(e.target.value)}
                        className="mt-1 w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1.5 font-mono text-[0.7rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                      />
                    </label>
                  </div>
                )}

                {showNet30Note && (
                  <p className="mt-2 text-[0.62rem] italic text-[var(--color-aged-oak,#867257)]">
                    Full balance due 30 days after delivery.
                  </p>
                )}

                {showCustomMilestones && (
                  <div className="mt-2 flex flex-col gap-2">
                    {milestones.map((m, idx) => (
                      <div
                        key={m.key}
                        className="rounded-[3px] border border-[var(--border-subtle)] p-2"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
                            Milestone {idx + 1}
                          </span>
                          {milestones.length > 2 && (
                            <IconButton
                              label={`Remove milestone ${idx + 1}`}
                              onClick={() => removeMilestone(m.key)}
                              size="sm"
                            >
                              <Trash2 className="h-3 w-3" />
                            </IconButton>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={m.label}
                            onChange={(e) => updateMilestone(m.key, { label: e.target.value })}
                            placeholder="Label"
                            className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1 font-mono text-[0.65rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            value={m.amountInput}
                            onChange={(e) =>
                              updateMilestone(m.key, { amountInput: e.target.value })
                            }
                            placeholder="Amount"
                            className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1 font-mono text-[0.65rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                          />
                          <input
                            type="date"
                            value={m.dueDate}
                            onChange={(e) =>
                              updateMilestone(m.key, { dueDate: e.target.value })
                            }
                            className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-2 py-1 font-mono text-[0.65rem] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                          />
                        </div>
                      </div>
                    ))}
                    {milestones.length < 4 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={addMilestone}
                        className="self-start"
                      >
                        <Plus className="h-3 w-3" />
                        Add milestone
                      </Button>
                    )}
                  </div>
                )}
              </section>

              {/* Decision-Framework integrity gate (PT-D-2-T3-1): when any item
                  in the batch is held by a pending blocks_procurement decision,
                  surface the reason + a deep link and disable the submit
                  controls below. */}
              {hasBlockedItems && (
                <BlockedByDecisionInline
                  blockedItems={blockedItems}
                  projectId={project.id}
                  className="mb-3"
                />
              )}

              {submitError && (
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
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={createPO.isPending}
              >
                {dominantLayer === 'catalog' ? 'Cancel' : 'Skip — order externally'}
              </Button>
              {dominantLayer === 'catalog' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCatalogSubmit}
                  disabled={createPO.isPending || hasBlockedItems}
                  loading={createPO.isPending}
                  title={
                    hasBlockedItems
                      ? 'Ordering is blocked pending a client decision'
                      : undefined
                  }
                >
                  {hasBlockedItems
                    ? 'Blocked — decision pending'
                    : `One-click order via Patina · ${formatDollars(totalCents)}`}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={createPO.isPending || hasBlockedItems}
                  loading={createPO.isPending}
                  title={
                    hasBlockedItems
                      ? 'Ordering is blocked pending a client decision'
                      : undefined
                  }
                >
                  {hasBlockedItems
                    ? 'Blocked — decision pending'
                    : `Confirm ${ffeItems.length} ordered`}
                </Button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
    hint: 'One-click ordering through Patina ships with Sprint 3. For now, the manual flow below applies.',
    color: 'var(--color-clay, #C4A57B)',
    bg: 'rgba(196, 165, 123, 0.15)',
  },
};

/**
 * Small inline badge surfacing the three-layer routing mode. Sits below
 * the scope disclaimer in the panel header so the designer knows which
 * procurement path applies before they start filling in PO details.
 *
 * Sprint 2 / S2.9 light touch — the actual catalog one-click flow
 * ships in S3.10. For now the badge is visual and the underlying flow
 * is unchanged.
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
