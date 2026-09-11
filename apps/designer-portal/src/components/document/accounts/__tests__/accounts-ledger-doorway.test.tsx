/**
 * The /desk?book=accounts&page=ledger&invoiceId=… doorway (desk-doorway.tsx).
 * The print page's "← Back to invoice" is one such link, so arriving on the
 * ledger by it must reopen that invoice's folio rather than leave the reader
 * hunting for the row again.
 */

import { render } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';
import { AccountsLedgerPage } from '../accounts-ledger-page';
import { openInvoiceFolio } from '../invoice-overlays';

jest.mock('../invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
  openInvoiceFolio: jest.fn(),
}));

jest.mock('@patina/supabase', () => ({
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
}));

const base = (over: Partial<Invoice>): Invoice =>
  ({
    id: 'invoice-1',
    project_id: 'project-1',
    studio_id: 'studio-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    invoice_number: 'INV-0030',
    title: null,
    status: 'sent',
    issue_date: '2026-09-01',
    due_date: '2026-09-14',
    payment_terms_days: 14,
    currency: 'USD',
    subtotal_cents: 912_500,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 912_500,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-09-01T12:00:00.000Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    project: { id: 'project-1', name: 'Hollis House' },
    ...over,
  }) as Invoice;

const houseInvoice = base({});
const otherInvoice = base({ id: 'invoice-2', invoice_number: 'INV-0031' });

beforeEach(() => {
  jest.clearAllMocks();
});

it('opens the named invoice folio once the ledger has loaded it', () => {
  render(
    <AccountsLedgerPage
      invoices={[houseInvoice, otherInvoice]}
      highlightInvoiceId="invoice-2"
      onOpenDocument={jest.fn()}
    />,
  );

  expect(openInvoiceFolio).toHaveBeenCalledTimes(1);
  expect(openInvoiceFolio).toHaveBeenCalledWith('invoice-2');
});

it('waits for the invoice to arrive rather than firing on the empty first render', () => {
  const { rerender } = render(
    <AccountsLedgerPage invoices={[]} highlightInvoiceId="invoice-2" onOpenDocument={jest.fn()} />,
  );
  expect(openInvoiceFolio).not.toHaveBeenCalled();

  rerender(
    <AccountsLedgerPage
      invoices={[houseInvoice, otherInvoice]}
      highlightInvoiceId="invoice-2"
      onOpenDocument={jest.fn()}
    />,
  );
  expect(openInvoiceFolio).toHaveBeenCalledTimes(1);
});

it('fires once per id, so closing the folio does not reopen it on the next render', () => {
  const { rerender } = render(
    <AccountsLedgerPage
      invoices={[houseInvoice, otherInvoice]}
      highlightInvoiceId="invoice-2"
      onOpenDocument={jest.fn()}
    />,
  );
  rerender(
    <AccountsLedgerPage
      invoices={[houseInvoice, otherInvoice]}
      highlightInvoiceId="invoice-2"
      onOpenDocument={jest.fn()}
    />,
  );

  expect(openInvoiceFolio).toHaveBeenCalledTimes(1);
});

it('opens nothing when the doorway names no invoice', () => {
  render(<AccountsLedgerPage invoices={[houseInvoice]} onOpenDocument={jest.fn()} />);

  expect(openInvoiceFolio).not.toHaveBeenCalled();
});

it('opens nothing when the named invoice is not in this studio book', () => {
  render(
    <AccountsLedgerPage
      invoices={[houseInvoice]}
      highlightInvoiceId="invoice-absent"
      onOpenDocument={jest.fn()}
    />,
  );

  expect(openInvoiceFolio).not.toHaveBeenCalled();
});
