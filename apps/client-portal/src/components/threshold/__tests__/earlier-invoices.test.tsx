import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';

import { invoiceProjection, type InvoiceRow } from '@/lib/threshold/invoice-rollup';

// ── Boundaries ──────────────────────────────────────────────────────────────
// A row lays in the payment sheet when it opens; the sheet's hooks are the
// module's. The rows and the history fold are what is under test here.

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  InvoiceCheckoutError: class InvoiceCheckoutError extends Error {},
  useInvoicePaymentOptions: jest.fn(),
  useStartCheckout: jest.fn(),
  useNotifyCheckIntent: jest.fn(),
  useStudioIdentity: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: {
    paymentMethodSelected: jest.fn(),
    checkIntentSubmitted: jest.fn(),
    paymentStarted: jest.fn(),
  },
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useStartCheckout,
  useStudioIdentity,
} from '@patina/supabase';
import { clientEvents } from '@/lib/analytics/events';

import {
  InvoiceGroupList,
  invoiceMoney,
  PaymentHistory,
  type InvoiceListState,
} from '../earlier-invoices';

const TODAY = new Date(2026, 7, 5);

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    project_id: 'project-1',
    studio_id: 'studio-1',
    designer_id: 'designer-1',
    invoice_number: 'INV-2026-001',
    title: null,
    status: 'sent',
    currency: 'USD',
    total_cents: 40_000,
    amount_paid_cents: 0,
    due_date: '2026-08-20',
    sent_at: '2026-07-01T10:00:00Z',
    paid_at: null,
    created_at: '2026-07-01T10:00:00Z',
    payments: [],
    ...overrides,
  } as unknown as Invoice;
}

function listState(overrides: Partial<InvoiceListState> = {}): InvoiceListState {
  return {
    openId: null,
    onToggle: jest.fn(),
    onClose: jest.fn(),
    holds: {},
    onHold: jest.fn(),
    checksExpected: {},
    onCheckExpected: jest.fn(),
    checkoutHeldId: null,
    designerName: 'your designer',
    projectName: 'Elm Street House',
    mixedCurrency: false,
    ...overrides,
  };
}

function project(invoices: Invoice[], serverHolds = {}) {
  return invoiceProjection(invoices, { today: TODAY, read: 'complete', serverHolds });
}

/** The list with the letterbox's one-open-row rule, so closing really unmounts the details. */
function OpenableList({ rows, initialOpenId }: { rows: readonly InvoiceRow[]; initialOpenId: string }) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const state = listState({
    openId,
    onToggle: (row) => setOpenId((was) => (was === row.invoice.id ? null : row.invoice.id)),
    onClose: () => setOpenId(null),
  });
  return <InvoiceGroupList testId="to-pay" heading="Invoices to pay" rows={rows} state={state} />;
}

const rowElement = (id: string) => {
  const element = document.querySelector<HTMLElement>(`[data-testid="invoice-row"][data-invoice-id="${id}"]`);
  if (!element) throw new Error(`no row ${id}`);
  return element;
};

describe('Invoice rows and the payment history fold', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useInvoicePaymentOptions as jest.Mock).mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: false,
      data: { card_surcharge_bps: 300, check_remit_to: null, card_surcharge_resolved: true },
      refetch: jest.fn(),
    });
    (useStartCheckout as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useNotifyCheckIntent as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useStudioIdentity as jest.Mock).mockReturnValue({ isPending: false, data: { name: 'Birchwood Studio' } });
  });

  it('names a mixed-currency amount by its code and never converts it', () => {
    expect(invoiceMoney(60_000, 'USD', false)).toBe('$600.00');
    expect(invoiceMoney(60_000, 'USD', true)).toBe('USD $600.00');
    expect(invoiceMoney(12_000, 'CAD', true)).toBe('CAD $120.00');
  });

  it('draws every row in plain view, with its own View invoice disclosure', () => {
    const { payable } = project([invoice(), invoice({ id: 'inv-2', invoice_number: 'INV-2026-002' })]);
    render(<InvoiceGroupList testId="to-pay" heading="Invoices to pay" rows={payable} state={listState()} />);

    const list = screen.getByRole('list', { name: 'Invoices to pay' });
    expect(within(list).getAllByTestId('invoice-row')).toHaveLength(2);
    const toggle = within(list).getAllByRole('button', { name: 'View invoice' })[0];
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'invoice-inv-1-details');
    expect(document.getElementById('invoice-inv-1-details')).toHaveAttribute('hidden');
  });

  it('keeps the payment history folded until it is asked for, and drafts and voids out of it', () => {
    const { history } = project([
      invoice({ id: 'inv-p', status: 'paid', amount_paid_cents: 40_000, paid_at: '2026-07-20T10:00:00Z' }),
      invoice({ id: 'inv-draft', status: 'draft' as Invoice['status'] }),
      invoice({ id: 'inv-void', status: 'void' as Invoice['status'], voided_at: '2026-07-02T10:00:00Z' }),
    ]);
    const { rerender } = render(
      <PaymentHistory rows={history} summary={null} open={false} onToggle={jest.fn()} state={listState()} />,
    );

    expect(screen.getByRole('button', { name: 'Payment history' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('invoice-row')).not.toBeInTheDocument();

    rerender(<PaymentHistory rows={history} summary={null} open onToggle={jest.fn()} state={listState()} />);
    expect(screen.getAllByTestId('invoice-row').map((row) => row.dataset.invoiceId)).toEqual(['inv-p']);
    expect(screen.getByTestId('invoice-row-status')).toHaveTextContent('Paid 20 July 2026');
  });

  it('opens a settled invoice to its figures and its printable sheet, never a receipt', () => {
    const { history } = project([
      invoice({ id: 'inv-p', status: 'paid', amount_paid_cents: 40_000, paid_at: '2026-07-20T10:00:00Z' }),
    ]);
    render(
      <PaymentHistory
        rows={history}
        summary={null}
        open
        onToggle={jest.fn()}
        state={listState({ openId: 'inv-p' })}
      />,
    );

    const region = screen.getByRole('region', { name: 'Invoice details for INV-2026-001' });
    expect(region).toHaveTextContent('Payable toBirchwood Studio');
    expect(region).toHaveTextContent('Invoice total$400.00');
    expect(region).toHaveTextContent('Paid$400.00');
    expect(within(region).getByRole('link', { name: 'Print invoice' })).toHaveAttribute(
      'href',
      '/invoices/inv-p/print',
    );
    expect(within(region).queryByText(/receipt/i)).not.toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Close invoice details' })).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: /continue to secure payment/i })).not.toBeInTheDocument();
  });

  it('pauses the act on the row whose own return is not confirmed, and only that one', () => {
    const { payable } = project([invoice()]);
    render(
      <InvoiceGroupList
        testId="to-pay"
        heading="Invoices to pay"
        rows={payable}
        state={listState({ openId: 'inv-1', checkoutHeldId: 'inv-1' })}
      />,
    );

    expect(screen.getByRole('button', { name: /continue to secure payment/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('says what a reconciliation hold means on the row and in its details, with no way to pay', () => {
    const holds = { 'inv-1': 'payment_reconciliation_required' as const };
    const { review } = project([invoice()], holds);
    render(
      <InvoiceGroupList
        testId="review"
        heading="Payment needs review"
        rows={review}
        state={listState({ openId: 'inv-1', holds })}
      />,
    );

    expect(screen.getByTestId('invoice-row-note')).toHaveTextContent(
      'This payment is on hold until it’s checked. You don’t need to pay again.',
    );
    expect(screen.getByTestId('invoice-standing')).toHaveTextContent(
      'It’s on hold until it’s checked, so it can’t be paid again here. Birchwood Studio can help. Contact your designer using the phone number or email you already use.',
    );
    expect(screen.queryByTestId('threshold-payment-methods')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close payment details' })).toBeInTheDocument();
  });

  it('cannot confirm a status it does not know, and offers no payment for it', () => {
    const { review } = project([invoice({ status: 'mystery' as Invoice['status'] })]);
    render(
      <InvoiceGroupList
        testId="review"
        heading="Payment needs review"
        rows={review}
        state={listState({ openId: 'inv-1' })}
      />,
    );

    expect(screen.getByTestId('invoice-row-note')).toHaveTextContent(
      'We can’t confirm this invoice’s payment status.',
    );
    expect(screen.getByTestId('invoice-standing')).toHaveTextContent(
      'Until its payment status is confirmed, it can’t be paid here. Birchwood Studio can help.',
    );
  });

  it.each([
    ['still loading', { isPending: true, isError: false, data: undefined }, 'Payee details are loading.'],
    ['failed', { isPending: false, isError: true, data: undefined }, 'We couldn’t load who this invoice is payable to.'],
  ])(
    'R5 · names no other studio as payee while a studio invoice’s own identity is %s',
    (_label, identity, sentence) => {
      (useStudioIdentity as jest.Mock).mockReturnValue(identity);
      const { payable } = project([
        invoice({ project_id: null, studio_id: 'studio-b', designer_id: 'designer-b' }),
      ]);
      render(
        <InvoiceGroupList
          testId="to-pay"
          heading="Invoices to pay"
          rows={payable}
          state={listState({ openId: 'inv-1', designerName: 'Ash House Studio' })}
        />,
      );

      const row = rowElement('inv-1');
      expect(row).not.toHaveTextContent('Ash House Studio');
      expect(within(row).getByTestId('payee-unknown')).toHaveTextContent(sentence);
      expect(within(row).queryByTestId('spine-toll-payee')).not.toBeInTheDocument();
      // The till names its own merchant, so the online act is not withheld.
      expect(within(row).getByRole('button', { name: /continue to secure payment/i })).not.toHaveAttribute(
        'aria-disabled',
      );

      fireEvent.click(within(row).getByRole('radio', { name: /mail a check/i }));
      expect(row).not.toHaveTextContent('Ash House Studio');
      expect(within(row).queryByTestId('threshold-check-panel')).not.toBeInTheDocument();
      expect(within(row).queryByRole('button', { name: 'I’ll mail a check' })).not.toBeInTheDocument();
      expect(within(row).getByTestId('threshold-check-unavailable')).toHaveTextContent(
        'We can’t give mailing details for a check until we know who this invoice is payable to.',
      );
    },
  );

  describe('R7 · a Checkout claim outlives the details it was started from', () => {
    const originalLocation = window.location;
    let finish: (value: unknown) => void;
    let mutateAsync: jest.Mock;

    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { href: 'https://client.test/projects/p1' },
      });
      mutateAsync = jest.fn().mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
      (useStartCheckout as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    });

    const continueAct = () => screen.getByRole('button', { name: /continue to secure payment/i });
    const late = { url: 'https://checkout.stripe.test/late', amount_cents: 40_000, surcharge_cents: 500 };

    it('starts one checkout across closing and reopening, and a late answer redirects nowhere', async () => {
      render(<OpenableList rows={project([invoice()]).payable} initialOpenId="inv-1" />);

      fireEvent.click(continueAct());
      fireEvent.click(screen.getByRole('button', { name: 'Close payment details' }));
      fireEvent.click(screen.getByRole('button', { name: 'View invoice' }));
      fireEvent.click(continueAct());
      expect(mutateAsync).toHaveBeenCalledTimes(1);

      await act(async () => {
        finish(late);
      });
      expect(window.location.href).toBe('https://client.test/projects/p1');
      expect(clientEvents.paymentStarted).not.toHaveBeenCalled();

      // Once the late answer is in, the open sheet can claim its own session.
      mutateAsync.mockResolvedValueOnce({ ...late, url: 'https://checkout.stripe.test/fresh' });
      await act(async () => {
        fireEvent.click(continueAct());
      });
      expect(mutateAsync).toHaveBeenCalledTimes(2);
      expect(window.location.href).toBe('https://checkout.stripe.test/fresh');
    });

    it('sends no late answer to the till after another row was opened', async () => {
      const rows = project([invoice(), invoice({ id: 'inv-2', invoice_number: 'INV-2026-002' })]).payable;
      render(<OpenableList rows={rows} initialOpenId="inv-1" />);

      fireEvent.click(continueAct());
      fireEvent.click(within(rowElement('inv-2')).getByRole('button', { name: 'View invoice' }));
      await act(async () => {
        finish(late);
      });

      expect(window.location.href).toBe('https://client.test/projects/p1');
      expect(clientEvents.paymentStarted).not.toHaveBeenCalled();
    });
  });
});
