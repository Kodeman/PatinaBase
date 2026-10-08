/**
 * US-19 FR3 F3-20 / 515-3 — V11 is the whole paper: the Direction card's body
 * reads `A draft taking shape — keep going.` with no percentage; the count
 * lives in the mark only. one-voice off keeps today's sentence.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProposalInstruments } from '../proposal-instruments';

let mockOneVoice = true;

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'one-voice' ? mockOneVoice : false,
    isLoading: false,
  }),
}));

jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({
    state: 'In progress',
    pct: 40,
    fill: [0.4, 0, 0],
    gaps: ['Scope', 'Fee', 'Terms'],
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

const body = () =>
  document.querySelector('[data-direction-card] p.text-\\[14px\\]') as HTMLElement;

beforeEach(() => {
  mockOneVoice = true;
});

describe('The Direction card body (F3-20, 515-3)', () => {
  it('reads A draft taking shape — keep going. with no percentage', () => {
    renderDraft();
    expect(body()).toHaveTextContent(/^A draft taking shape — keep going\.$/);
    expect(body()).not.toHaveTextContent('%');
    expect(screen.queryByText(/% written/)).not.toBeInTheDocument();
  });

  it('keeps today’s percentage sentence with one-voice off', () => {
    mockOneVoice = false;
    renderDraft();
    expect(body()).toHaveTextContent('A draft taking shape · 40% written — keep going');
  });
});
