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

// ── Time lines (kind='time' — unbilled-time pull-through, 00177) ────────────
// The designer composer writes ONE time line per invoice: quantity 1,
// unit_amount_cents = amount_cents = the sum of the claimed entries'
// view-resolved amounts. The hours live here, in metadata, so every renderer
// (designer detail, print, client detail) can annotate the line without
// re-deriving money.

/** metadata shape the composer stamps on kind='time' invoice lines. */
export interface TimeLineMetadata {
  /** project_time_entries ids claimed by this line (provenance). */
  time_entry_ids: string[];
  /** Total logged minutes across the claimed entries. */
  total_minutes: number;
}

/** 270 → "4h 30m", 120 → "2h", 45 → "45m", 0 → "0m". */
export function formatMinutesAsHours(minutes: number): string {
  const total = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Hours label for a kind='time' line ("4h 30m"), from the metadata the
 * composer stamped. Null when the metadata is missing/malformed so renderers
 * can skip the annotation rather than print garbage.
 */
export function timeLineHoursLabel(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const minutes = Number((metadata as { total_minutes?: unknown } | null)?.total_minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return formatMinutesAsHours(minutes);
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
