import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';
import { InvoiceFolio } from '../invoice-folio';

const mockIssue = jest.fn();
const mockSend = jest.fn();
const mockRecordPayment = jest.fn();
const mockVoid = jest.fn();
const mockReconcileCheckout = jest.fn();
const mockRefetch = jest.fn();
const mockInvalidateQueries = jest.fn();

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
let mockInvoice: Invoice = invoice;

jest.mock('@patina/supabase', () => ({
  useInvoice: () => ({
    data: mockInvoice,
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
  }),
  useIssueInvoice: () => ({ mutateAsync: mockIssue, isPending: false }),
  useSendInvoice: () => ({ mutateAsync: mockSend, isPending: false }),
  useRecordPayment: () => ({
    mutateAsync: mockRecordPayment,
    isPending: false,
  }),
  useVoidInvoice: () => ({ mutateAsync: mockVoid, isPending: false }),
}));

jest.mock(
  '@/hooks/use-invoice-checkout-reconciliation',
  () => ({
    useReconcileInvoiceCheckout: () => ({
      mutateAsync: mockReconcileCheckout,
      isPending: false,
    }),
  }),
  { virtual: true },
);

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

describe('InvoiceFolio delivery recovery', () => {
  beforeEach(() => {
    mockInvoice = invoice;
    jest.clearAllMocks();
    mockRefetch.mockResolvedValue({ data: invoice });
  });

  it('reconciles a pending card session and re-derives the fresh payment before invalidating', async () => {
    const pendingPayment = {
      id: 'payment-1',
      invoice_id: invoice.id,
      amount_cents: invoice.total_cents,
      surcharge_cents: 750,
      method: 'stripe' as const,
      status: 'pending' as const,
      reference: null,
      note: null,
      received_at: null,
      recorded_by: 'client-1',
      checkout_attempt_id: 'attempt-1',
      stripe_checkout_session_id: 'cs_paid_card',
      stripe_payment_intent_id: null,
      stripe_payment_method_type: null,
      stripe_event_id: null,
      created_at: '2026-08-07T02:45:44.000Z',
      updated_at: '2026-08-07T02:45:44.000Z',
    };
    mockInvoice = {
      ...invoice,
      status: 'sent',
      invoice_number: 'INV-1045',
      payments: [pendingPayment],
    };
    mockReconcileCheckout.mockResolvedValue({ status: 'confirmed' });
    mockRefetch.mockResolvedValue({
      data: {
        ...mockInvoice,
        status: 'paid',
        amount_paid_cents: invoice.total_cents,
        payments: [{ ...pendingPayment, status: 'succeeded' as const }],
      },
    });

    render(<InvoiceFolio invoiceId="invoice-1" />);

    await waitFor(() =>
      expect(mockReconcileCheckout).toHaveBeenCalledWith({
        invoiceId: 'invoice-1',
        sessionId: 'cs_paid_card',
      }),
    );
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['document-state'] });
  });

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

  it('does not offer a portal URL to an unlinked household', async () => {
    mockInvoice = { ...invoice, client_id: null, client: undefined };
    mockIssue.mockResolvedValue({
      ...mockInvoice,
      status: 'sent',
      invoice_number: 'INV-1043',
    });
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    await waitFor(() =>
      expect(screen.getByText(/has no linked portal account/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: /invoices\/invoice-1/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy client link/i })).not.toBeInTheDocument();
  });

  it('uses the authoritative project client for a legacy nullable-client invoice', async () => {
    mockInvoice = {
      ...invoice,
      client_id: null,
      client: undefined,
      project: {
        id: 'project-1',
        name: 'Lake House',
        client_id: 'client-1',
        client: {
          id: 'client-1',
          full_name: 'Client Example',
          email: 'client@example.com',
        },
      },
    };
    mockIssue.mockResolvedValue({
      ...mockInvoice,
      status: 'sent',
      invoice_number: 'INV-1043',
    });
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    expect(
      await screen.findByRole('link', {
        name: 'http://localhost:3002/invoices/invoice-1',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/has no linked portal account/i)).not.toBeInTheDocument();
  });

  it('announces clipboard failure instead of silently resetting the button', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
    });
    mockIssue.mockResolvedValue({
      ...invoice,
      status: 'sent',
      invoice_number: 'INV-1044',
    });
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    const copy = await screen.findByRole('button', { name: 'Copy client link' });
    fireEvent.click(copy);
    expect(
      await screen.findByRole('button', { name: 'Copy failed — select the link above' }),
    ).toBeInTheDocument();
  });
});
