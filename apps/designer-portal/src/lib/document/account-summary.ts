/**
 * Pure aggregations for the Accounts book (R36). Nothing is authored here twice
 * — Revenue and A/R come straight off the invoice rows; the blended margin uses
 * the SAME committed-line definition as the per-engagement Account Page
 * (use-account-page.ts), just summed studio-wide. The book is the sum; the
 * Account Page is the leaf.
 */

import type { Invoice } from '@patina/supabase';

/** Money in: total collected across all invoices (Σ amount_paid_cents). */
export function collectedCents(invoices: Invoice[]): number {
  return invoices.reduce((s, i) => s + (i.amount_paid_cents || 0), 0);
}

/** Gross billed: issued (non-draft, non-void) invoice totals. */
export function billedCents(invoices: Invoice[]): number {
  return invoices
    .filter((i) => i.status !== 'draft' && i.status !== 'void')
    .reduce((s, i) => s + (i.total_cents || 0), 0);
}

/** Remaining balance on an invoice header row. */
export function invoiceBalanceCents(invoice: Pick<Invoice, 'total_cents' | 'amount_paid_cents'>): number {
  return Math.max((invoice.total_cents || 0) - (invoice.amount_paid_cents || 0), 0);
}

// NOTE: designer_earnings money (net_amount, and the useEarningsStats sums over
// it) is stored in CENTS — the live /portal/earnings page formats it as
// cents/100. Format earnings with fmtUsd (cents) like everything else; there is
// deliberately no dollars formatter here.
