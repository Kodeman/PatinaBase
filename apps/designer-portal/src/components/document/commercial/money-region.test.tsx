import { fireEvent, render, screen } from '@testing-library/react';

let mockAuthority: Record<string, unknown>;
let mockBudget: Record<string, unknown>;
let mockInstruments: Record<string, unknown>;
let mockTradeScopes: Record<string, unknown>;
let mockAccount: Record<string, unknown>;
let mockPurchaseOrders: Record<string, unknown>;
let mockInvoices: Record<string, unknown>;

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePurchaseOrders: () => mockPurchaseOrders,
  useProjectInvoices: () => mockInvoices,
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => mockAuthority,
  useWorkingBudget: () => mockBudget,
  useProjectInstruments: () => mockInstruments,
  useTradeScopes: () => mockTradeScopes,
}));

jest.mock('@/hooks/use-account-page', () => ({
  useAccountPage: () => mockAccount,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

const mockOpenInvoiceComposer = jest.fn();
jest.mock('../accounts/invoice-overlays', () => ({
  openInvoiceComposer: (...args: unknown[]) => mockOpenInvoiceComposer(...args),
}));

const mockOpenLedger = jest.fn();
jest.mock('../command-bar', () => ({
  openLedger: (...args: unknown[]) => mockOpenLedger(...args),
}));

jest.mock('./project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => <div>Authority band</div>,
}));
jest.mock('./project-commerce-section', () => ({
  ProjectCommerceSection: () => <div>Commerce section</div>,
}));
jest.mock('../account-band', () => ({ AccountBand: () => <div>Account band</div> }));

import { MoneyRegion } from './money-region';

const settledEmpty = {
  authority: { data: null, isLoading: false, error: null },
  budget: { data: { version: null, checkpoint: null, note: null }, isLoading: false, error: null },
  instruments: { data: [], isLoading: false, error: null },
  scopes: { data: [], isLoading: false, error: null },
  account: { data: null, isLoading: false, isError: false },
  purchaseOrders: { data: [], isLoading: false, error: null },
  invoices: { data: [], isLoading: false, error: null },
};

/** The fold's derived default only fires once every source has settled; a
 *  sparse project (nothing committed, nothing executed, no working plan)
 *  folds shut by default. Tests exercising rung content unfold first via the
 *  seam so they read the same body regardless of which side of the default
 *  they land on. */
function unfoldIfNeeded() {
  const seam = screen.queryByRole('button', { name: /unfold/i });
  if (seam) fireEvent.click(seam);
}

beforeEach(() => {
  window.localStorage.clear();
  mockOpenInvoiceComposer.mockClear();
  mockOpenLedger.mockClear();
  mockAuthority = settledEmpty.authority;
  mockBudget = settledEmpty.budget;
  mockInstruments = settledEmpty.instruments;
  mockTradeScopes = settledEmpty.scopes;
  mockAccount = settledEmpty.account;
  mockPurchaseOrders = settledEmpty.purchaseOrders;
  mockInvoices = settledEmpty.invoices;
});

describe('MoneyRegion', () => {
  it('states the six rungs in dependency order from live figures', () => {
    mockAuthority = {
      data: { authorizedCents: 10_000_000, remainingCents: 1_800_000 },
      isLoading: false,
      error: null,
    };
    mockBudget = {
      data: {
        version: {
          version: 2,
          lines: [{ targetCents: 5_000_000 }, { targetCents: 3_654_000 }],
        },
      },
      isLoading: false,
      error: null,
    };
    mockInstruments = {
      data: [
        { state: 'executed', totalAmountCents: 1_000_000 },
        { state: 'draft', totalAmountCents: 900_000 },
      ],
      isLoading: false,
      error: null,
    };
    mockTradeScopes = {
      data: [{ state: 'executed', clientPriceCents: 377_200 }],
      isLoading: false,
      error: null,
    };
    mockAccount = { data: { committedCents: 900_000 }, isLoading: false, isError: false };
    // $4,000 paid out to makers, $500 still undrawn against the same order.
    mockPurchaseOrders = {
      data: [
        {
          id: 'po-1',
          po_number: 'PO-2026-0418',
          payments: [
            { id: 'a', state: 'paid', amount_cents: 400_000, kind: 'deposit' },
            {
              id: 'b',
              state: 'due',
              amount_cents: 50_000,
              kind: 'balance',
              due_date: '2026-09-15',
              label: '50% at release',
            },
          ],
        },
      ],
      isLoading: false,
      error: null,
    };
    mockInvoices = {
      data: [
        {
          id: 'invoice-1',
          invoice_number: '2026-114',
          status: 'sent',
          due_date: '2026-08-03',
          total_cents: 175_000,
          amount_paid_cents: 0,
        },
      ],
      isLoading: false,
      error: null,
    };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByRole('heading', { name: 'Money' })).toBeVisible();
    expect(screen.getByText('$18,000 remaining · $13,772 authorized')).toBeVisible();
    expect(screen.getByText('Budget · $100,000 approved')).toBeVisible();
    expect(screen.getByText('Plan · $86,540 specified')).toBeVisible();
    expect(screen.getByText('Authorized · $13,772 ordered')).toBeVisible();
    expect(
      screen.getByText('Moved · $9,772 in motion — ordered $13,772 less $4,000 paid out'),
    ).toBeVisible();
    expect(
      screen.getByText(/^Owed · \$1,750 out · Invoice 2026-114, \d+ days · \$1,750 billed to date$/),
    ).toBeVisible();
    expect(
      screen.getByText('Not drawn · $500 balance · PO-2026-0418, 50% at release'),
    ).toBeVisible();
  });

  it('prints the six rungs in the ladder’s own order, and no other', () => {
    render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    const rungs = Array.from(document.querySelectorAll('ol > li')).map(
      (li) => li.querySelector('p')?.textContent?.split(' · ')[0],
    );
    expect(rungs).toEqual([
      'Budget',
      'Plan',
      'Authorized',
      'Moved',
      'Owed',
      'Not drawn',
    ]);
  });

  // The region's OWN copy only. `ProjectAuthorityBandForProject` is mocked
  // above, and it is the component that used to print the retired words inside
  // this body — so the real guard against it lives in that component's own
  // suite (`project-authority-band.test.tsx`), where nothing is mocked away.
  it('retires the retired vocabulary from its own head, seam and rungs', () => {
    const { container } = render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    expect(container).not.toHaveTextContent('Design authority');
    expect(container).not.toHaveTextContent('Authority ·');
    expect(container).not.toHaveTextContent('committed');
  });

  it('states Moved as a different figure from Authorized once anything is paid out', () => {
    mockInstruments = {
      data: [{ state: 'executed', totalAmountCents: 1_000_000 }],
      isLoading: false,
      error: null,
    };
    mockPurchaseOrders = {
      data: [{ id: 'po-1', payments: [{ state: 'paid', amount_cents: 250_000 }] }],
      isLoading: false,
      error: null,
    };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByText('Authorized · $10,000 ordered')).toBeVisible();
    expect(
      screen.getByText('Moved · $7,500 in motion — ordered $10,000 less $2,500 paid out'),
    ).toBeVisible();
  });

  it('names a line-less working budget rather than summing it into $0', () => {
    mockBudget = {
      data: { version: { version: 1, lines: [] } },
      isLoading: false,
      error: null,
    };

    const { container } = render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    expect(screen.getByText('Plan · working budget v1 · no rooms yet')).toBeVisible();
    expect(container).not.toHaveTextContent('$0');
  });

  it('says a failed read could not be read rather than impersonating a pending one', () => {
    mockAuthority = { data: null, isLoading: false, error: new Error('boom') };
    mockBudget = { data: undefined, isLoading: false, error: new Error('boom') };
    mockInstruments = { data: [], isLoading: false, error: new Error('boom') };
    mockAccount = { data: null, isLoading: false, isError: true };
    mockPurchaseOrders = { data: undefined, isLoading: false, error: new Error('boom') };
    mockInvoices = { data: undefined, isLoading: false, error: new Error('boom') };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByText('Budget · could not be read')).toBeVisible();
    expect(screen.getByText('Plan · could not be read')).toBeVisible();
    expect(screen.getByText('Authorized · could not be read')).toBeVisible();
    expect(screen.getByText('Moved · could not be read')).toBeVisible();
    expect(screen.getByText('Owed · could not be read')).toBeVisible();
    expect(screen.getByText('Not drawn · could not be read')).toBeVisible();
  });

  it('degrades every tier to a band-honest line when nothing is recorded', () => {
    const { container } = render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    expect(screen.getByText('no budget yet')).toBeVisible();
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
    expect(screen.getByText('Budget · nothing approved yet')).toBeVisible();
    expect(screen.getByText('Plan · no working budget yet')).toBeVisible();
    expect(screen.getByText('Authorized · nothing executed yet')).toBeVisible();
    expect(screen.getByText('Moved · nothing in motion yet')).toBeVisible();
    expect(screen.getByText('Owed · nothing owed yet')).toBeVisible();
    expect(screen.getByText('Not drawn · nothing standing undrawn')).toBeVisible();
    expect(container).not.toHaveTextContent('$0');
  });

  it('states no figure at all while a tier’s source has not answered', () => {
    mockBudget = { data: undefined, isLoading: true, error: null };
    mockPurchaseOrders = { data: undefined, isLoading: true, error: null };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByText('Plan')).toBeVisible();
    expect(screen.getByText('Moved')).toBeVisible();
    expect(screen.getByText('Not drawn')).toBeVisible();
    expect(screen.queryByText(/Plan · /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Moved · /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not drawn · /)).not.toBeInTheDocument();
  });

  it('carries the four detail surfaces the tiers summarise, accounts included', () => {
    render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    expect(screen.getByText('Authority band')).toBeVisible();
    expect(screen.getByText('Commerce section')).toBeVisible();
    expect(screen.getByText('Account band')).toBeVisible();
  });

  it('names the moved rung’s derivation so it cannot be read as the owed total', () => {
    const { container } = render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    const caption = screen.getByText(/Moved is what is ordered/);
    expect(caption).toHaveTextContent(
      'Budget → plan → authorized → moved. Moved is what is ordered and not yet paid out — not the contractually owed total above it.',
    );
    // SP-05 — the migration note naming UI that no longer exists is gone.
    expect(container).not.toHaveTextContent('Absorbs today’s four separate bands');
  });

  it('caveats the trade scopes that neither committed nor moved counts', () => {
    mockTradeScopes = {
      data: [
        { state: 'executed', clientPriceCents: 377_200 },
        { state: 'draft', clientPriceCents: 100_000 },
      ],
      isLoading: false,
      error: null,
    };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByText(/Moved is what is ordered/)).toHaveTextContent(
      '1 trade scope still in draft, counted in neither.',
    );
  });

  it('inks exactly one ledger leader on the region head', () => {
    mockInstruments = {
      data: [{ state: 'executed', totalAmountCents: 1_000_000 }],
      isLoading: false,
      error: null,
    };

    render(<MoneyRegion projectId="project-1" />);

    expect(
      document.querySelectorAll('[data-action-variant="inked"]'),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Draw an invoice' })).toHaveAttribute(
      'data-action-variant',
      'inked',
    );
  });

  it('folds a sparse project by default, stating the seam summary', () => {
    render(<MoneyRegion projectId="project-1" />);

    expect(
      screen.queryByRole('heading', { name: 'Money' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('no budget yet · $0 authorized')).toBeVisible();
    expect(screen.getByRole('button', { name: /unfold/i })).toBeInTheDocument();
  });

  it('stays open for an overdue invoice even with nothing executed', () => {
    // Nothing authorized, nothing executed, no plan — but an invoice has been
    // drawn against a milestone and is still unpaid. The region that folded
    // over this would hide the only money actually chasing the designer.
    mockAccount = {
      data: {
        committedCents: 0,
        milestones: [
          {
            id: 'milestone-1',
            invoice_id: 'invoice-1',
            status: 'outstanding',
            paid_at: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByRole('heading', { name: 'Money' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /unfold/i })).not.toBeInTheDocument();
  });

  it('still folds when every milestone is planned but none is receivable', () => {
    mockAccount = {
      data: {
        committedCents: 0,
        milestones: [
          { id: 'milestone-1', invoice_id: null, status: 'pending', paid_at: null },
          {
            id: 'milestone-2',
            invoice_id: null,
            status: 'paid',
            paid_at: '2026-08-01',
          },
        ],
      },
      isLoading: false,
      isError: false,
    };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByRole('button', { name: /unfold/i })).toBeInTheDocument();
  });

  it('names the amendment by the section it is composed from', () => {
    mockInstruments = {
      data: [{ state: 'executed', totalAmountCents: 1_000_000 }],
      isLoading: false,
      error: null,
    };

    render(<MoneyRegion projectId="project-1" activeSection="install" />);

    expect(screen.getByRole('button', { name: 'Add a change' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Amendment' })).not.toBeInTheDocument();
  });

  it('opens on the seam and round-trips back through it', () => {
    render(<MoneyRegion projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: /unfold/i }));

    expect(screen.getByRole('heading', { name: 'Money' })).toBeVisible();
    expect(screen.getByText('Account band')).toBeVisible();
    expect(screen.getByRole('button', { name: /fold/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /fold/i }));

    expect(
      screen.queryByRole('heading', { name: 'Money' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unfold/i })).toBeInTheDocument();
  });

  it('draws an invoice from the ledger with the same call the accounts band makes', () => {
    mockInstruments = {
      data: [{ state: 'executed', totalAmountCents: 1_000_000 }],
      isLoading: false,
      error: null,
    };

    render(<MoneyRegion projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Draw an invoice' }));

    expect(mockOpenInvoiceComposer).toHaveBeenCalledWith({ projectId: 'project-1' });
  });

  it('opens hours through the same opener the band uses, from the ledger', () => {
    mockInstruments = {
      data: [{ state: 'executed', totalAmountCents: 1_000_000 }],
      isLoading: false,
      error: null,
    };

    render(<MoneyRegion projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hours · this project ↗' }));

    expect(mockOpenLedger).toHaveBeenCalledWith('hours', { projectId: 'project-1' });
  });

  it('dispatches the compose-amendment event the band listens for, from the ledger', () => {
    mockInstruments = {
      data: [{ state: 'executed', totalAmountCents: 1_000_000 }],
      isLoading: false,
      error: null,
    };
    const heard = jest.fn();
    window.addEventListener('document:compose-amendment', heard);

    render(<MoneyRegion projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Amendment' }));

    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener('document:compose-amendment', heard);
  });
});
