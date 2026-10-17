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

// The jobs the viewer leads (SQ-774 R1: in any studio) and her seats.
const mockLedProjectIds = new Set<string>();
type MockOrg = { id: string; type: string; membership?: { role: string } };
let mockOrganizations: MockOrg[] = [{ id: 'studio-1', type: 'design_studio' }];

jest.mock('@patina/supabase', () => ({
  // US-36 R2 — the folio's K10 recipient read and the band's milestone readiness.
  useSessionUserId: () => null,
  useDesignerClientForClientUser: () => ({ data: null, isLoading: false }),
  useClient: () => ({ data: null, isLoading: false }),
  useProjects: () => ({ data: [] }),
  useDocumentClientLinkHold: () => ({ data: null }),
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
  computeArAging: (invoices: unknown[]) => ({ totalBalanceCents: invoices.length * 100, buckets: [] }),
  useArAging: jest.fn(),
  useDesignerTeachingStats: jest.fn(),
  useEarnings: jest.fn(),
  useEarningsStats: jest.fn(),
  useInvoice: jest.fn(),
  useInvoices: jest.fn(),
  useIssueInvoice: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useOrganizations: () => ({ data: mockOrganizations }),
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

jest.mock('../command-bar', () => ({
  openLedger: jest.fn(),
}));

const mockMarginStudios: (readonly string[])[] = [];
jest.mock('@/hooks/use-studio-accounts', () => ({
  useStudioMargin: (studioIds: readonly string[]) => {
    mockMarginStudios.push(studioIds);
    return { data: null };
  },
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

const frontMatter = () => document.querySelector('[data-accounts-front-matter]');

jest.mock('./accounts-ledger-page', () => ({
  AccountsLedgerPage: ({ invoices = [], canExport = false }: { invoices?: { id: string }[]; canExport?: boolean }) => (
    <div
      data-testid="accounts-ledger"
      data-invoice-ids={invoices.map((invoice) => invoice.id).join(',')}
      data-can-export={String(canExport)}
    >
      Ledger rows
    </div>
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
    mockLedProjectIds.clear();
    mockMarginStudios.length = 0;
    mockOrganizations = [{ id: 'studio-1', type: 'design_studio' }];
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
    expect(frontMatter()).toBeNull();
    expect(screen.queryByTestId('accounts-ledger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('limits a person to led-project invoices and hides studio money totals', () => {
    mockOrganizations = [{ id: 'studio-1', type: 'design_studio', membership: { role: 'member' } }];
    mockLedProjectIds.add('project-1');
    mockUseInvoices.mockReturnValue({
      data: [
        { id: 'invoice-1', project_id: 'project-1', studio_id: 'studio-1' },
        { id: 'invoice-2', project_id: 'project-2', studio_id: 'studio-1' },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseArAging.mockReturnValue({ aging: { totalBalanceCents: 999_900, buckets: [] } });

    render(<AccountsBook onClose={jest.fn()} />);

    expect(screen.getByTestId('accounts-ledger')).toHaveAttribute('data-invoice-ids', 'invoice-1');
    // Q10 (walk W-D5): no studio-wide export for a member.
    expect(screen.getByTestId('accounts-ledger')).toHaveAttribute('data-can-export', 'false');
    // V18 Q10 — a non-owner reads no studio totals at all, not an empty strip.
    expect(frontMatter()).toBeNull();
    expect(screen.queryByText(/is out with clients/)).toBeNull();
    expect(screen.queryByText(/collected/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Earnings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Receivables' }));
    expect(screen.getByTestId('accounts-receivables')).toHaveTextContent('Receivables 100');
    // SQ-778 N4 — her header claims her projects' invoices, never the studio book.
    expect(screen.getByText('· your projects’ invoices')).toBeInTheDocument();
    expect(screen.queryByText(/the studio’s book/)).toBeNull();
    expect(screen.queryByText(/sum of every engagement/)).toBeNull();
    expect(screen.queryByText('Studio eyes only')).toBeNull();
  });

  it('owning her solo studio is no seat over her employer’s book (SQ-774 R1)', () => {
    // The review input: the hire owns her automatically created solo studio
    // and is a plain member of her employer's; she leads one employer job.
    mockOrganizations = [
      { id: 'solo', type: 'design_studio', membership: { role: 'owner' } },
      { id: 'employer', type: 'design_studio', membership: { role: 'member' } },
    ];
    mockLedProjectIds.add('employer-led');
    mockUseInvoices.mockReturnValue({
      data: [
        { id: 'solo-1', project_id: 'solo-job', studio_id: 'solo', amount_paid_cents: 50_000 },
        { id: 'employer-1', project_id: 'employer-unled', studio_id: 'employer', amount_paid_cents: 900_000 },
        { id: 'employer-2', project_id: 'employer-led', studio_id: 'employer', amount_paid_cents: 700_000 },
        { id: 'employer-3', project_id: null, studio_id: 'employer', amount_paid_cents: 300_000 },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<AccountsBook onClose={jest.fn()} />);

    // Her own studio's book, and on her employer's only the job she leads.
    expect(screen.getByTestId('accounts-ledger')).toHaveAttribute('data-invoice-ids', 'solo-1,employer-2');
    // The studio totals sum her own studio's records alone.
    // US-28 S8 — said once as text, never figure tiles.
    const front = frontMatter() as HTMLElement;
    expect(front).toHaveTextContent('$1 is out with clients; none of it is overdue.');
    expect(front).toHaveTextContent('$500 collected.');
    expect(front).not.toHaveTextContent(/\$9,000|\$7,000|\$3,000|\$19,000/);
    expect(mockMarginStudios.at(-1)).toEqual(['solo']);
  });

  it('titles the book "Studio accounts" (SQ-752)', () => {
    mockOrganizations = [{ id: 'studio-1', type: 'design_studio', membership: { role: 'owner' } }];
    mockUseInvoices.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<AccountsBook onClose={jest.fn()} />);

    expect(screen.getByText('Accounts header')).toHaveAttribute('data-sheet-title', 'Studio accounts');
    // SQ-778 N4 — a seat that holds the studio's money reads the studio book.
    expect(screen.getByText('· the studio’s book')).toBeInTheDocument();
    expect(screen.getByText('Studio eyes only')).toBeInTheDocument();
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
