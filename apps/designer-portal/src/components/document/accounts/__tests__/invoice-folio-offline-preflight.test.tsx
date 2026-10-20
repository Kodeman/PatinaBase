/**
 * SQ-1249 — the folio's Send on a draft, under the app's own QueryClient
 * defaults (networkMode 'online': an offline read pauses and resumes on
 * reconnect) and the real useSendInvoice.
 *
 * F3: offline at the press refuses before the fresh recipient read; a drop
 * while that read is out expires the act; neither ever resumes into an issue
 * or a send after reconnect.
 * F4: once pressed the act is committed — never mind stands disabled — and a
 * folio closed mid-read issues and sends nothing.
 * F2: the issue rides invoice-send (issue: true), so the server binds the
 * recipient it resolves to the issue; the folio says what the server did.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import type { Invoice } from '@patina/supabase';
import { nextSubjectQueryClient } from '@/lib/react-query';
import { InvoiceFolio } from '../invoice-folio';

const mockInvoke = jest.fn();
const mockRefetch = jest.fn();

const mockInvoice: Invoice = {
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
  // Her Patina account carries no email, so the address is the household's.
  client: { id: 'client-1', full_name: 'Elena Reyes', email: '' },
  line_items: [],
  payments: [],
};

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

// useSendInvoice is the real hook: its 'send' act meets the app's MutationCache.
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useSessionUserId: () => 'designer-1',
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
  useInvoice: () => ({ data: mockInvoice, isLoading: false, isError: false, refetch: mockRefetch }),
  useRecordPayment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVoidInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInvoiceLink: () => ({ data: null }),
  useRegenerateInvoiceLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useClientInvitationStatus: () => ({ data: null, isLoading: false, isError: false }),
  useInviteAndLinkClient: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
}));

jest.mock(
  '@/hooks/use-invoice-checkout-reconciliation',
  () => ({
    useReconcileInvoiceCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  }),
  { virtual: true },
);

jest.mock('../../people/directory/client-letter-line', () => ({
  ClientLetterLine: () => null,
}));

jest.mock('@/hooks/use-attach-client', () => ({
  useAttachDocumentClient: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => null,
}));

// ── The household's designer_clients row, behind the browser client singleton ──
const household = {
  id: 'dc-1',
  designer_id: 'designer-1',
  client_id: 'client-1',
  lead_id: null,
  client_name: 'Elena Reyes',
  client_email: 'elena@example.com',
  client_phone: null,
  notes: null,
  status: 'active',
  created_at: '2026-07-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  client: { id: 'client-1', email: '', full_name: 'Elena Reyes', avatar_url: null, phone: null },
};
/** How the next designer_clients read answers: at once, or when released. */
let readMode: 'answer' | 'deferred' = 'answer';
let reads = 0;
let deferred: Array<() => void> = [];
const releaseReads = () => {
  const held = deferred;
  deferred = [];
  held.forEach((answer) => answer());
};

function designerClients() {
  const answer = () => {
    reads += 1;
    const row = { data: { ...household }, error: null };
    if (readMode === 'deferred') return new Promise((resolve) => deferred.push(() => resolve(row)));
    return Promise.resolve(row);
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: answer,
    single: answer,
  };
  return builder;
}

const browser = globalThis as { __supabaseBrowserClient?: unknown };

let qc: QueryClient;
const renderFolio = () =>
  render(
    <QueryClientProvider client={qc}>
      <div data-spotlight-frame="">
        <InvoiceFolio invoiceId="invoice-1" />
      </div>
    </QueryClientProvider>,
  );
const sendAct = () => screen.getAllByRole('button', { name: 'Issue & send' })[0];
const confirmAct = () => {
  const acts = screen.getAllByRole('button', { name: 'Issue & send' });
  return acts[acts.length - 1];
};
const neverMind = () => screen.getByRole('button', { name: 'Never mind' });
/** Let a reconnect's paused reads resume, and anything they would continue into run. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const offline = 'Could not issue — You’re offline. Nothing was sent.';

/** The folio has read its recipient; the send panel is open on its confirm. */
async function openSendPanel() {
  await waitFor(() => expect(sendAct()).not.toHaveAttribute('aria-disabled'));
  fireEvent.click(sendAct());
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Issue & send' })).toHaveLength(2));
}

const sent = {
  ok: true,
  invoiceId: 'invoice-1',
  recipient: 'elena@example.com',
  emailSent: true,
  suppressed: false,
  issued: true,
  invoiceNumber: 'INV-1072',
};
/** A non-2xx invoice-send, as supabase-js hands it back. */
const refused = (body: Record<string, unknown>) => ({
  data: null,
  error: {
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => body },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  qc = nextSubjectQueryClient();
  readMode = 'answer';
  reads = 0;
  deferred = [];
  mockRefetch.mockImplementation(async () => ({ data: mockInvoice, isError: false }));
  mockInvoke.mockResolvedValue({ data: sent, error: null });
  browser.__supabaseBrowserClient = {
    from: () => designerClients(),
    functions: { invoke: mockInvoke },
  };
});
afterEach(() => {
  act(() => onlineManager.setOnline(true));
  qc.clear();
  delete browser.__supabaseBrowserClient;
});

describe('SQ-1249 F3: an offline Send never resumes into an issue', () => {
  it('offline at the press, Send refuses before its fresh read, and reconnecting issues and sends nothing', async () => {
    renderFolio();
    await openSendPanel();
    const before = reads;

    act(() => onlineManager.setOnline(false));
    fireEvent.click(confirmAct());

    expect(await screen.findByText(offline)).toBeInTheDocument();
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(reads).toBe(before);

    act(() => onlineManager.setOnline(true));
    await settle();
    await settle();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });

  it('the connection dropping while the fresh read is out expires the act; reconnecting never resumes it', async () => {
    renderFolio();
    await openSendPanel();
    readMode = 'deferred';

    fireEvent.click(confirmAct());
    await waitFor(() => expect(deferred).toHaveLength(1));
    act(() => onlineManager.setOnline(false));

    expect(await screen.findByText(offline)).toBeInTheDocument();

    act(() => onlineManager.setOnline(true));
    readMode = 'answer';
    act(() => releaseReads());
    await settle();
    await settle();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('SQ-1249 F4: a pressed Send is committed to its folio', () => {
  it('never mind stands disabled while the fresh read is out, then the send goes once', async () => {
    renderFolio();
    await openSendPanel();
    readMode = 'deferred';

    fireEvent.click(confirmAct());
    await waitFor(() => expect(deferred).toHaveLength(1));
    expect(neverMind()).toBeDisabled();

    // The household read that follows answers at once.
    readMode = 'answer';
    act(() => releaseReads());
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
  });

  it('a folio closed mid-read issues and sends nothing when the read lands', async () => {
    const { unmount } = renderFolio();
    await openSendPanel();
    readMode = 'deferred';

    fireEvent.click(confirmAct());
    await waitFor(() => expect(deferred).toHaveLength(1));
    unmount();

    // The household read that follows answers at once, as on a live folio.
    readMode = 'answer';
    act(() => releaseReads());
    await settle();
    await settle();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('SQ-1249 F2: the issue rides invoice-send', () => {
  it('control: Send on a draft is one invoice-send request with issue: true, and says the number it took', async () => {
    renderFolio();
    await openSendPanel();

    fireEvent.click(confirmAct());

    expect(await screen.findByText('Invoice INV-1072 issued · emailed elena@example.com')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('invoice-send', {
      body: { invoiceId: 'invoice-1', message: undefined, type: undefined, issue: true },
    });
  });

  it('a letter that fails after the server issued says the number it took, and to resend', async () => {
    mockInvoke.mockResolvedValue(
      refused({ error: 'send_failed', detail: 'provider down', issued: true, invoiceNumber: 'INV-1072' }),
    );
    renderFolio();
    await openSendPanel();

    fireEvent.click(confirmAct());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^Could not send — issued as INV-1072\. .+ Resend to retry\.$/);
  });

  it('no address on the server’s own read: nothing was issued, and the folio says so', async () => {
    mockInvoke.mockResolvedValue(refused({ error: 'no_recipient' }));
    renderFolio();
    await openSendPanel();

    fireEvent.click(confirmAct());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Could not issue — This invoice has no client email yet. Add their email, then send it.',
    );
    expect(alert).not.toHaveTextContent(/issued as/);
  });
});

describe('SQ-1262 F3: a Send whose answer is lost may have issued', () => {
  const unknown =
    'Could not tell whether this invoice issued — no answer came back. Check the folio before you send it again.';
  /** The invoice and money reads the folio would re-read, as cached before the press. */
  const cached = [['invoices', 'invoice-1'], ['project-financials', 'project-1'], ['project-payment-milestones', 'project-1']];
  const seedReads = () => cached.forEach((key) => qc.setQueryData(key, { cached: true }));
  const invalidated = () => cached.filter((key) => qc.getQueryState(key)?.isInvalidated).length;

  const lost: Array<[string, () => unknown]> = [
    [
      'the request never came back (FunctionsFetchError)',
      () => ({
        data: null,
        error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('Failed to fetch') },
      }),
    ],
    [
      'a 5xx that is not invoice-send’s JSON (a gateway timeout page)',
      () => ({
        data: null,
        error: {
          name: 'FunctionsHttpError',
          message: 'Edge Function returned a non-2xx status code',
          context: {
            json: async () => {
              throw new SyntaxError('Unexpected token < in JSON at position 0');
            },
          },
        },
      }),
    ],
    [
      'a 5xx whose JSON is not invoice-send’s own (no error named)',
      () => refused({ code: 'WORKER_LIMIT', message: 'Function failed due to not having enough compute resources' }),
    ],
  ];

  for (const [label, response] of lost) {
    it(`${label}: the folio re-reads the invoice and says the outcome is unknown, never "Could not issue"`, async () => {
      mockInvoke.mockResolvedValue(response());
      renderFolio();
      await openSendPanel();
      seedReads();

      fireEvent.click(confirmAct());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(unknown);
      expect(alert).not.toHaveTextContent(/Could not issue/);
      expect(invalidated()).toBe(cached.length);
    });
  }

  it('control: invoice-send’s own pre-issue refusal is definite — "Could not issue", and nothing is re-read', async () => {
    mockInvoke.mockResolvedValue(refused({ error: 'lookup_failed' }));
    renderFolio();
    await openSendPanel();
    seedReads();

    fireEvent.click(confirmAct());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Could not issue — The invoice couldn't be loaded. Reload the folio and try again.");
    expect(alert).not.toHaveTextContent(unknown);
    expect(invalidated()).toBe(0);
  });
});
