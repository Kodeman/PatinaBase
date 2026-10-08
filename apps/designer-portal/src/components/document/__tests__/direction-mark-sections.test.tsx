/**
 * US-19 FR2 499-6 / F2-21 — the Direction mark counts what is left to write,
 * never a percentage: `The proposal — {N} sections to write`, and
 * `The proposal — written` at zero. one-voice off keeps today's label.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProposalInstruments } from '../proposal-instruments';

let mockOneVoice = true;
let mockGaps: string[] = [];
let mockPct = 40;

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'one-voice' ? mockOneVoice : false,
    isLoading: false,
  }),
}));

jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({
    state: mockGaps.length === 0 ? 'Ready to send' : 'In progress',
    pct: mockPct,
    fill: [0.4, 0, 0],
    gaps: mockGaps,
  }),
}));

jest.mock('../strata-mark', () => ({
  StrataMark: ({ label }: { label: string }) => <span data-testid="direction-mark">{label}</span>,
}));

jest.mock('@patina/supabase', () => ({
  useProposalFeedback: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({
    data: {
      id: 'proposal-1',
      status: 'draft',
      document_kind: 'legacy',
      commercial_state: null,
      issued_on_paper: false,
      items: [],
    },
    isLoading: false,
  }),
  useProposalEngagement: () => ({ data: [] }),
  useProposalEngagementStats: () => ({ data: null }),
  useNudgeProposal: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../proposal-watch', () => ({ ProposalWatch: () => null }));
jest.mock('../proposal-share-instrument', () => ({ ProposalShareInstrument: () => null }));
jest.mock('../proposal-version-history', () => ({ ProposalVersionHistory: () => null }));
jest.mock('../commercial/service-agreement-instruments', () => ({
  ServiceAgreementInstruments: () => null,
}));
jest.mock('../mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/doc/proposal-1',
}));

const renderDraft = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProposalInstruments proposalId="proposal-1" clientName="Mei Lin" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  mockOneVoice = true;
  mockGaps = ['Scope', 'Fee', 'Terms'];
  mockPct = 40;
});

describe('The Direction mark (499-6)', () => {
  it('prints the sections left to write, never a percentage', () => {
    renderDraft();
    expect(screen.getByTestId('direction-mark')).toHaveTextContent(
      'The proposal — 3 sections to write',
    );
    expect(screen.getByTestId('direction-mark')).not.toHaveTextContent('%');
  });

  it('prints The proposal — written at zero', () => {
    mockGaps = [];
    mockPct = 100;
    renderDraft();
    expect(screen.getByTestId('direction-mark')).toHaveTextContent('The proposal — written');
  });

  it('keeps today’s percentage with one-voice off', () => {
    mockOneVoice = false;
    renderDraft();
    expect(screen.getByTestId('direction-mark')).toHaveTextContent(
      'Drafting the proposal — 40% written',
    );
  });
});
