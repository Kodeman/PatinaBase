/**
 * US-28 S8 · V20 U-Q16 — the Invoice folio replaces Accounts inside the one
 * sheet, with "← Accounts" in its head. It never stacks a second dialog over
 * the book (the walk counted three layers at once), and going back returns
 * the reader to the row that opened it.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { useInvoice, useInvoices } from '@patina/supabase';
import { AccountsBook } from '../accounts-book';
import { InvoiceOverlays } from '../invoice-overlays';

jest.mock('@/hooks/use-teaching-note', () => ({
  useTeachingNoteFor: () => ({ note: null, bind: null }),
}));

const mockLedProjectIds = new Set<string>(['project-1']);

jest.mock('@patina/supabase', () => ({
  // US-36 R2 — the folio's K10 recipient read and the band's milestone readiness.
  useSessionUserId: () => null,
  useDesignerClientForClientUser: () => ({ data: null, isLoading: false }),
  useClient: () => ({ data: null, isLoading: false }),
  useProjects: () => ({ data: [] }),
  useDocumentClientLinkHold: () => ({ data: null }),
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
  computeArAging: () => ({ totalBalanceCents: 0, buckets: [], openInvoices: [] }),
  invoiceDaysOverdue: () => 0,
  invoiceLinkIsLive: () => false,
  useEarningsStats: () => ({ data: null }),
  useInvoice: jest.fn(),
  useInvoices: jest.fn(),
  useIssueInvoice: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useOrganizations: () => ({
    data: [{ id: 'studio-1', type: 'design_studio', membership: { role: 'member' } }],
  }),
  useLedProjectIds: () => ({ data: mockLedProjectIds }),
  useRecordPayment: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useSendInvoice: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useVoidInvoice: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useInvoiceLink: () => ({ data: null }),
  useRegenerateInvoiceLink: () => ({ isPending: false, mutateAsync: jest.fn() }),
  RegenerateInvoiceLinkError: class RegenerateInvoiceLinkError extends Error {},
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('../../command-bar', () => ({ openLedger: jest.fn() }));

jest.mock('@/hooks/use-studio-accounts', () => ({
  useStudioMargin: () => ({ data: null }),
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));

jest.mock('@/hooks/use-invoice-checkout-reconciliation', () => ({
  useReconcileInvoiceCheckout: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../overlays/doc-sheet', () => ({
  DocSheetHead: ({ title }: { title?: string }) => <div data-sheet-title={title}>Accounts header</div>,
}));

jest.mock('@/lib/document/registry', () => ({
  STUDIO_LEDGERS: [{ key: 'accounts', icon: () => null }],
}));

const invoice = {
  id: 'invoice-1',
  project_id: 'project-1',
  studio_id: 'studio-1',
  designer_id: 'designer-1',
  client_id: 'client-1',
  invoice_number: 'INV-2026-0723',
  title: null,
  status: 'paid',
  issue_date: '2026-10-05',
  due_date: '2026-10-19',
  payment_terms_days: 14,
  currency: 'USD',
  subtotal_cents: 920_000,
  tax_rate: 0,
  tax_cents: 0,
  total_cents: 920_000,
  amount_paid_cents: 920_000,
  memo: null,
  internal_notes: null,
  stripe_checkout_session_id: null,
  sent_at: '2026-10-05T12:00:00.000Z',
  paid_at: '2026-10-12T11:10:00.000Z',
  voided_at: null,
  void_reason: null,
  reminder_count: 0,
  last_reminder_at: null,
  ar_flagged_at: null,
  ar_last_chased_at: null,
  created_at: '2026-10-05T12:00:00.000Z',
  updated_at: '2026-10-12T11:10:00.000Z',
  project: { id: 'project-1', name: 'Pell Court Dining', client_id: 'client-1' },
  client: { id: 'client-1', full_name: 'Pell household', email: 'pell@example.com' },
  line_items: [
    {
      id: 'line-1',
      kind: 'ffe',
      description: 'Deposit · Calloway & Brandt Upholstery, banquette and eight chairs',
      quantity: 1,
      unit_amount_cents: 722_500,
      amount_cents: 722_500,
      metadata: null,
    },
    {
      id: 'line-2',
      kind: 'ffe',
      description: 'Deposit · Ninebark Lighting, two pendants',
      quantity: 1,
      unit_amount_cents: 197_500,
      amount_cents: 197_500,
      metadata: null,
    },
  ],
  payments: [],
};

beforeEach(() => {
  (useInvoices as jest.Mock).mockReturnValue({
    data: [invoice],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  (useInvoice as jest.Mock).mockReturnValue({
    data: invoice,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
});

function renderAccountsSheet() {
  // The StudioDrawer's DocSheet is the one dialog the book lives in; the
  // overlay host is mounted beside it in the document layout, as in the app.
  return render(
    <>
      <div role="dialog" aria-modal="true" aria-label="Studio accounts">
        <AccountsBook onClose={jest.fn()} />
      </div>
      <InvoiceOverlays />
    </>,
  );
}

it('swaps the folio in place: one dialog, "← Accounts" in its head, the book gone', () => {
  renderAccountsSheet();

  // The register is a Section of ledger rows with an ink state word.
  const row = screen.getByText('Invoice INV-2026-0723').closest('li') as HTMLElement;
  expect(row).toHaveClass('lrow');
  expect(within(row).getByText('paid')).toHaveClass('word');

  fireEvent.click(screen.getByRole('button', { name: 'Invoice INV-2026-0723' }));

  // No second dialog anywhere in the DOM once the folio opens.
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.querySelector('[data-doc-overlay="paper-folio"]')).toBeNull();

  const sheet = screen.getByRole('dialog', { name: 'Studio accounts' });
  const back = within(sheet).getByRole('button', { name: '← Accounts' });
  expect(back).toHaveFocus();
  expect(within(sheet).getByRole('heading', { name: 'Invoice INV-2026-0723' })).toBeInTheDocument();
  // The folio replaced the book; it is not drawn on top of it.
  expect(within(sheet).queryByText('Accounts header')).toBeNull();
  expect(within(sheet).queryByRole('button', { name: 'Draw an invoice' })).toBeNull();

  // The lines sit above their total, in money rows; the state is an ink word.
  const lines = sheet.querySelector('[data-folio-lines]') as HTMLElement;
  expect(within(lines).getByText(/Ninebark Lighting, two pendants/)).toBeInTheDocument();
  expect(lines.querySelector('.money-rows .money-total')).toHaveTextContent('$9,200.00');
  expect(within(sheet.querySelector('[data-folio-state]') as HTMLElement).getByText('paid')).toHaveClass('word');
});

it('goes back to Accounts in the same sheet, focus on the row that opened the folio', () => {
  renderAccountsSheet();

  fireEvent.click(screen.getByRole('button', { name: 'Invoice INV-2026-0723' }));
  fireEvent.click(screen.getByRole('button', { name: '← Accounts' }));

  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: '← Accounts' })).toBeNull();
  expect(screen.getByText('Accounts header')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Invoice INV-2026-0723' })).toHaveFocus();
});

it('lands the print-page doorway on the folio in place, once — "← Accounts" does not swap it back', () => {
  render(
    <div role="dialog" aria-label="Studio accounts">
      <AccountsBook
        onClose={jest.fn()}
        initialContext={{ book: 'accounts', page: 'ledger', invoiceId: 'invoice-1' } as never}
      />
    </div>,
  );

  expect(screen.getByRole('button', { name: '← Accounts' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '← Accounts' }));
  expect(screen.queryByRole('button', { name: '← Accounts' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Invoice INV-2026-0723' })).toBeInTheDocument();
});
