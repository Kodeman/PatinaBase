/**
 * R-BV — THE MINTED ADDRESS SURVIVES THE ACTS AROUND IT.
 *
 * The folio's other suite mocks `@patina/supabase` wholesale, which is fine for
 * copy and act shape and useless for this question: a module mock has no query
 * cache, so it cannot see an invalidation evict anything. THIS suite does not
 * mock the package. The real `useInvoiceLink`, `useRegenerateInvoiceLink` and
 * `useSendInvoice` run against a stub Supabase client and a real
 * QueryClientProvider, so the chain under test is the shipped one:
 *
 *   get_invoice_link answers `token: NULL` (00636's frozen column)
 *     → mint: regenerate_invoice_link returns the raw token once
 *       → Resend: useSendInvoice.onSuccess runs invalidateInvoiceEffects
 *         → the address is STILL on screen and still copyable.
 *
 * Before R-BV the last step failed: the address lived in
 * `['invoice-link', invoiceId]`, the invalidation refetched it, and the refetch
 * could only come back address-less — so Copy unmounted one click after the
 * folio printed "This address is shown once."
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { InvoiceFolio } from '../invoice-folio';

const LINK_TOKEN = 'c'.repeat(64);
const PAY_URL = `http://localhost:3002/pay/${LINK_TOKEN}`;

const rpc = jest.fn();
const invoke = jest.fn();

const sentInvoice = {
  id: 'invoice-1',
  project_id: 'project-1',
  designer_id: 'designer-1',
  client_id: 'client-1',
  invoice_number: 'INV-2001',
  title: null,
  status: 'sent',
  issue_date: '2026-09-01',
  due_date: '2026-09-15',
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
  project: { id: 'project-1', name: 'Lake House' },
  client: { id: 'client-1', full_name: 'Client Example', email: 'client@example.com' },
  line_items: [],
  payments: [],
};

/**
 * A PostgREST builder that answers one payload however it is chained, and is
 * itself awaitable — which covers both shapes the folio's reads use
 * (`.eq().maybeSingle()` and `.eq().in().order()`).
 */
function builder(payload: unknown) {
  const chain: Record<string | symbol, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: payload, error: null }).then(resolve);
      }
      return () => proxy;
    },
  });
  return proxy;
}

jest.mock('@patina/supabase/client', () => ({
  createBrowserClient: () => ({
    from: (table: string) => builder(table === 'invoices' ? sentInvoice : []),
    rpc: (name: string, args: unknown) => rpc(name, args),
    functions: { invoke: (name: string, args: unknown) => invoke(name, args) },
  }),
}));

function renderFolio() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceFolio invoiceId="invoice-1" />
    </QueryClientProvider>,
  );
}

describe('the minted invoice address (R-BV)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 00636: the stored value is a hash, so the reader has no address to give.
    rpc.mockImplementation(async (name: string) => {
      if (name === 'get_invoice_link') {
        return { data: { token: null, status: 'active', expires_at: null }, error: null };
      }
      if (name === 'regenerate_invoice_link') {
        return { data: LINK_TOKEN, error: null };
      }
      return { data: null, error: null };
    });
    invoke.mockResolvedValue({
      data: {
        ok: true,
        invoiceId: 'invoice-1',
        recipient: 'client@example.com',
        emailSent: true,
        suppressed: false,
      },
      error: null,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it('survives the invalidation a send fires, and is still the address on the clipboard', async () => {
    renderFolio();

    // The real read, through the real hook: a live link with no readable
    // address, so Copy is absent and Regenerate stands.
    expect(await screen.findByRole('button', { name: 'Regenerate link' })).toBeEnabled();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('get_invoice_link', { p_invoice_id: 'invoice-1' }),
    );
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();

    // The mint — the one moment the address is readable.
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace the link' }));
    expect(await screen.findByRole('button', { name: 'Copy link' })).toBeEnabled();
    expect(
      screen.getByText(/This address is shown once\. Copy it now/i),
    ).toBeInTheDocument();

    const readsBeforeSend = rpc.mock.calls.filter(
      ([name]) => name === 'get_invoice_link',
    ).length;

    // Resend: its onSuccess runs invalidateInvoiceEffects against the REAL
    // cache. This is the click that used to empty the folio's address.
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resend email' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('invoice-send', expect.anything()));
    await screen.findByText(/emailed client@example.com/i);

    // Whatever the link query did, the address did not come from it.
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PAY_URL),
    );

    // And the link key is no longer invalidated at all (R-BV): the send fired
    // no fresh get_invoice_link read.
    const readsAfterSend = rpc.mock.calls.filter(
      ([name]) => name === 'get_invoice_link',
    ).length;
    expect(readsAfterSend).toBe(readsBeforeSend);
  });
});
