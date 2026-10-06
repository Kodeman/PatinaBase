/**
 * The order paper (C-23, D1-05) — types, money, terms and coverage helpers.
 *
 * Dependency-light (type-only Supabase imports) so the pure pieces stay
 * unit-testable without the React/Supabase runtime. Carried over from the
 * retired Order Assistant's types/step-details/step-coverage modules.
 */

import type {
  FfeInvoiceCoverageMap,
  FfeItemCoverage,
  FreightTerms,
  PaymentPattern,
} from '@patina/supabase';
import {
  DEFAULT_CURRENCY,
  formatCurrencyTotal,
  formatMoney,
  sumByCurrency,
  type CurrencyTotal,
} from '@/lib/currency-totals';

// ─── Shared types ──────────────────────────────────────────────────────────

export interface OrderPaperVendor {
  id: string;
  name: string;
  default_payment_terms: PaymentPattern | null;
  trade_portal_url?: string;
  trade_account_email?: string;
  /** `vendors.is_patina_catalog` (00149): Patina is the merchant (the maker lane). */
  is_patina_catalog?: boolean;
  /** Client-side recipient hint only; po-send resolves the recipient itself. */
  orders_email?: string | null;
  contact_info?: Record<string, unknown> | null;
}

export interface OrderPaperProject {
  id: string;
  name: string;
}

export interface OrderPaperFFEItem {
  id: string;
  name: string;
  room?: string;
  /** Display-only client-price total; never coerce a null total to 0 silently. */
  line_total_cents: number;
  /** Dual pricing (00185/00186): the PO total is Σ COALESCE(trade, unit) × qty. */
  quantity?: number;
  unit_price_cents?: number | null;
  trade_price_cents?: number | null;
  /** ISO-4217 (00661); missing reads as USD. */
  currency?: string | null;
  /** Three-layer catalog layer, when a caller knows it. */
  layer?: 'personal' | 'studio' | 'catalog';
  /** A pending `blocks_procurement` decision holds the line (PT-D-2-T3-1). */
  blocked?: boolean | null;
  blocked_by_decision_id?: string | null;
  blocked_reason?: string | null;
  spec?: Record<string, unknown> | null;
  configurationSnapshot?: unknown;
  configurationSnapshotHash?: string | null;
  configurationLockedAt?: string | null;
}

/** One paper: one (vendor, project) pair → one PO. */
export interface PendingOrder {
  vendor: OrderPaperVendor;
  project: OrderPaperProject;
  ffeItems: OrderPaperFFEItem[];
}

/**
 * An unsent PO the paper opens on (the Orders ledger's draft rows). Only the
 * header the paper edits and the facts it prints.
 */
export interface OrderPaperPurchaseOrder {
  id: string;
  project_id: string;
  vendor_id: string;
  total_cents: number;
  status: string;
  sent_at: string | null;
  po_number: string | null;
  payment_pattern: PaymentPattern;
  is_patina_catalog: boolean;
  ship_to: string | null;
  sidemark: string | null;
  requested_ship_on?: string | null;
  bill_to?: unknown;
  freight_terms?: string | null;
  vendor_note?: string | null;
  /** C-32 (00710): the hold record on a held_for_release PO. */
  held_at?: string | null;
  held_by?: string | null;
  hold_note?: string | null;
}

// ─── Money ─────────────────────────────────────────────────────────────────

/** Max length of purchase_orders.sidemark (00186). */
export const SIDEMARK_MAX_LENGTH = 40;

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Plain input string (no commas, no symbol). */
export function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function parseDollarsToCents(input: string): number {
  const n = Number(input.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/**
 * Vendor-facing TRADE amount for one line: COALESCE(trade, unit) × qty, the
 * create_purchase_order total (00186). No unit price falls back to the line total.
 */
export function itemTradeCents(
  item: Pick<
    OrderPaperFFEItem,
    'line_total_cents' | 'quantity' | 'unit_price_cents' | 'trade_price_cents'
  >,
): number {
  const unit = item.trade_price_cents ?? item.unit_price_cents;
  if (unit === null || unit === undefined) return item.line_total_cents;
  return unit * (item.quantity ?? 1);
}

/** Σ itemTradeCents in one currency, or the currencies the lines span (SQ-207). */
export function tradeTotal(items: readonly OrderPaperFFEItem[]): CurrencyTotal {
  return sumByCurrency(items, itemTradeCents);
}

export function formatTradeMoney(cents: number, currency: string): string {
  return currency === DEFAULT_CURRENCY ? formatDollars(cents) : formatMoney(cents, currency);
}

/** A trade total, or the mixed-currency note in place of a sum. */
export function formatTradeTotal(total: CurrencyTotal): string {
  return formatCurrencyTotal(total, formatTradeMoney);
}

// ─── The terminal act ──────────────────────────────────────────────────────

/** The one terminal act, amount inside: "Send to Hewn · $12,480" / "Order from Patina · $X". */
export function terminalLabel(input: {
  vendorName: string;
  amount: string;
  isPatinaMaker: boolean;
}): string {
  return input.isPatinaMaker
    ? `Order from Patina · ${input.amount}`
    : `Send to ${input.vendorName} · ${input.amount}`;
}

// ─── Header choices ────────────────────────────────────────────────────────

export const FREIGHT_TERMS_OPTIONS: Array<{ value: FreightTerms; label: string }> = [
  { value: 'prepaid', label: 'Prepaid' },
  { value: 'prepaid_add', label: 'Prepaid and added' },
  { value: 'collect', label: 'Collect' },
  { value: 'fob_origin', label: 'FOB origin' },
  { value: 'fob_destination', label: 'FOB destination' },
];

/** bill_to JSONB (00701) on one line, for the in-place field. */
export function billToText(billTo: unknown): string {
  if (!billTo || typeof billTo !== 'object') return '';
  const b = billTo as Record<string, unknown>;
  return typeof b.name === 'string' ? b.name : '';
}

// ─── Terms ─────────────────────────────────────────────────────────────────

export const PAYMENT_PATTERN_OPTIONS: Array<{ value: PaymentPattern; label: string }> = [
  { value: 'fifty_fifty', label: '50% deposit / 50% before ship' },
  { value: 'thirty_seventy', label: '30% deposit / 70% before ship' },
  { value: 'full_upfront', label: 'Full payment upfront' },
  { value: 'net_30', label: 'NET-30 from delivery' },
  { value: 'custom_milestones', label: 'Custom milestones' },
];

export function paymentPatternLabel(pattern: PaymentPattern | null | undefined): string {
  return PAYMENT_PATTERN_OPTIONS.find((o) => o.value === pattern)?.label ?? 'Not set';
}

/** C-12: the studio account's terms with this vendor, else the vendor default, else 50/50. */
export function prefillPaymentPattern(
  accountPattern: PaymentPattern | null | undefined,
  vendorDefault: PaymentPattern | null | undefined,
): PaymentPattern {
  return accountPattern ?? vendorDefault ?? 'fifty_fifty';
}

/** Where a terms option comes from, said after its label. */
export function termsNote(
  value: PaymentPattern,
  accountPattern: PaymentPattern | null | undefined,
  vendorDefault: PaymentPattern | null | undefined,
): string {
  if (accountPattern) return value === accountPattern ? ' (Studio account)' : '';
  return value === vendorDefault ? ' (Vendor default)' : '';
}

export interface MilestoneRow {
  key: string;
  label: string;
  amountInput: string;
  dueDate: string;
}

export function freshMilestone(): MilestoneRow {
  return {
    key: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    amountInput: '',
    dueDate: '',
  };
}

/**
 * The deposit for a pattern: 50% / 30% / 100% of the total, or the studio
 * account's deposit % on a split pattern (C-12). Custom and net_30 have none.
 */
export function depositCentsForPattern(
  pattern: PaymentPattern,
  totalCents: number,
  accountDepositPct?: number | null,
): number | null {
  const split = pattern === 'fifty_fifty' || pattern === 'thirty_seventy';
  if (split && accountDepositPct != null) {
    return Math.floor((totalCents * accountDepositPct) / 100);
  }
  if (pattern === 'fifty_fifty') return Math.floor(totalCents / 2);
  if (pattern === 'thirty_seventy') return Math.floor(totalCents * 0.3);
  if (pattern === 'full_upfront') return totalCents;
  return null;
}

/** What the paper must hold before it creates a PO, or the sentence that says why not. */
export function validatePaper(input: {
  paymentPattern: PaymentPattern;
  milestones: MilestoneRow[];
  totalCents: number;
  sidemark: string;
}): string | null {
  const { paymentPattern, milestones, totalCents, sidemark } = input;
  if (sidemark.trim().length > SIDEMARK_MAX_LENGTH) {
    return `Sidemark must be ${SIDEMARK_MAX_LENGTH} characters or fewer.`;
  }
  if (paymentPattern === 'custom_milestones') {
    if (milestones.length < 2 || milestones.length > 4) {
      return 'Custom milestones need 2 to 4 rows.';
    }
    for (const m of milestones) {
      if (!m.label.trim()) return 'Each milestone needs a label.';
      if (parseDollarsToCents(m.amountInput) <= 0) {
        return 'Each milestone amount must be greater than zero.';
      }
    }
    // create_purchase_order (00186) refuses a set that misses the trade total.
    const sum = milestones.reduce((s, m) => s + parseDollarsToCents(m.amountInput), 0);
    if (sum !== totalCents) {
      return `Milestone amounts (${formatDollars(sum)}) must add up to the order total (${formatDollars(totalCents)}).`;
    }
  }
  return null;
}

// ─── Coverage (00187, a warning that never blocks) ─────────────────────────

export interface CoverageChip {
  kind: 'not_invoiced' | 'draft' | 'sent_unpaid' | 'partially_paid';
  label: string;
}

/**
 * One line's billing state, or null when a paid invoice covers it. A missing
 * entry (not returned, or RLS-hidden) reads as not invoiced, for display only.
 */
export function deriveCoverageChip(coverage: FfeItemCoverage | undefined): CoverageChip | null {
  if (!coverage || coverage.coverage === 'uninvoiced') {
    return { kind: 'not_invoiced', label: 'Not invoiced' };
  }
  if (coverage.coverage === 'paid') return null;
  if (coverage.invoiceStatus === 'draft') return { kind: 'draft', label: 'Draft invoice' };
  if (coverage.invoiceStatus === 'partially_paid') {
    return { kind: 'partially_paid', label: 'Partially paid' };
  }
  return { kind: 'sent_unpaid', label: 'Invoice sent, unpaid' };
}

/** Lines no PAID invoice covers, with their chips, in order. */
export function uncoveredItems(
  items: OrderPaperFFEItem[],
  coverage: FfeInvoiceCoverageMap | undefined,
): Array<{ item: OrderPaperFFEItem; chip: CoverageChip }> {
  const out: Array<{ item: OrderPaperFFEItem; chip: CoverageChip }> = [];
  for (const item of items) {
    const chip = deriveCoverageChip(coverage?.[item.id]);
    if (chip) out.push({ item, chip });
  }
  return out;
}
