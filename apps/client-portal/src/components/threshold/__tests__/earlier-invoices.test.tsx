import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';

import { invoiceProjection } from '@/lib/threshold/invoice-rollup';

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
});
