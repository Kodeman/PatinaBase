/**
 * W5-R2 item 1 — the proposal spread re-parents these blocks by region:
 * `vision` takes the description, `scope` takes the per-room budgets and the
 * engagement's terms, `investment` takes the totals ledger alone (the Offer
 * folds open at its foot, mounted by the caller, not by this component). The
 * direction spread's one stop (`only` omitted) keeps every block, in the
 * same order, byte-identical to the pre-W5-R2 render — this file proves the
 * three filtered groups together lose nothing that the unfiltered render
 * printed.
 */
import { render, screen } from '@testing-library/react';
import { ProposalBlocksReadOnly } from './proposal-blocks-readonly';

let mockProposal: Record<string, unknown> | undefined;
let mockScopeRooms: Array<Record<string, unknown>> = [];
let mockMilestones: Array<Record<string, unknown>> = [];
let mockPhases: Array<Record<string, unknown>> = [];
let mockExclusions: Array<Record<string, unknown>> = [];
let mockScheduleMilestones: Array<Record<string, unknown>> = [];
let mockLoading = false;

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: mockProposal, isLoading: mockLoading }),
}));

jest.mock('@patina/supabase', () => ({
  useProposalPaymentMilestones: () => ({ data: mockMilestones }),
  useProposalPhases: () => ({ data: mockPhases }),
  useProposalExclusions: () => ({ data: mockExclusions }),
  useProposalScopeRooms: () => ({ data: mockScopeRooms }),
  useProposalScheduleMilestones: () => ({ data: mockScheduleMilestones }),
}));

jest.mock('@patina/design-system', () => ({
  LineItemsBlock: () => <div data-testid="block-line-items" />,
  PaymentScheduleBlock: () => <div data-testid="block-payments" />,
  TimelinePhasesBlock: () => <div data-testid="block-timeline" />,
  ExclusionsBlock: () => <div data-testid="block-exclusions" />,
  ScopeRoomsBlock: () => <div data-testid="block-scope-rooms" />,
}));

jest.mock('./commercial/commercial-document-body', () => ({
  ServiceAgreementDocumentBody: () => <div data-testid="commercial-body" />,
}));

const BASE_PROPOSAL = {
  id: 'proposal-1',
  document_kind: null,
  description: 'A quiet, light-filled primary suite.',
  items: [{ id: 'item-1', name: 'Sofa', quantity: 1, unit_price: 100, line_total_cents: 10_000 }],
  total_amount: 184_500_00,
};

describe('ProposalBlocksReadOnly — three groups, nothing lost (W5-R2 item 1)', () => {
  beforeEach(() => {
    mockProposal = { ...BASE_PROPOSAL };
    mockScopeRooms = [{ id: 'room-1', name: 'Primary bedroom', room_type: 'bedroom', budget_cents: 40_000_00 }];
    mockMilestones = [{ id: 'ms-1', label: 'Deposit', percentage: 50, amount_cents: 92_250_00, trigger_condition: null }];
    mockPhases = [{ id: 'phase-1', name: 'Schematic design', duration_weeks: 2, duration_days: null }];
    mockExclusions = [{ id: 'ex-1', description: 'Window treatments', category: null }];
    mockScheduleMilestones = [];
    mockLoading = false;
  });

  it('unfiltered (direction spread) renders every block, in order', () => {
    render(<ProposalBlocksReadOnly proposalId="proposal-1" />);
    // description → investment ledger → scope rooms → payments → timeline → exclusions
    const order = screen
      .getAllByTestId(/^block-/)
      .map((el) => el.getAttribute('data-testid'));
    expect(screen.getByText(BASE_PROPOSAL.description)).toBeInTheDocument();
    expect(screen.getByTestId('block-line-items')).toBeInTheDocument();
    expect(screen.getByTestId('block-scope-rooms')).toBeInTheDocument();
    expect(screen.getByTestId('block-payments')).toBeInTheDocument();
    expect(screen.getByTestId('block-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('block-exclusions')).toBeInTheDocument();
    expect(order).toEqual([
      'block-line-items',
      'block-scope-rooms',
      'block-payments',
      'block-timeline',
      'block-exclusions',
    ]);
  });

  it('`only="vision"` renders the description alone', () => {
    const { container } = render(
      <ProposalBlocksReadOnly proposalId="proposal-1" only="vision" />,
    );
    expect(screen.getByText(BASE_PROPOSAL.description)).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="block-"]')).toBeNull();
  });

  it('`only="scope"` renders the per-room budgets and the terms, not the ledger or the description', () => {
    render(<ProposalBlocksReadOnly proposalId="proposal-1" only="scope" />);
    expect(screen.getByTestId('block-scope-rooms')).toBeInTheDocument();
    expect(screen.getByTestId('block-payments')).toBeInTheDocument();
    expect(screen.getByTestId('block-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('block-exclusions')).toBeInTheDocument();
    expect(screen.queryByTestId('block-line-items')).toBeNull();
    expect(screen.queryByText(BASE_PROPOSAL.description)).toBeNull();
  });

  it('`only="scope"` omits the terms once the Offer movement has claimed them', () => {
    render(
      <ProposalBlocksReadOnly proposalId="proposal-1" only="scope" omitOfferBlocks />,
    );
    expect(screen.getByTestId('block-scope-rooms')).toBeInTheDocument();
    expect(screen.queryByTestId('block-payments')).toBeNull();
    expect(screen.queryByTestId('block-timeline')).toBeNull();
    expect(screen.queryByTestId('block-exclusions')).toBeNull();
  });

  it('`only="investment"` renders the totals ledger alone', () => {
    render(<ProposalBlocksReadOnly proposalId="proposal-1" only="investment" />);
    expect(screen.getByTestId('block-line-items')).toBeInTheDocument();
    expect(screen.queryByTestId('block-scope-rooms')).toBeNull();
    expect(screen.queryByTestId('block-payments')).toBeNull();
    expect(screen.queryByText(BASE_PROPOSAL.description)).toBeNull();
  });

  it('a filtered group with nothing of its own prints nothing (OD-1 — the head states it, not a stand-in)', () => {
    mockProposal = { ...BASE_PROPOSAL, description: null };
    const { container: visionContainer } = render(
      <ProposalBlocksReadOnly proposalId="proposal-1" only="vision" />,
    );
    expect(visionContainer).toBeEmptyDOMElement();

    mockScopeRooms = [];
    mockMilestones = [];
    mockPhases = [];
    mockExclusions = [];
    const { container: scopeContainer } = render(
      <ProposalBlocksReadOnly proposalId="proposal-1" only="scope" />,
    );
    expect(scopeContainer).toBeEmptyDOMElement();

    mockProposal = { ...BASE_PROPOSAL, items: [], total_amount: 0 };
    const { container: investmentContainer } = render(
      <ProposalBlocksReadOnly proposalId="proposal-1" only="investment" />,
    );
    expect(investmentContainer).toBeEmptyDOMElement();
  });

  it('a filtered call stays quiet while loading — no "Unfolding…" printed three times', () => {
    mockLoading = true;
    const { container } = render(
      <ProposalBlocksReadOnly proposalId="proposal-1" only="scope" />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Unfolding…')).toBeNull();
  });

  it('the unfiltered call still prints "Unfolding…" while loading', () => {
    mockLoading = true;
    render(<ProposalBlocksReadOnly proposalId="proposal-1" />);
    expect(screen.getByText('Unfolding…')).toBeInTheDocument();
  });

  it('a commercial (non-legacy) experience prints once, under `vision`, and nothing on the other two calls', () => {
    mockProposal = { ...BASE_PROPOSAL, document_kind: 'design_services' };
    const { container: scope } = render(
      <ProposalBlocksReadOnly proposalId="proposal-1" only="scope" />,
    );
    expect(scope).toBeEmptyDOMElement();

    const { container: investment } = render(
      <ProposalBlocksReadOnly proposalId="proposal-1" only="investment" />,
    );
    expect(investment).toBeEmptyDOMElement();

    render(<ProposalBlocksReadOnly proposalId="proposal-1" only="vision" />);
    expect(screen.getByTestId('commercial-body')).toBeInTheDocument();
  });
});
