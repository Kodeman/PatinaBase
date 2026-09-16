/**
 * The designer print route (BIL-01 refit). The folio's Print act used to call
 * window.print() in place and produced a blank page; it now opens this route,
 * which renders the shared InvoicePaper inside #invoice-print-root.
 *
 * InvoicePaper itself is NOT mocked — these assertions are the regression
 * guard on the extracted paper's content as much as on the page.
 */
import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Invoice } from '@patina/supabase';
import DesignerInvoicePrintPage from '../page';

const INVOICE_ID = 'b0000000-0000-0000-0000-00000000e142';

let mockInvoice: Invoice | undefined;
let mockIsLoading = false;
let mockIsError = false;
let mockIdentity: { name: string | null; logoUrl: string | null } | undefined;

jest.mock('@patina/supabase', () => ({
  useInvoice: () => ({
    data: mockInvoice,
    isLoading: mockIsLoading,
    isError: mockIsError,
    refetch: jest.fn(),
  }),
  useStudioIdentity: () => ({ data: mockIdentity }),
  useInvoicePaymentOptions: () => ({
    data: { card_surcharge_bps: 300, check_remit_to: null },
  }),
}));

jest.mock('@/components/document/accounts/accounts-query-failure', () => ({
  AccountsQueryFailure: ({ title }: { title: string }) => <div role="alert">{title}</div>,
}));

function base(over: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_ID,
    project_id: 'b0000000-0000-0000-0000-0000000000d1',
    studio_id: 'b0000000-0000-0000-0000-000000000001',
    designer_id: 'a0000000-0000-0000-0000-000000000004',
    client_id: 'c1',
    invoice_number: 'INV-2026-0142',
    title: null,
    status: 'sent',
    issue_date: '2026-09-01',
    due_date: '2026-09-16',
    payment_terms_days: 15,
    currency: 'USD',
    subtotal_cents: 425000,
    tax_rate: 0,
    tax_cents: 0,
    total_cents: 425000,
    amount_paid_cents: 0,
    memo: null,
    internal_notes: null,
    stripe_checkout_session_id: null,
    sent_at: '2026-09-01T00:00:00Z',
    paid_at: null,
    voided_at: null,
    void_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    ar_flagged_at: null,
    ar_last_chased_at: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    client: { id: 'c1', full_name: 'Edna Courtney', email: 'edna@example.com' },
    project: { id: 'p1', name: 'Courtney Residence' },
    designer: { id: 'd1', full_name: 'Leah Hartwell', business_name: null },
    line_items: [
      {
        id: 'l1',
        invoice_id: INVOICE_ID,
        kind: 'adhoc',
        milestone_id: null,
        ffe_item_id: null,
        description: 'Design fee — Phase 2',
        quantity: 1,
        unit_amount_cents: 300000,
        amount_cents: 300000,
        metadata: {},
        sort_order: 0,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'l2',
        invoice_id: INVOICE_ID,
        kind: 'adhoc',
        milestone_id: null,
        ffe_item_id: null,
        description: 'Procurement management',
        quantity: 1,
        unit_amount_cents: 125000,
        amount_cents: 125000,
        metadata: {},
        sort_order: 1,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
    payments: [],
    ...over,
  } as Invoice;
}

/** `use(params)` suspends; the flush has to happen inside act() or the tree
 *  stays on the Suspense fallback for the whole test. */
async function renderPage() {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={<div>loading</div>}>
        <DesignerInvoicePrintPage params={Promise.resolve({ invoiceId: INVOICE_ID })} />
      </Suspense>,
    );
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsLoading = false;
  mockIsError = false;
  mockInvoice = base();
  mockIdentity = { name: 'Middlewest Studio', logoUrl: null };
  Object.defineProperty(window, 'print', { value: jest.fn(), writable: true });
});

it('renders the invoice number, its lines, the total and the studio letterhead', async () => {
  await renderPage();

  expect(screen.getByText('INV-2026-0142')).toBeInTheDocument();
  expect(screen.getByText('Middlewest Studio')).toBeInTheDocument();
  expect(screen.getByText('Design fee — Phase 2')).toBeInTheDocument();
  expect(screen.getByText('Procurement management')).toBeInTheDocument();
  // Each line prints its unit price and its amount; at quantity 1 they match.
  expect(screen.getAllByText('$3,000.00')).toHaveLength(2);
  expect(screen.getAllByText('$1,250.00')).toHaveLength(2);
  // Subtotal and Total both read $4,250.00 on a zero-tax invoice.
  expect(screen.getAllByText('$4,250.00')).toHaveLength(2);
  expect(screen.getByText('Courtney Residence')).toBeInTheDocument();
  expect(screen.getByText('Edna Courtney')).toBeInTheDocument();
});

it('falls back to the designer name when no studio identity resolves', async () => {
  mockIdentity = undefined;
  await renderPage();

  expect(screen.getByText('Leah Hartwell')).toBeInTheDocument();
});

it('prints via window.print when Print / Save PDF is pressed', async () => {
  const user = userEvent.setup();
  await renderPage();

  await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));

  expect(window.print).toHaveBeenCalledTimes(1);
});

it('points the back link at the Accounts doorway for this invoice', async () => {
  await renderPage();

  expect(screen.getByRole('link', { name: /Back to invoice/ })).toHaveAttribute(
    'href',
    `/desk?book=accounts&page=ledger&invoiceId=${INVOICE_ID}`,
  );
});

it('keeps the paper inside #invoice-print-root so the global print rule cannot hide it', async () => {
  const { container } = await renderPage();

  screen.getByText('INV-2026-0142');
  const root = container.querySelector('#invoice-print-root');
  expect(root).not.toBeNull();
  expect(root).toHaveTextContent('INV-2026-0142');
});

it('says nothing is there for a draft invoice', async () => {
  mockInvoice = base({ status: 'draft' });
  await renderPage();

  expect(screen.getByText('Invoice not found.')).toBeInTheDocument();
});

it('reports a failed load instead of an empty sheet', async () => {
  mockIsError = true;
  mockInvoice = undefined;
  await renderPage();

  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this invoice');
});

it('renders the regarding line for a studio invoice with no project', async () => {
  mockInvoice = base({
    project_id: null,
    project: undefined,
    title: 'Studio retainer — September',
  });
  await renderPage();

  expect(screen.getByText('Regarding')).toBeInTheDocument();
  expect(screen.getByText('Studio retainer — September')).toBeInTheDocument();
});
