import { fireEvent, render, screen } from '@testing-library/react';

import {
  useArAging,
  useDesignerTeachingStats,
  useEarnings,
  useEarningsStats,
  useInvoice,
  useInvoices,
} from '@patina/supabase';
import { AccountsBook } from './accounts-book';
import { InvoiceFolio } from './invoice-folio';

// Return teaching's in-place and act notes: jest cannot load @patina/help-system
// behind the real hook, and nothing here is taught.
jest.mock('@/hooks/use-teaching-note', () => ({
  useTeachingNoteFor: () => ({ note: null, bind: null }),
}));

const mockProjectLeads = new Map<string, { leadUserId: string; leadName: string }>();

jest.mock('@patina/supabase', () => ({
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
  computeArAging: (invoices: unknown[]) => ({ totalBalanceCents: invoices.length * 100, buckets: [] }),
  useArAging: jest.fn(),
  useDesignerTeachingStats: jest.fn(),
  useEarnings: jest.fn(),
  useEarningsStats: jest.fn(),
  useInvoice: jest.fn(),
  useInvoices: jest.fn(),
  useIssueInvoice: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio' }] }),
  useProjectLeads: () => ({ data: mockProjectLeads }),
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

jest.mock('../command-bar', () => ({
  openLedger: jest.fn(),
}));

jest.mock('@/hooks/use-studio-accounts', () => ({
  useStudioMargin: () => ({ data: null }),
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));

// R1 — the margin stat's gate; its query states are not under test here.
jest.mock('@/hooks/use-can-see-margin', () => ({
  useCanSeeMargin: () => false,
}));

// InvoiceFolio reconciles a returning Stripe checkout through a real
// useMutation, which needs a QueryClientProvider this suite does not mount.
// The folio's query states are what is under test, not the reconciliation.
jest.mock('@/hooks/use-invoice-checkout-reconciliation', () => ({
  useReconcileInvoiceCheckout: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../ledger-front-matter', () => ({
  LedgerFrontMatter: ({ stats = [] }: { stats?: { label: string; value: string }[] }) => (
    <div data-testid="ledger-front-matter">{stats.map((stat) => `${stat.label}: ${stat.value}`).join(' | ')}</div>
  ),
}));

jest.mock('./accounts-ledger-page', () => ({
  AccountsLedgerPage: ({ invoices = [] }: { invoices?: { id: string }[] }) => (
    <div data-testid="accounts-ledger" data-invoice-ids={invoices.map((invoice) => invoice.id).join(',')}>Ledger rows</div>
  ),
}));

jest.mock('./accounts-receivables-page', () => ({
  AccountsReceivablesPage: ({ aging }: { aging: { totalBalanceCents: number } }) => (
    <div data-testid="accounts-receivables">Receivables {aging.totalBalanceCents}</div>
  ),
}));

jest.mock('./accounts-earnings-page', () => ({
  AccountsEarningsPage: () => <div>Earnings rows</div>,
}));

jest.mock('../overlays/doc-sheet', () => ({
  DocSheetHead: ({ title }: { title?: string }) => <div data-sheet-title={title}>Accounts header</div>,
}));

jest.mock('@/lib/document/registry', () => ({
  STUDIO_LEDGERS: [{ key: 'accounts', icon: () => null }],
}));

const mockUseInvoices = useInvoices as jest.Mock;
const mockUseInvoice = useInvoice as jest.Mock;
const mockUseArAging = useArAging as jest.Mock;
const mockUseEarnings = useEarnings as jest.Mock;
const mockUseEarningsStats = useEarningsStats as jest.Mock;
const mockUseDesignerTeachingStats = useDesignerTeachingStats as jest.Mock;

describe('designer Accounts query failures', () => {
  beforeEach(() => {
    mockProjectLeads.clear();
    mockUseArAging.mockReturnValue({
      aging: { totalBalanceCents: 0, buckets: [] },
    });
    mockUseEarnings.mockReturnValue({ data: [] });
    mockUseEarningsStats.mockReturnValue({ data: null });
    mockUseDesignerTeachingStats.mockReturnValue({ data: null });
  });

  it('does not turn a failed invoice list into zero totals or an empty ledger', () => {
    const refetch = jest.fn();
    mockUseInvoices.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<AccountsBook onClose={jest.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/studio book could not be opened/i);
    expect(screen.queryByTestId('ledger-front-matter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('accounts-ledger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('limits a person to led-project invoices and hides studio money totals', () => {
    mockProjectLeads.set('project-1', { leadUserId: 'viewer', leadName: 'Maya Lee' });
    mockUseInvoices.mockReturnValue({
      data: [
        { id: 'invoice-1', project_id: 'project-1' },
        { id: 'invoice-2', project_id: 'project-2' },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseArAging.mockReturnValue({ aging: { totalBalanceCents: 999_900, buckets: [] } });

    render(<AccountsBook onClose={jest.fn()} />);

    expect(screen.getByTestId('accounts-ledger')).toHaveAttribute('data-invoice-ids', 'invoice-1');
    expect(screen.getByTestId('ledger-front-matter')).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Earnings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Receivables' }));
    expect(screen.getByTestId('accounts-receivables')).toHaveTextContent('Receivables 100');
  });

  it('titles the book "Studio accounts" (SQ-752)', () => {
    mockUseInvoices.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<AccountsBook onClose={jest.fn()} />);

    expect(screen.getByText('Accounts header')).toHaveAttribute('data-sheet-title', 'Studio accounts');
  });

  it('distinguishes an invoice-folio query failure from invoice not found', () => {
    const refetch = jest.fn();
    mockUseInvoice.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/invoice folio could not be opened/i);
    expect(screen.queryByText(/invoice not found/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('uses invoice not found only for a successful missing read', () => {
    mockUseInvoice.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<InvoiceFolio invoiceId="missing-invoice" />);

    expect(screen.getByText(/invoice not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
