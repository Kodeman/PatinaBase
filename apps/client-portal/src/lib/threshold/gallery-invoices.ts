import type { Invoice } from '@patina/supabase';

import { invoiceMoney } from '@/components/threshold/earlier-invoices';
import { dayMonth, parseSourceDate } from './dates';
import type { InvoiceProjection, InvoiceRow } from './invoice-rollup';

/** Only the server's settled payment row can name a payment amount and day. */
export function galleryInvoiceReceipt(invoice: Invoice): string | null {
  const payments = (invoice.payments ?? [])
    .filter((payment) => payment.status === 'succeeded' && payment.received_at)
    .sort((a, b) => Date.parse(b.received_at!) - Date.parse(a.received_at!));
  const payment = payments[0];
  const date = parseSourceDate(payment?.received_at);
  if (!payment || !date || payment.amount_cents <= 0) return null;
  return `Paid ${invoiceMoney(payment.amount_cents, invoice.currency, false)} on ${dayMonth(date)}. Thank you.`;
}

/** Keep currencies separate and never recover a withheld total from partial rows. */
export function galleryRemainingAmounts(projection: InvoiceProjection, urgent: InvoiceRow | null): string[] | null {
  if (!projection.outstandingTotals) return null;
  const amounts = new Map<string, number>();
  for (const row of projection.outstanding) {
    if (row.invoice.id === urgent?.invoice.id) continue;
    amounts.set(row.currency, (amounts.get(row.currency) ?? 0) + row.balanceCents);
  }
  const mixed = new Set(projection.outstanding.map((row) => row.currency)).size > 1;
  return [...amounts].map(([currency, cents]) => invoiceMoney(cents, currency, mixed));
}
