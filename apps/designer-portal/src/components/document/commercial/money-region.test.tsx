import { render, screen } from '@testing-library/react';

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

beforeEach(() => {
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
    mockAccount = { data: { committedCents: 1_377_200 }, isLoading: false, isError: false };

    render(<MoneyRegion projectId="project-1" />);

    expect(screen.getByText('Design authority · remaining $18,000')).toBeVisible();
    expect(screen.getByText('Authority · $100,000 authorized')).toBeVisible();
    expect(screen.getByText('Plan · $86,540 working budget v2')).toBeVisible();
    expect(screen.getByText('Committed · $13,772 · 2 authorizations executed')).toBeVisible();
    expect(screen.getByText('Moved · $13,772 released to vendors')).toBeVisible();
    expect(screen.getByText('What has actually left')).toBeVisible();
  });

  it('degrades every tier to a band-honest line when nothing is recorded', () => {
    const { container } = render(<MoneyRegion projectId="project-1" />);

    expect(screen.queryByText(/Design authority · remaining/)).not.toBeInTheDocument();
    expect(screen.getByText('Authority · no design authority recorded yet')).toBeVisible();
    expect(screen.getByText('Plan · no working budget yet')).toBeVisible();
    expect(screen.getByText('Committed · nothing executed yet')).toBeVisible();
    expect(screen.getByText('Moved · nothing released yet')).toBeVisible();
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

    expect(screen.getByText('Authority band')).toBeVisible();
    expect(screen.getByText('Commerce section')).toBeVisible();
    expect(screen.getByText('Account band')).toBeVisible();
  });

  it('names the moved tier’s derivation so it cannot be read as the owed total', () => {
    render(<MoneyRegion projectId="project-1" />);

    expect(
      screen.getByText(/Moved is the accounts’ own figure/),
    ).toHaveTextContent('not the contractually owed total above it');
  });
});
