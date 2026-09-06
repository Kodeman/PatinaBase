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
const mockRegenerateLink = jest.fn();

/** The 64-hex shape ensure_invoice_link (00574) emits. */
const LINK_TOKEN = 'a'.repeat(64);
const PAY_URL = `http://localhost:3002/pay/${LINK_TOKEN}`;
let mockInvoiceLink: { token: string; status: 'active' | 'closed' } | null = {
  token: LINK_TOKEN,
  status: 'active',
};

const invoice: Invoice = {
  id: 'invoice-1',
  project_id: 'project-1',
  designer_id: 'designer-1',
  client_id: 'client-1',
  invoice_number: null,
  title: null,
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
  useInvoiceLink: () => ({ data: mockInvoiceLink }),
  useRegenerateInvoiceLink: () => ({
    mutateAsync: mockRegenerateLink,
    isPending: false,
  }),
  RegenerateInvoiceLinkError: class RegenerateInvoiceLinkError extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.name = 'RegenerateInvoiceLinkError';
      this.reason = reason;
    }
  },
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
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
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

    // K1 (00574): the recovery address is the invoice's own link, not the
    // signed-in `/invoices/<id>` page.
    const fallback = screen.getByRole('link', { name: PAY_URL });
    expect(fallback).toHaveAttribute('href', PAY_URL);
    expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument();
  });

  it('offers the pay link to an unlinked household, and says where the receipt goes', async () => {
    // Reverses the pre-00574 behaviour: an account-less household was told to
    // go get an account. The link needs none — but with no profile on either
    // side there is no address on file, which is what M5 makes the folio say.
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

    expect(await screen.findByRole('link', { name: PAY_URL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument();
    expect(
      screen.getByText(/receipt goes to the address they give at checkout/i),
    ).toBeInTheDocument();
  });

  it('omits the receipt-at-checkout line when the household has an account', async () => {
    mockIssue.mockResolvedValue({ ...invoice, status: 'sent', invoice_number: 'INV-1044' });
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    expect(await screen.findByRole('link', { name: PAY_URL })).toBeInTheDocument();
    expect(
      screen.queryByText(/receipt goes to the address they give at checkout/i),
    ).not.toBeInTheDocument();
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

    expect(await screen.findByRole('link', { name: PAY_URL })).toBeInTheDocument();
    expect(screen.queryByText(/has no linked portal account/i)).not.toBeInTheDocument();
  });

  it('offers no document doorway on a studio invoice, and issues it with no project', async () => {
    mockInvoice = {
      ...invoice,
      project_id: null,
      project: undefined,
      title: 'Design consultation, September',
    };
    mockIssue.mockResolvedValue({
      ...mockInvoice,
      status: 'sent',
      invoice_number: 'INV-0031',
    });
    mockSend.mockResolvedValue({ emailSent: true, recipient: 'client@example.com' });

    const onOpenDocument = jest.fn();
    render(<InvoiceFolio invoiceId="invoice-1" onOpenDocument={onOpenDocument} />);

    // The head reads household · regarding · status where a house invoice
    // reads household · house · status (R136).
    expect(
      screen.getByText(/Client Example · Design consultation, September · draft/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /document/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    await waitFor(() =>
      expect(mockIssue).toHaveBeenCalledWith({
        invoiceId: 'invoice-1',
        projectId: undefined,
      }),
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'invoice-1', projectId: undefined }),
    );
    expect(onOpenDocument).not.toHaveBeenCalled();
  });

  it('tells a studio invoice the truth about what voiding releases', () => {
    mockInvoice = {
      ...invoice,
      project_id: null,
      project: undefined,
      title: 'Design consultation, September',
    };

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));

    expect(
      screen.getByText(
        'Voiding keeps the number and marks the invoice void. Nothing else is released; a studio invoice holds no milestones or time. This cannot be undone.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/payment milestones and time entries/)).not.toBeInTheDocument();
  });

  it('retires the number and withdraws the letter — the studio folio note after a void', async () => {
    mockInvoice = {
      ...invoice,
      project_id: null,
      project: undefined,
      title: 'Design consultation, September',
    };
    mockVoid.mockResolvedValue(undefined);

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    fireEvent.change(screen.getByLabelText('Void reason'), {
      target: { value: 'duplicate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Void invoice' }));

    expect(
      await screen.findByText('invoice voided · the letter withdrawn, nothing else released'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/milestones and time released/)).not.toBeInTheDocument();
  });

  it('keeps the milestone-and-time note on a house invoice after a void', async () => {
    mockVoid.mockResolvedValue(undefined);

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    fireEvent.change(screen.getByLabelText('Void reason'), {
      target: { value: 'duplicate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Void invoice' }));

    expect(
      await screen.findByText('invoice voided · linked milestones and time released'),
    ).toBeInTheDocument();
  });

  it('keeps the milestone-and-time void copy on a house invoice', () => {
    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));

    expect(
      screen.getByText(
        'Voiding releases any linked payment milestones and time entries so they can be billed again. This cannot be undone.',
      ),
    ).toBeInTheDocument();
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

  // ── The link acts, standing in the folio's own row (00574 · K1) ────────

  it('offers Copy link and Regenerate link on an issued invoice', () => {
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1050' };
    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Regenerate link' })).toBeEnabled();
  });

  it('offers neither link act on a draft', () => {
    mockInvoiceLink = null;
    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate link' })).not.toBeInTheDocument();
  });

  it('offers neither link act on a void invoice', () => {
    mockInvoice = { ...invoice, status: 'void', invoice_number: 'INV-1051' };
    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate link' })).not.toBeInTheDocument();
  });

  it('Copy link writes the pay URL to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1050' };

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PAY_URL));
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });

  it('Regenerate link asks once, naming what the old link becomes', async () => {
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1050' };
    mockRegenerateLink.mockResolvedValue({ token: 'b'.repeat(64), status: 'active' });

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate link' }));

    expect(
      screen.getByText('The old link stops working. Anyone who has it will see a dead page.'),
    ).toBeInTheDocument();
    expect(mockRegenerateLink).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Replace the link' }));

    await waitFor(() =>
      expect(mockRegenerateLink).toHaveBeenCalledWith({ invoiceId: 'invoice-1' }),
    );
    expect(await screen.findByText(/link replaced/i)).toBeInTheDocument();
  });

  it('renders the M11 refusal as prose when a payment is in flight', async () => {
    const { RegenerateInvoiceLinkError } = jest.requireMock('@patina/supabase');
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1050' };
    mockRegenerateLink.mockRejectedValue(
      new RegenerateInvoiceLinkError(
        'checkout_in_progress',
        'A payment is in progress on this invoice. Try again later.',
      ),
    );

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace the link' }));

    expect(
      await screen.findByText(
        /Could not replace — A payment is in progress on this invoice\. Try again later\./,
      ),
    ).toBeInTheDocument();
  });

  /* ── F1: the link exists the moment the invoice is issued ──────────────
     useIssueInvoice invalidates ['invoice-link', id], so the folio's acts
     and its recovery band see the minted link rather than a five-minute
     stale null. Modelled by a mock that has no link until issue resolves. */

  it('shows a live Copy link as soon as the invoice is issued', async () => {
    mockInvoiceLink = null;
    // What the real acts do: issue_invoice mints the link, and invalidating
    // ['invoices'] + ['invoice-link', id] refetches both reads together.
    mockIssue.mockImplementation(async () => {
      mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1060' };
      mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
      return mockInvoice;
    });
    mockSend.mockResolvedValue({ emailSent: true, recipient: 'client@example.com' });

    render(<InvoiceFolio invoiceId="invoice-1" />);
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    const copy = await screen.findByRole('button', { name: 'Copy link' });
    expect(copy).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Regenerate link' })).toBeEnabled();
  });

  it('gives the recovery band the minted link when the send fails on issue', async () => {
    mockInvoiceLink = null;
    mockIssue.mockImplementation(async () => {
      mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
      return { ...invoice, status: 'sent', invoice_number: 'INV-1061' };
    });
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    // Not the "no link yet · resend to try again" else-branch.
    expect(await screen.findByRole('link', { name: PAY_URL })).toBeInTheDocument();
    expect(screen.queryByText(/this invoice has no link yet/i)).not.toBeInTheDocument();
  });

  /* ── F7: two copy sites, two statuses ─────────────────────────────────── */

  it('keeps the two copy sites\u2019 statuses apart', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mockIssue.mockImplementation(async () => {
      mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1062' };
      return mockInvoice;
    });
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    // Both sites are on screen: the toolbar act and the recovery band.
    await screen.findByRole('button', { name: 'Copy client link' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument();
  });

  /* ── F8: no greyed-out act without a reason ───────────────────────────── */

  it('omits both link acts entirely while the invoice has no link', () => {
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1063' };
    mockInvoiceLink = null;

    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate link' })).not.toBeInTheDocument();
    // Print still stands — it does not depend on the link.
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
  });
});
