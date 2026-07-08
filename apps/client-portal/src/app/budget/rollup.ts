import { invoiceBalanceCents } from '@patina/shared';
import type { Invoice } from '@patina/supabase';

/**
 * Invoices worth counting on the client Budget rollup. Mirrors the filter in
 * ../../components/project-invoices-summary.tsx: `draft` invoices are
 * pre-issue (RLS already hides them from the client; filtered again here
 * defensively) and `void` invoices are cancelled — neither belongs in
 * "what have I paid" / "what do I owe".
 */
export function visibleInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void');
}

export interface InvoiceRollup {
  paidCents: number;
  outstandingCents: number;
}

/**
 * Sums amount_paid_cents (paid to date) and the remaining balance
 * (outstanding) across the visible invoices. Balance math is
 * `invoiceBalanceCents` from @patina/shared so it stays in lockstep with how
 * /invoices and the per-project invoices summary compute it.
 */
export function computeInvoiceRollup(invoices: Invoice[]): InvoiceRollup {
  return visibleInvoices(invoices).reduce<InvoiceRollup>(
    (totals, invoice) => ({
      paidCents: totals.paidCents + (invoice.amount_paid_cents || 0),
      outstandingCents: totals.outstandingCents + invoiceBalanceCents(invoice),
    }),
    { paidCents: 0, outstandingCents: 0 }
  );
}
