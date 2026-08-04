import { render, screen } from '@testing-library/react';

import { ProposalDocument } from '../proposal-document';

const mockBoardsBlock = jest.fn(() => null);

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'client-1' } }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  useClientProposalFeedback: () => ({ data: [] }),
}));

jest.mock('@patina/utils', () => ({
  shareVisibilityForTier: () => ({
    itemDetails: true,
    pricing: true,
    supplierIdentity: false,
    leadTimes: false,
    sourceUrls: false,
  }),
  blockVisibilityFromShare: () => ({
    lineItems: false,
    roomBudgets: false,
    paymentSchedule: true,
    timeline: true,
    exclusions: true,
    scopeRooms: true,
    investmentTotal: true,
  }),
  rollupVerdicts: jest.fn(),
  formatVerdictRollup: () => '',
  recordCompletenessFill: jest.fn(),
  recordCompletenessPct: jest.fn(),
}));

jest.mock('@patina/design-system', () => ({
  LineItemsBlock: ({ totalCents }: { totalCents: number }) => (
    <div data-testid="investment-block">Investment total: {totalCents}</div>
  ),
  PaymentScheduleBlock: ({ milestones }: { milestones: Array<{ label: string }> }) => (
    <div data-testid="payment-schedule-block">{milestones.map((milestone) => milestone.label).join(', ')}</div>
  ),
  TimelinePhasesBlock: ({ phases }: { phases: Array<{ name: string }> }) => (
    <div data-testid="timeline-block">{phases.map((phase) => phase.name).join(', ')}</div>
  ),
  ScopeRoomsBlock: ({ rooms }: { rooms: Array<{ name: string }> }) => (
    <div data-testid="scope-rooms-block">{rooms.map((room) => room.name).join(', ')}</div>
  ),
  ExclusionsBlock: () => null,
}));

jest.mock('@/components/strata-mark', () => ({ StrataMark: () => null }));
jest.mock('@/components/board-block', () => ({
  BoardsBlock: (props: unknown) => mockBoardsBlock(props),
}));
jest.mock('@/components/proposal-line-feedback', () => ({
  LineFeedback: () => null,
}));
jest.mock('@/lib/analytics/events', () => ({
  proposalClientEvents: {
    viewedByClient: jest.fn(),
    sectionViewed: jest.fn(),
  },
}));

describe('ProposalDocument structured proposal data', () => {
  beforeEach(() => mockBoardsBlock.mockClear());

  it('renders scope, investment, payment schedule, and timeline without authored section rows', () => {
    render(
      <ProposalDocument
        proposal={
          {
            id: 'proposal-1',
            title: 'Whole-home closeout',
            status: 'sent',
            designer_id: 'designer-1',
            client_visibility_tier: 'milestone',
            created_at: '2026-08-01T12:00:00.000Z',
            total_amount: 100_000,
            items: [],
          } as never
        }
        sections={[
          {
            id: 'section-1',
            proposal_id: 'proposal-1',
            type: 'vision',
            title: 'Style direction',
            body: 'Warm minimal',
            metadata: {},
            sort_order: 0,
            created_at: '2026-08-01T12:00:00.000Z',
            updated_at: '2026-08-01T12:00:00.000Z',
          } as never,
        ]}
        paymentMilestones={[
          {
            id: 'milestone-1',
            proposal_id: 'proposal-1',
            label: 'Final payment',
            percentage: 100,
            amount_cents: 100_000,
            trigger_condition: 'At project completion',
            sort_order: 0,
            created_at: '2026-08-01T12:00:00.000Z',
          } as never,
        ]}
        phases={[
          {
            id: 'phase-1',
            proposal_id: 'proposal-1',
            name: 'Consultation',
            duration_weeks: 1,
            sort_order: 0,
            created_at: '2026-08-01T12:00:00.000Z',
            updated_at: '2026-08-01T12:00:00.000Z',
          } as never,
        ]}
        scopeRooms={[
          {
            id: 'room-1',
            proposal_id: 'proposal-1',
            name: 'Living Room',
            room_type: 'living',
            budget_cents: 0,
            sort_order: 0,
            created_at: '2026-08-01T12:00:00.000Z',
            updated_at: '2026-08-01T12:00:00.000Z',
          } as never,
        ]}
        trackEngagement={false}
      />
    );

    expect(screen.getByText('Style direction')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'In scope' })).toBeInTheDocument();
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByTestId('investment-block')).toHaveTextContent('100000');
    expect(screen.getByTestId('payment-schedule-block')).toHaveTextContent('Final payment');
    expect(screen.getByTestId('timeline-block')).toHaveTextContent('Consultation');
  });

  it('forwards pre-resolved authenticated boards as the client surface', () => {
    const resolvedBoards = [{ id: 'board-1', name: 'Living room', items: [] }] as never;
    render(
      <ProposalDocument
        proposal={{
          id: 'proposal-1',
          title: 'Living room',
          status: 'sent',
          designer_id: 'designer-1',
          client_visibility_tier: 'milestone',
          created_at: '2026-08-01T12:00:00.000Z',
          total_amount: 0,
          items: [],
        } as never}
        sections={[]}
        boards={[]}
        resolvedBoards={resolvedBoards}
        moodBoardSurface="client_proposal"
        feedbackEnabled
        trackEngagement={false}
      />,
    );

    expect(mockBoardsBlock).toHaveBeenCalledWith(expect.objectContaining({
      resolved: resolvedBoards,
      proposalId: 'proposal-1',
      feedbackEnabled: true,
      surface: 'client_proposal',
    }));
  });
});
