import { fireEvent, render, screen } from '@testing-library/react';

let mockAuthority: Record<string, unknown>;
let mockBudget: Record<string, unknown>;
let mockInstruments: Record<string, unknown>;
let mockTradeScopes: Record<string, unknown>;
let mockAccount: Record<string, unknown>;

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
});

describe('MoneyRegion', () => {
  it('states the four tiers in dependency order from live figures', () => {
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
    // Deliberately NOT the tier-3 sum: if the two tiers could alias, a swapped
    // hook would read as correct.
    mockAccount = { data: { committedCents: 900_000 }, isLoading: false, isError: false };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByRole('heading', { name: 'Design authority' })).toBeVisible();
    expect(screen.getByText('$18,000 remaining · $13,772 committed')).toBeVisible();
    expect(screen.getByText('Authority · $100,000 authorized')).toBeVisible();
    expect(screen.getByText('Plan · $86,540 working budget v2')).toBeVisible();
    expect(
      screen.getByText(
        'Committed · $13,772 · 2 instruments executed — authorizations and trade scopes',
      ),
    ).toBeVisible();
    expect(screen.getByText('Moved · $9,000 in motion — ordered through installed')).toBeVisible();
    expect(
      screen.getByText(/The accounts’ committed figure — client value of lines at ordered/),
    ).toHaveTextContent('not funds disbursed');
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

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByText('Authority · could not be read')).toBeVisible();
    expect(screen.getByText('Plan · could not be read')).toBeVisible();
    expect(screen.getByText('Committed · could not be read')).toBeVisible();
    expect(screen.getByText('Moved · could not be read')).toBeVisible();
  });

  it('degrades every tier to a band-honest line when nothing is recorded', () => {
    const { container } = render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    expect(screen.getByText('no authority yet')).toBeVisible();
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
    expect(screen.getByText('Authority · no design authority recorded yet')).toBeVisible();
    expect(screen.getByText('Plan · no working budget yet')).toBeVisible();
    expect(screen.getByText('Committed · nothing executed yet')).toBeVisible();
    expect(screen.getByText('Moved · nothing in motion yet')).toBeVisible();
    expect(container).not.toHaveTextContent('$0');
  });

  it('states no figure at all while a tier’s source has not answered', () => {
    mockBudget = { data: undefined, isLoading: true, error: null };
    mockAccount = { data: undefined, isLoading: true, isError: false };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByText('Plan')).toBeVisible();
    expect(screen.getByText('Moved')).toBeVisible();
    expect(screen.queryByText(/Plan · /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Moved · /)).not.toBeInTheDocument();
  });

  it('carries the four detail surfaces the tiers summarise, accounts included', () => {
    render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    expect(screen.getByText('Authority band')).toBeVisible();
    expect(screen.getByText('Commerce section')).toBeVisible();
    expect(screen.getByText('Account band')).toBeVisible();
  });

  it('names the moved tier’s derivation so it cannot be read as the owed total', () => {
    render(<MoneyRegion projectId="project-1" />);
    unfoldIfNeeded();

    const caption = screen.getByText(/Moved is the accounts’ committed figure/);
    expect(caption).toHaveTextContent('not funds disbursed');
    expect(caption).toHaveTextContent('not the contractually owed total above it');
    expect(caption).toHaveTextContent(
      'Absorbs today’s four separate bands: design authority, working budget, authorizations & trade scopes, the accounts.',
    );
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

    expect(screen.getByText(/Moved is the accounts’ committed figure/)).toHaveTextContent(
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
      screen.queryByRole('heading', { name: 'Design authority' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('no authority yet · $0 committed')).toBeVisible();
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

    expect(screen.getByRole('heading', { name: 'Design authority' })).toBeVisible();
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

    expect(screen.getByRole('heading', { name: 'Design authority' })).toBeVisible();
    expect(screen.getByText('Account band')).toBeVisible();
    expect(screen.getByRole('button', { name: /fold/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /fold/i }));

    expect(
      screen.queryByRole('heading', { name: 'Design authority' }),
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
