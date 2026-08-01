import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';
import { InvoiceFolio } from '../invoice-folio';

const mockIssue = jest.fn();
const mockSend = jest.fn();
const mockRecordPayment = jest.fn();
const mockVoid = jest.fn();

const invoice: Invoice = {
  id: 'invoice-1',
  project_id: 'project-1',
  designer_id: 'designer-1',
  client_id: 'client-1',
  invoice_number: null,
  status: 'draft',
  issue_date: null,
  due_date: null,
  payment_terms_days: 14,
  currency: 'USD',
  subtotal_cents: 25_000,
  tax_rate: 0,
  tax_cents: 0,
  total_cents: 25_000,
  amount_paid_cents: 0,
  memo: null,
  internal_notes: null,
  stripe_checkout_session_id: null,
  sent_at: null,
  paid_at: null,
  voided_at: null,
  void_reason: null,
  reminder_count: 0,
  last_reminder_at: null,
  ar_flagged_at: null,
  ar_last_chased_at: null,
  created_at: '2026-07-31T12:00:00.000Z',
  updated_at: '2026-07-31T12:00:00.000Z',
  project: { id: 'project-1', name: 'Lake House' },
  client: {
    id: 'client-1',
    full_name: 'Client Example',
    email: 'client@example.com',
  },
  line_items: [],
  payments: [],
};

jest.mock('@patina/supabase', () => ({
  useInvoice: () => ({ data: invoice, isLoading: false }),
  useIssueInvoice: () => ({ mutateAsync: mockIssue, isPending: false }),
  useSendInvoice: () => ({ mutateAsync: mockSend, isPending: false }),
  useRecordPayment: () => ({
    mutateAsync: mockRecordPayment,
    isPending: false,
  }),
  useVoidInvoice: () => ({ mutateAsync: mockVoid, isPending: false }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

describe('InvoiceFolio delivery recovery', () => {
  it('keeps the issued invoice reachable when email delivery fails', async () => {
    mockIssue.mockResolvedValue({
      ...invoice,
      status: 'sent',
      invoice_number: 'INV-1042',
    });
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', {
      name: 'Issue & send',
    });
    fireEvent.click(confirmations[confirmations.length - 1]);

    await waitFor(() =>
      expect(screen.getByText(/Could not send — issued as INV-1042/)).toBeInTheDocument(),
    );

    const fallback = screen.getByRole('link', {
      name: 'http://localhost:3002/invoices/invoice-1',
    });
    expect(fallback).toHaveAttribute('href', 'http://localhost:3002/invoices/invoice-1');
    expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument();
  });
});
