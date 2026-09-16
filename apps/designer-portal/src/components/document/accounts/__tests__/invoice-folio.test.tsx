import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';
import { InvoiceFolio } from '../invoice-folio';

const mockIssue = jest.fn();
const mockSend = jest.fn();
const mockRecordPayment = jest.fn();
const mockVoid = jest.fn();
const mockReconcileCheckout = jest.fn();
const mockReconcileOptions = jest.fn();
const mockRefetch = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRegenerateLink = jest.fn();

/** The 64-hex shape ensure_invoice_link (00574) emits. */
const LINK_TOKEN = 'a'.repeat(64);
const PAY_URL = `http://localhost:3002/pay/${LINK_TOKEN}`;
/**
 * THE DEFAULT IS NULL, BECAUSE THE DATABASE'S IS (W4 r4 MAJOR-1).
 *
 * 00636 froze `invoices.token`: `get_invoice_link` answers `token: NULL` for
 * every invoice, and `parseInvoiceLink` reads that as no link. A suite whose
 * default mock hands back a live token models 00574's world, not this one —
 * which is why eleven cases stayed green while both link acts were unreachable
 * on every invoice in production. A test that wants an address mints one, the
 * way the folio does.
 */
let mockInvoiceLink: {
  token: string | null;
  status: 'active' | 'closed';
  expiresAt?: string | null;
} | null = null;

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

let mockEmailDeliveryByRef: Record<string, unknown> = {};

jest.mock('@patina/supabase', () => ({
  useEmailDelivery: () => ({
    byRef: mockEmailDeliveryByRef,
    isLoading: false,
    isError: false,
  }),
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
  // The real rule, restated: status first, then the clock (packages/supabase
  // use-invoices.ts `invoiceLinkIsLive`, covered by its own suite). The band
  // asks THIS, not whether an address can be read — which is the whole of
  // W4 r6 M-1.
  invoiceLinkIsLive: (
    link: { status?: string; expiresAt?: string | null } | null | undefined,
  ) => {
    if (!link || link.status !== 'active') return false;
    if (!link.expiresAt) return true;
    const expires = new Date(link.expiresAt).getTime();
    return Number.isNaN(expires) ? true : expires > Date.now();
  },
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
    useReconcileInvoiceCheckout: (options?: unknown) => {
      mockReconcileOptions(options);
      return {
        mutateAsync: mockReconcileCheckout,
        isPending: false,
      };
    },
  }),
  { virtual: true },
);

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

describe('InvoiceFolio delivery recovery', () => {
  beforeEach(() => {
    mockInvoice = invoice;
    mockEmailDeliveryByRef = {};
    mockInvoiceLink = null;
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

  it('asks for the inline error surface, so a failure never reaches the global toast', () => {
    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(mockReconcileOptions).toHaveBeenCalledWith({ errorSurface: 'inline' });
  });

  it('renders a failed reconcile inline with the function message, not a toast', async () => {
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
    // What the hook now throws once it unwraps a FunctionsHttpError body,
    // instead of the generic "Edge Function returned a non-2xx status code".
    mockReconcileCheckout.mockRejectedValue(new Error('invoice_not_found'));

    render(<InvoiceFolio invoiceId="invoice-1" />);

    await waitFor(() =>
      expect(
        screen.getByText(/Could not confirm the card payment — invoice_not_found/),
      ).toBeInTheDocument(),
    );
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it('keeps the issued invoice reachable when email delivery fails', async () => {
    // An address already minted on this invoice (the only way one exists:
    // `useRegenerateInvoiceLink`'s setQueryData — see the default above).
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
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
    // An address already minted on this invoice (the only way one exists:
    // `useRegenerateInvoiceLink`'s setQueryData — see the default above).
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
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
    // An address already minted on this invoice (the only way one exists:
    // `useRegenerateInvoiceLink`'s setQueryData — see the default above).
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
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
    // An address already minted on this invoice (the only way one exists:
    // `useRegenerateInvoiceLink`'s setQueryData — see the default above).
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
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
    // An address already minted on this invoice (the only way one exists:
    // `useRegenerateInvoiceLink`'s setQueryData — see the default above).
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
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

  it('offers Copy link and Regenerate link on an issued invoice that has an address', () => {
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1050' };
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
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
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };

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

  /* ── W4 r4 MAJOR-1: the mint is the only door, so it may not be behind
     the door ─────────────────────────────────────────────────────────────
     Since 00636 froze `invoices.token`, issuing mints an address the studio
     cannot READ: `get_invoice_link` answers NULL and `useInvoiceLink` parses
     it as no link. The folio's job is therefore to keep Regenerate standing
     on the invoice's own status, so the designer has a way to mint one she
     can copy. These cases model the real chain: issue → Regenerate visible,
     Copy absent → press → setQueryData lands the token → Copy appears. */

  it('offers Regenerate on a freshly issued invoice the database answers no token for', async () => {
    // The real read: 00636 nulls the column, so a load after issue parses to
    // null however the send went.
    mockIssue.mockImplementation(async () => {
      mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1060' };
      return mockInvoice;
    });
    mockSend.mockResolvedValue({ emailSent: true, recipient: 'client@example.com' });

    render(<InvoiceFolio invoiceId="invoice-1" />);
    expect(screen.queryByRole('button', { name: 'Regenerate link' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    const regenerate = await screen.findByRole('button', { name: 'Regenerate link' });
    expect(regenerate).toBeEnabled();
    // No address to copy yet — and no greyed act standing in for one (R51/R83).
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
  });

  it('brings Copy link up once Regenerate has minted an address', async () => {
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1060' };
    // What `useRegenerateInvoiceLink.onSuccess` does: setQueryData puts the
    // freshly minted token into ['invoice-link', id]. Nothing else can.
    mockRegenerateLink.mockImplementation(async () => {
      mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
      return mockInvoiceLink;
    });

    render(<InvoiceFolio invoiceId="invoice-1" />);
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace the link' }));

    const copy = await screen.findByRole('button', { name: 'Copy link' });
    expect(copy).toBeEnabled();
  });

  it('points the recovery band at Regenerate, never at a resend that cannot mint', async () => {
    mockIssue.mockImplementation(async () => {
      mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1061' };
      return mockInvoice;
    });
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    // The instruction has to be one the designer can carry out: resending
    // mints a token only the letter ever sees.
    expect(
      await screen.findByText(/Regenerate link, above, mints one you can send them\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Resend the invoice to try again/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate link' })).toBeEnabled();
  });

  it('gives the recovery band the address once the invoice has one', async () => {
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
    mockIssue.mockImplementation(async () => ({
      ...invoice,
      status: 'sent',
      invoice_number: 'INV-1061',
    }));
    mockSend.mockRejectedValue(new Error('provider unavailable'));

    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);

    // Not the "no link yet" else-branch.
    expect(await screen.findByRole('link', { name: PAY_URL })).toBeInTheDocument();
    expect(screen.queryByText(/this invoice has no link yet/i)).not.toBeInTheDocument();
  });

  /* ── W4 r6 M-1: the band says which of three things is TRUE ────────────
     The band mounts only from `doIssueAndSend`, and `invoice-send` mints a
     link (via ensure_invoice_link) before it attempts the send — so on every
     invoice this band can appear on, a link EXISTS. "This invoice has no link
     yet" was false there, and it sent the designer to Regenerate, which kills
     the address the household may already hold. These three cases pin the
     sentence to the link's existence and its clock, never to whether the
     address can be read back. */

  const mountBandOnFailedSend = async () => {
    mockIssue.mockImplementation(async () => ({
      ...invoice,
      status: 'sent',
      invoice_number: 'INV-1063',
    }));
    mockSend.mockRejectedValue(new Error('provider unavailable'));
    render(<InvoiceFolio invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
    const confirmations = screen.getAllByRole('button', { name: 'Issue & send' });
    fireEvent.click(confirmations[confirmations.length - 1]);
  };

  it('tells the truth about a live link whose address cannot be shown again', async () => {
    // The shape every production row has after 00636: the link is alive, the
    // token is frozen NULL, so there is nothing to copy.
    mockInvoiceLink = { token: null, status: 'active', expiresAt: '2099-01-01T00:00:00.000Z' };

    await mountBandOnFailedSend();

    expect(
      await screen.findByText(/Patina cannot show you its address again/i),
    ).toBeInTheDocument();
    // The consequence of the act it recommends, said on the same surface as
    // the act — the Regenerate panel already says the old link dies.
    expect(screen.getByText(/the address already sent stops working/i)).toBeInTheDocument();
    expect(screen.queryByText(/has no link yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/has no live link/i)).not.toBeInTheDocument();
  });

  it('says no live link only when there is none', async () => {
    mockInvoiceLink = null;

    await mountBandOnFailedSend();

    expect(await screen.findByText(/this invoice has no live link/i)).toBeInTheDocument();
    expect(screen.queryByText(/cannot show you its address again/i)).not.toBeInTheDocument();
  });

  it('names an expired link as expired rather than as a link that never existed', async () => {
    mockInvoiceLink = { token: null, status: 'active', expiresAt: '2020-01-01T00:00:00.000Z' };

    await mountBandOnFailedSend();

    expect(await screen.findByText(/link has expired/i)).toBeInTheDocument();
    expect(screen.queryByText(/has no live link/i)).not.toBeInTheDocument();
  });

  it('prints the shown-once sentence beside Copy link at the mint, and only there', async () => {
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1064' };
    mockRegenerateLink.mockImplementation(async () => {
      mockInvoiceLink = { token: LINK_TOKEN, status: 'active', expiresAt: null };
      return mockInvoiceLink;
    });

    render(<InvoiceFolio invoiceId="invoice-1" />);
    // Before the mint there is no address, so no promise about one.
    expect(screen.queryByText(/This address is shown once/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace the link' }));

    expect(await screen.findByRole('button', { name: 'Copy link' })).toBeEnabled();
    expect(screen.getByText(/This address is shown once\. Copy it now/i)).toBeInTheDocument();
  });

  /* ── F7: two copy sites, two statuses ─────────────────────────────────── */

  it('keeps the two copy sites\u2019 statuses apart', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
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

  it('withholds Copy while the invoice has no address, and keeps Regenerate standing', () => {
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1063' };
    mockInvoiceLink = null;

    render(<InvoiceFolio invoiceId="invoice-1" />);

    // Copy has nothing to copy, so it is absent rather than greyed (R51/R83).
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    // Regenerate is the act that ENDS this state, so it may not depend on it.
    expect(screen.getByRole('button', { name: 'Regenerate link' })).toBeEnabled();
    // Print still stands — it does not depend on the link. It is a link now,
    // not a button: it opens the print route in a new tab.
    expect(screen.getByRole('link', { name: /^Print \/ Save PDF/ })).toBeInTheDocument();
  });

  it('opens the print route in a new tab rather than printing the folio in place', () => {
    mockInvoice = { ...invoice, status: 'sent', invoice_number: 'INV-1063' };

    render(<InvoiceFolio invoiceId="invoice-1" />);

    const print = screen.getByRole('link', { name: /^Print \/ Save PDF/ });
    expect(print).toHaveAttribute('href', '/invoices/invoice-1/print');
    expect(print).toHaveAttribute('target', '_blank');
    expect(print).toHaveAttribute('rel', expect.stringContaining('noopener'));
    // The new tab is announced, not just implied by target.
    expect(print).toHaveAccessibleName('Print / Save PDF (opens in a new tab)');
  });
});

/**
 * 00591 — the folio is where the reader CAME to ask, so the word speaks in
 * every state (`mode="all"`), and carries the remedy only where there is one.
 */
describe('InvoiceFolio · what became of the mail', () => {
  const sentInvoice = { ...invoice, status: 'sent' as const, invoice_number: 'INV-1070' };

  const log = (over: Record<string, unknown> = {}) => ({
    logId: 'log-1',
    refId: 'invoice-1',
    recipient: 'client@example.com',
    state: 'bounced',
    status: 'bounced',
    sentAt: '2026-09-08T14:00:00.000Z',
    deliveredAt: null,
    bouncedAt: '2026-09-09T09:00:00.000Z',
    bounceType: 'permanent',
    bounceReason: 'no such mailbox',
    delayedAt: null,
    lastEvent: 'email.bounced',
    lastEventAt: '2026-09-09T09:00:00.000Z',
    createdAt: '2026-09-08T14:00:00.000Z',
    ...over,
  });

  beforeEach(() => {
    mockInvoice = sentInvoice;
    mockInvoiceLink = { token: LINK_TOKEN, status: 'active' };
    mockEmailDeliveryByRef = {};
    jest.clearAllMocks();
    mockRefetch.mockResolvedValue({ data: sentInvoice });
  });

  it('names the bounce and offers the one remedy that can fix it', () => {
    mockEmailDeliveryByRef = { 'invoice-1': log() };

    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.getByTestId('delivery-word')).toHaveTextContent(
      "Bounced 9 Sept — didn't reach client@example.com",
    );
    expect(
      screen.getByRole('link', { name: 'Fix the address in People' }),
    ).toHaveAttribute('href', '/people');
  });

  it('offers the same remedy for an opted-out address', () => {
    mockEmailDeliveryByRef = {
      'invoice-1': log({
        state: 'suppressed',
        status: 'suppressed',
        bouncedAt: null,
        bounceType: null,
        bounceReason: null,
      }),
    };

    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.getByTestId('delivery-word')).toHaveTextContent(
      'Not sent 9 Sept — client@example.com opted out',
    );
    expect(
      screen.getByRole('link', { name: 'Fix the address in People' }),
    ).toBeInTheDocument();
  });

  it('speaks quietly and offers nothing when the mail landed', () => {
    mockEmailDeliveryByRef = {
      'invoice-1': log({
        state: 'delivered',
        status: 'delivered',
        bouncedAt: null,
        bounceType: null,
        bounceReason: null,
        deliveredAt: '2026-09-08T15:00:00.000Z',
        lastEvent: 'email.delivered',
        lastEventAt: '2026-09-08T15:00:00.000Z',
      }),
    };

    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.getByTestId('delivery-word')).toHaveTextContent('Delivered 8 Sept');
    expect(
      screen.queryByRole('link', { name: 'Fix the address in People' }),
    ).not.toBeInTheDocument();
  });

  it('says nothing about a draft, which has never been mailed', () => {
    mockInvoice = invoice;
    mockEmailDeliveryByRef = {};

    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.queryByTestId('delivery-word')).toBeNull();
  });
});
