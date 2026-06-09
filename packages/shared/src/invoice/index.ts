// ═══════════════════════════════════════════════════════════════════════════
// INVOICE MONEY MATH + FORMATTERS (migration 00178)
//
// Shared between the designer portal (composer, detail, print) and — in a
// later wave — the client portal pay surface and email templates, so the
// numbers a client sees always match what the designer composed.
//
// All money is integer cents. Rounding mirrors the issue_invoice RPC:
// tax = ROUND(subtotal * tax_rate) — keep these in lockstep.
// ═══════════════════════════════════════════════════════════════════════════

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void';

export const INVOICE_STATUSES: InvoiceStatus[] = [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'void',
];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  void: 'Void',
};

export type InvoicePaymentMethod =
  | 'stripe'
  | 'check'
  | 'wire'
  | 'ach_manual'
  | 'cash'
  | 'other';

export const INVOICE_PAYMENT_METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  stripe: 'Card (Stripe)',
  check: 'Check',
  wire: 'Wire transfer',
  ach_manual: 'ACH (manual)',
  cash: 'Cash',
  other: 'Other',
};

/** Minimal line shape the math needs (matches invoice_line_items columns). */
export interface InvoiceLineForTotals {
  quantity: number;
  unit_amount_cents: number;
}

export interface InvoiceTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/** Line amount = quantity × unit price, rounded to whole cents. */
export function computeLineAmountCents(
  quantity: number,
  unitAmountCents: number
): number {
  return Math.round((quantity || 0) * (unitAmountCents || 0));
}

/**
 * Invoice totals from lines + tax rate (e.g. 0.0825 for 8.25%).
 * Mirrors the recompute inside the issue_invoice RPC.
 */
export function computeInvoiceTotals(
  lines: InvoiceLineForTotals[],
  taxRate: number
): InvoiceTotals {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + computeLineAmountCents(line.quantity, line.unit_amount_cents),
    0
  );
  const taxCents = Math.round(subtotalCents * (taxRate || 0));
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/**
 * Cents → "$1,234.56". Distinct from utils' `formatPrice` only in name; kept
 * here so invoice surfaces have a single import for money + dates + labels.
 */
export function formatCurrency(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format((cents || 0) / 100);
}

/**
 * Date / timestamp → "Jun 9, 2026". Accepts the DATE ('2026-06-09') and
 * TIMESTAMPTZ strings Postgres returns; bare dates are pinned to UTC so they
 * don't roll back a day in western timezones.
 */
export function formatInvoiceDate(value: string | null | undefined): string {
  if (!value) return '—';
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isBareDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(isBareDate ? { timeZone: 'UTC' } : {}),
  });
}

/** Live receivable past its due date? (draft/paid/void are never overdue) */
export function isInvoiceOverdue(invoice: {
  status: InvoiceStatus | string;
  due_date: string | null;
}): boolean {
  if (invoice.status !== 'sent' && invoice.status !== 'partially_paid') return false;
  if (!invoice.due_date) return false;
  const due = new Date(`${invoice.due_date.slice(0, 10)}T23:59:59`);
  return due.getTime() < Date.now();
}

/** Remaining balance on an invoice header row. */
export function invoiceBalanceCents(invoice: {
  total_cents: number;
  amount_paid_cents: number;
}): number {
  return Math.max((invoice.total_cents || 0) - (invoice.amount_paid_cents || 0), 0);
}
