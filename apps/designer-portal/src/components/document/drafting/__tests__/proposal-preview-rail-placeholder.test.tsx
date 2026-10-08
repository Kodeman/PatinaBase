/**
 * US-19 FR7 F7-10 (R1, D14) — the client's copy carries no placeholder.
 * Under one-voice every preview passes its `clientName` through
 * `householdDisplayName`; with no name each slot prints its own no-name
 * words (`Prepared for you`, `What the client sees`, `Composing their
 * copy…`). A real name is unchanged; flag off, the raw name prints as today.
 */
import { render, screen } from '@testing-library/react';
import { ProposalPreviewRail } from '../proposal-mirror';
import { ProposalPreview } from '../../proposal-preview';

let mockOneVoice = false;
let mockMirrorData: Record<string, unknown> | undefined;

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockMirrorData, error: null, refetch: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  useUpdateProposal: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@patina/utils', () => ({
  proposalTierVisibility: () => ({
    roomBudgets: false,
    lineItems: false,
    paymentSchedule: false,
    timeline: false,
    exclusions: false,
  }),
}));

jest.mock('@patina/design-system', () => ({
  LineItemsBlock: () => null,
  PaymentScheduleBlock: () => null,
  ScopeRoomsBlock: () => null,
  ExclusionsBlock: () => null,
  TimelinePhasesBlock: () => null,
  BoardComposition: () => null,
}));

jest.mock('@/lib/analytics/mood-board-events', () => ({
  moodBoardEvents: { presented: jest.fn() },
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: { document_kind: 'proposal' } }),
}));

jest.mock('../../commercial/commercial-document-body', () => ({
  ServiceAgreementDocumentBody: () => null,
}));

const MIRROR = {
  proposal: { title: 'Aspen' },
  tier: 'full',
  palette: [],
  sections: [],
  rooms: [],
  boards: [],
  lineItems: [],
  totalCents: 0,
  milestones: [],
  phases: [],
  exclusions: [],
};

beforeEach(() => {
  mockOneVoice = false;
  mockMirrorData = MIRROR;
});

describe('ProposalPreviewRail — no placeholder on the client copy (F7-10)', () => {
  it.each(['Client User', 'Client'])(
    'one-voice: %p prints Prepared for you and What the client sees',
    (raw) => {
      mockOneVoice = true;
      render(<ProposalPreviewRail proposalId="p-1" clientName={raw} />);
      expect(screen.getByText('Prepared for you')).toBeInTheDocument();
      expect(screen.getByTestId('proposal-preview-rail')).toHaveAttribute(
        'aria-label',
        'What the client sees',
      );
      expect(screen.queryByText(new RegExp(`Prepared for ${raw}`))).toBeNull();
    },
  );

  it('one-voice: a real name prints Prepared for Mei Tanaka', () => {
    mockOneVoice = true;
    render(<ProposalPreviewRail proposalId="p-1" clientName="Mei Tanaka" />);
    expect(screen.getByText('Prepared for Mei Tanaka')).toBeInTheDocument();
    expect(screen.getByTestId('proposal-preview-rail')).toHaveAttribute(
      'aria-label',
      'What Mei Tanaka sees',
    );
  });

  it('one-voice: composing a placeholder reads Composing their copy…', () => {
    mockOneVoice = true;
    mockMirrorData = undefined;
    render(<ProposalPreviewRail proposalId="p-1" clientName="Client User" />);
    expect(screen.getByText('Composing their copy…')).toBeInTheDocument();
  });

  it('flag off: the raw name prints as today', () => {
    render(<ProposalPreviewRail proposalId="p-1" clientName="Client User" />);
    expect(screen.getByText('Prepared for Client User')).toBeInTheDocument();
  });
});

describe('ProposalPreview — the dialog label (F7-10)', () => {
  it('one-voice: a placeholder labels the dialog What the client sees', () => {
    mockOneVoice = true;
    render(<ProposalPreview proposalId="p-1" clientName="Client" onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'What the client sees');
    expect(screen.getByText('Prepared for you')).toBeInTheDocument();
  });

  it('flag off: the dialog label keeps the raw name', () => {
    render(<ProposalPreview proposalId="p-1" clientName="Client" onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'What Client sees');
    expect(screen.getByText('Prepared for Client')).toBeInTheDocument();
  });
});
