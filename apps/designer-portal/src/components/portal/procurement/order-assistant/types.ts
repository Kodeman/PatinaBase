/**
 * Order Assistant v2 — shared types, money helpers, and the step machine.
 *
 * Kept dependency-light (type-only imports) so the pure pieces (itemTradeCents,
 * nextStep/prevStep) stay unit-testable without pulling React/Supabase runtime
 * into jest.
 */

import type { PaymentPattern } from '@patina/supabase';

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
  /**
   * Outbound PO recipient fields (W4-T4) — mirror `vendors.orders_email` /
   * `vendors.contact_info`. The po-send edge function resolves the recipient
   * authoritatively server-side; the created step only uses these for the
   * "Email to {recipient}" hint + disabled state. Optional — callers without
   * the vendor directory loaded leave them undefined and the email action
   * renders disabled.
   */
  orders_email?: string | null;
  contact_info?: Record<string, unknown> | null;
}

export interface OrderAssistantProject {
  id: string;
  name: string;
}

export interface OrderAssistantFFEItem {
  id: string;
  name: string;
  room?: string;
  /** Display-only client-price total. Callers must NOT coerce null line totals to 0 silently — doing so masks missing pricing in the displayed subtotal; pass 0 explicitly only when the item is intentionally free/unpriced. */
  line_total_cents: number;
  /**
   * Dual-pricing fields (00185/00186). The PO total is the vendor TRADE
   * total — COALESCE(trade, unit) × quantity per item — matching what the
   * `create_purchase_order` RPC computes server-side. Items without either
   * unit price fall back to `line_total_cents` for the display total.
   */
  quantity?: number;
  unit_price_cents?: number | null;
  trade_price_cents?: number | null;
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
   * blocking context leave them undefined and the assistant behaves exactly
   * as before.
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
  /**
   * Number of PendingOrder entries remaining in the caller's queue,
   * INCLUDING this one ("Order all N" / FF&E bulk "Generate POs" enqueue
   * one entry per vendor-or-project). Undefined/1 means this is the only
   * order in the session.
   *
   * Item 11 fix: the catalog one-click path used to `window.location.href`
   * straight to Stripe Checkout the moment ANY catalog PO in the queue was
   * created — navigating the whole tab away mid-queue silently abandoned
   * every PendingOrder still behind it (their component state was never
   * lost so much as never reached). When `queueLength > 1`, the catalog
   * submit creates the PO and resolves its po_payment as before but does
   * NOT redirect — it stays on the created panel with a manual "Pay now"
   * button, so `onOpenChange(false)` (Done) always advances the caller's
   * queue instead of leaving the app. Once the queue is down to its last
   * entry, `queueLength` is 1 (or omitted) and today's immediate redirect
   * applies again — nothing is left behind to abandon.
   */
  queueLength?: number;
}

// ─── Step machine ──────────────────────────────────────────────────────────

/**
 * The v2 Order Assistant walks discrete steps instead of one long scroll:
 *
 *   review   — items + vendor portal link + copy-details helper
 *   coverage — client-payment soft gate (00187 invoice coverage; never
 *              blocks — "Proceed anyway" is always available)
 *   details  — vendor PO# / ETA / payment terms (external vendors only)
 *   created  — post-create confirmation ("Done" closes / advances the queue)
 *
 * Patina-Catalog routing skips `details` entirely — the one-click submit
 * fires from the coverage step and payment terms don't apply (the designer
 * pays Patina at order time via Stripe hosted Checkout).
 */
export type OrderAssistantStep = 'review' | 'coverage' | 'details' | 'created';

export interface StepMachineOpts {
  /** True when the order routes through Patina as the merchant. */
  isCatalog: boolean;
}

/**
 * Next step in the pre-create flow, or `null` when the current step is the
 * submit step (its primary action creates the PO rather than advancing).
 */
export function nextStep(
  step: OrderAssistantStep,
  opts: StepMachineOpts,
): OrderAssistantStep | null {
  switch (step) {
    case 'review':
      return 'coverage';
    case 'coverage':
      return opts.isCatalog ? null : 'details';
    case 'details':
    case 'created':
      return null;
  }
}

/**
 * Previous step, or `null` when there is nothing to go back to ('review' is
 * the entry; 'created' is terminal — the PO already exists).
 */
export function prevStep(
  step: OrderAssistantStep,
  _opts: StepMachineOpts,
): OrderAssistantStep | null {
  switch (step) {
    case 'review':
    case 'created':
      return null;
    case 'coverage':
      return 'review';
    case 'details':
      return 'coverage';
  }
}

/** Ordered list of pre-create steps for the header progress indicator. */
export function stepSequence(opts: StepMachineOpts): OrderAssistantStep[] {
  return opts.isCatalog
    ? ['review', 'coverage']
    : ['review', 'coverage', 'details'];
}

export const STEP_LABELS: Record<OrderAssistantStep, string> = {
  review: 'Review items',
  coverage: 'Client invoice coverage',
  details: 'Order details',
  created: 'Order created',
};

/** Max length accepted for the sidemark input (purchase_orders.sidemark, 00186). */
export const SIDEMARK_MAX_LENGTH = 40;

// ─── Formatting helpers ────────────────────────────────────────────────────

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function centsToDollarString(cents: number): string {
  // Plain string for input default (no commas, no symbol) — converted back
  // via `parseDollarsToCents` on submit.
  return (cents / 100).toFixed(2);
}

export function parseDollarsToCents(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/**
 * Vendor-facing TRADE amount for one item: COALESCE(trade, unit) × quantity,
 * mirroring the `create_purchase_order` total computation (00186). Items
 * without dual-pricing data fall back to `line_total_cents`.
 *
 * Exported so every PO surface displays the same trade-based total the RPC
 * stores (OrderViaPatina imports it instead of summing client prices).
 */
export function itemTradeCents(
  item: Pick<
    OrderAssistantFFEItem,
    'line_total_cents' | 'quantity' | 'unit_price_cents' | 'trade_price_cents'
  >
): number {
  const unit = item.trade_price_cents ?? item.unit_price_cents;
  if (unit === null || unit === undefined) return item.line_total_cents;
  return unit * (item.quantity ?? 1);
}
