import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';
import { AccountsBook } from '../accounts-book';
import { AccountsReceivablesPage } from '../accounts-receivables-page';

let mockInvoices: Invoice[] = [];
let mockInvoiceState = {};
let mockAuthorityState = {};
let mockDeliveryState = {};
let mockRole = 'owner';
const mockRetry = jest.fn();
const mockAuthorityRetry = jest.fn();
const mockSend = jest.fn();
const mockChase = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'designer' } }) }));
jest.mock('@patina/supabase', () => ({
  useInvoices: () => ({ data: mockInvoices, refetch: mockRetry, ...mockInvoiceState }),
  useOrganizations: () => ({ data: [{ id: 'studio', type: 'design_studio', membership: { role: mockRole } }], refetch: mockAuthorityRetry, ...mockAuthorityState }),
  useLedProjectIds: () => ({ data: new Set(['led-job']), refetch: mockAuthorityRetry }),
  useEmailDelivery: () => ({ byRef: {}, refetch: mockRetry, ...mockDeliveryState }),
  useEarningsStats: () => ({ data: undefined }),
  useSendInvoice: () => ({ mutateAsync: mockSend, isPending: false }),
  useChaseInvoice: () => ({ mutateAsync: mockChase, isPending: false }),
  invoiceDaysOverdue: () => 10,
  computeArAging: () => ({ openInvoices: mockInvoices.filter(i => i.status === 'sent' || i.status === 'partially_paid'), buckets: [], totalBalanceCents: 0 }),
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('@/hooks/use-studio-accounts', () => ({ useStudioMargin: () => ({ data: undefined }) }));
jest.mock('../accounts-export', () => ({ AccountsExportAction: () => <button>Export</button> }));
jest.mock('../invoice-overlays', () => ({ openInvoiceComposer: jest.fn(), openInvoiceFolio: jest.fn() }));
jest.mock('../accounts-earnings-page', () => ({ AccountsEarningsPage: () => null }));
jest.mock('../invoice-folio', () => ({ InvoiceFolio: () => <div>Private folio</div> }));
jest.mock('../../overlays/doc-sheet', () => ({ DocSheetHead: () => <h1>Studio accounts</h1> }));
jest.mock('../../teaching/teaching-anchor-note', () => ({ TEACHING_MARGIN_COLUMN: '', TeachingAnchorNote: () => null }));

const invoice = (id: string, overrides: Partial<Invoice> = {}): Invoice => ({
  id, studio_id: 'studio', project_id: 'led-job', status: 'sent', invoice_number: id,
  total_cents: 10000, amount_paid_cents: 0, currency: 'USD', due_date: '2026-01-01',
  client: { id: 'client', full_name: 'Fictional client', email: 'client@example.test' },
  internal_notes: 'PRIVATE TRADE COST 987654', reminder_count: 0, ...overrides,
} as Invoice);
const front = () => document.querySelector('[data-accounts-front-matter]') as HTMLElement;

beforeEach(() => {
  mockInvoices = []; mockInvoiceState = {}; mockAuthorityState = {}; mockDeliveryState = {}; mockRole = 'owner';
  mockRetry.mockClear(); mockAuthorityRetry.mockClear(); mockSend.mockReset(); mockChase.mockReset();
});

it('reads issued, received and due from invoice headers, excluding draft balances and retaining undated receivables', () => {
  mockInvoices = [
    invoice('draft', { status: 'draft', total_cents: 999999, amount_paid_cents: 888888 }),
    invoice('part', { status: 'partially_paid', total_cents: 20000, amount_paid_cents: 5000 }),
    invoice('paid', { status: 'paid', total_cents: 10000, amount_paid_cents: 10000 }),
    invoice('undated', { due_date: null, total_cents: 4000 }),
    invoice('void', { status: 'void', total_cents: 80000 }),
  ];
  render(<AccountsBook onClose={jest.fn()} />);
  expect(front()).toHaveTextContent('$340.00 issued; $150.00 received; $190.00 due.');
  expect(screen.getByRole('button', { name: 'Invoice draft' })).toBeVisible();
  expect(document.body).not.toHaveTextContent('PRIVATE TRADE COST');
});

it('does not turn mixed native currencies into a USD balance', () => {
  mockInvoices = [invoice('usd'), invoice('eur', { currency: 'EUR' })];
  render(<AccountsBook onClose={jest.fn()} />);
  expect(front()).toHaveTextContent('Mixed currencies — total unavailable (EUR, USD) issued');
  expect(front()).not.toHaveTextContent('$200');
});

it.each(['isLoading', 'isError'])('refuses balances and ledger acts while the invoice read is %s', (state) => {
  mockInvoices = [invoice('cached')]; mockInvoiceState = { [state]: true };
  render(<AccountsBook onClose={jest.fn()} />);
  expect(front()).toBeNull();
  expect(screen.queryByRole('button', { name: 'Draw an invoice' })).toBeNull();
  if (state === 'isError') { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(mockRetry).toHaveBeenCalled(); }
});

it.each(['isLoading', 'isError'])('refuses false empty books while money authority is %s', (state) => {
  mockAuthorityState = { [state]: true };
  render(<AccountsBook onClose={jest.fn()} />);
  expect(front()).toBeNull();
  expect(screen.queryByText(/No invoices drawn/)).toBeNull();
  if (state === 'isError') { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(mockAuthorityRetry).toHaveBeenCalled(); }
});

it('keeps member books scoped to led jobs and never renders studio totals or private invoice notes', () => {
  mockRole = 'member'; mockInvoices = [invoice('own'), invoice('other', { project_id: 'other-job' })];
  render(<AccountsBook onClose={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Invoice own' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Invoice other' })).toBeNull();
  expect(front()).toBeNull(); expect(screen.queryByText('Export')).toBeNull();
  expect(document.body).not.toHaveTextContent('PRIVATE TRADE COST');
});

it.each(['missing-recipient', 'delivery-loading', 'delivery-failure'])('holds reminder sends for %s without a chase write', (state) => {
  const rowInvoice = invoice('overdue', state === 'missing-recipient' ? { client: undefined } : {});
  mockDeliveryState = state === 'delivery-loading' ? { isLoading: true } : state === 'delivery-failure' ? { isError: true } : {};
  render(<AccountsReceivablesPage aging={{ openInvoices: [rowInvoice], buckets: [], totalBalanceCents: 10000, flagged: [] }} highlightInvoiceId={null} onOpenDocument={jest.fn()} />);
  const row = screen.getByRole('listitem');
  const send = within(row).getByRole('button', { name: 'Send reminder' });
  expect(send).toBeDisabled(); fireEvent.click(send);
  expect(mockSend).not.toHaveBeenCalled(); expect(mockChase).not.toHaveBeenCalled();
  expect(row).toHaveTextContent(state === 'missing-recipient' ? 'Add the client email' : 'Delivery history is unread');
});

it('prints receivables in the invoice currency rather than relabeling EUR as USD', () => {
  const eur = invoice('eur', { currency: 'EUR' });
  render(<AccountsReceivablesPage aging={{ openInvoices: [eur], buckets: [], totalBalanceCents: 10000, flagged: [] }} highlightInvoiceId={null} onOpenDocument={jest.fn()} />);
  expect(screen.getByRole('listitem')).toHaveTextContent('€100.00');
  expect(screen.getByText('€100.00 owed')).toBeVisible();
});
