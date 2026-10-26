/**
 * US-36 R1 — a refused reminder on the Receivables page says what happened in
 * the Accounts book's words (the billing refusal table), never invoice-send's
 * code or the detail it throws, and leads with 'Could not', which inks it as a
 * failure rather than a confirmation.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ArAging, Invoice } from '@patina/supabase';
import { AccountsReceivablesPage } from '../accounts-receivables-page';

jest.mock('../invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
  openInvoiceFolio: jest.fn(),
}));

const mockSend = jest.fn();
const mockChase = jest.fn();

jest.mock('@patina/supabase', () => ({
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
  useSendInvoice: () => ({ mutateAsync: mockSend, isPending: false }),
  useChaseInvoice: () => ({ mutateAsync: mockChase, isPending: false }),
  invoiceDaysOverdue: () => 18,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const overdue = {
  id: 'invoice-1',
  project_id: 'project-1',
  designer_id: 'designer-1',
  client_id: 'client-1',
  client: { id: 'client-1', full_name: 'Fictional client', email: 'client@example.test' },
  invoice_number: 'INV-0030',
  title: null,
  status: 'sent',
  due_date: '2026-08-18',
  currency: 'USD',
  total_cents: 912_500,
  amount_paid_cents: 0,
  reminder_count: 0,
  ar_flagged_at: null,
  ar_last_chased_at: null,
  project: { id: 'project-1', name: 'Hollis House' },
} as unknown as Invoice;

const aging = {
  openInvoices: [overdue],
  buckets: [],
  totalBalanceCents: overdue.total_cents,
} as unknown as ArAging;

beforeEach(() => {
  mockSend.mockReset();
  mockChase.mockReset().mockResolvedValue(undefined);
});

it.each([
  [
    // invoice-send's 409 detail, which useSendInvoice throws in place of invoice_not_open.
    'Reminders can only be sent on open (sent or partially paid) invoices.',
    'Could not send the reminder — Only an open invoice can receive a reminder.',
  ],
  ['no_recipient', 'Could not send the reminder — This invoice has no client email yet. Add their email, then send it.'],
])('says the refused reminder %s in the book’s words', async (raw, said) => {
  mockSend.mockRejectedValue(new Error(raw));

  render(<AccountsReceivablesPage aging={aging} highlightInvoiceId={null} onOpenDocument={jest.fn()} />);
  const row = screen.getByText(/Invoice INV-0030/).closest('li') as HTMLElement;
  fireEvent.click(within(row).getByRole('button', { name: 'Send reminder' }));

  // 'Could not' leads the note: the row inks it as a failure, not the sage of
  // a reminder that went out (jsdom drops var() colours, so the words carry it).
  expect(await within(row).findByText(said)).toBeInTheDocument();
  expect(row).not.toHaveTextContent(raw);
  expect(mockChase).not.toHaveBeenCalled();
});
