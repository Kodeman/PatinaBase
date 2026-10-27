import type { Invoice } from '@patina/supabase';
import { billedCents, collectedCents, invoiceBalanceCents } from '../account-summary';

const row = (status: Invoice['status'], total_cents: number, amount_paid_cents: number) => ({ status, total_cents, amount_paid_cents }) as Invoice;

it('never counts draft balances as issued revenue or received cash', () => {
  const invoices = [row('draft', 90000, 80000), row('sent', 30000, 0), row('partially_paid', 20000, 5000), row('paid', 10000, 10000), row('void', 40000, 2000)];
  expect(billedCents(invoices)).toBe(60000);
  expect(collectedCents(invoices)).toBe(17000);
  expect(invoiceBalanceCents(invoices[2])).toBe(15000);
  expect(invoiceBalanceCents(row('paid', 10000, 11000))).toBe(0);
});
