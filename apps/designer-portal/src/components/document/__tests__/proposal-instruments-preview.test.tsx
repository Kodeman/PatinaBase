/**
 * US-19 FR3 F3-25 / 518-3 (`one-voice`) — one Preview doorway per paper. The
 * letterhead's `Preview the client's copy` is the one; ProposalInstruments
 * stands its own Preview down — the watch's `Preview as …` once the proposal
 * is out, the design agreement's `Preview client copy` before. Flag off,
 * both keep it.
 */
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProposalInstruments } from '../proposal-instruments';

let mockProposal: Record<string, unknown> = {};
let mockOneVoice = false;

jest.mock('@patina/supabase', () => ({
  useProposalFeedback: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: mockProposal, isLoading: false }),
  useProposalEngagement: () => ({ data: [] }),
  useProposalEngagementStats: () => ({ data: null }),
  useNudgeProposal: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));

const mockWatchProps = jest.fn();
jest.mock('../proposal-watch', () => ({
  ProposalWatch: (props: { previewInLetterhead?: boolean }) => {
    mockWatchProps(props.previewInLetterhead ?? false);
    return null;
  },
}));

const mockAgreementProps = jest.fn();
jest.mock('../commercial/service-agreement-instruments', () => ({
  ServiceAgreementInstruments: (props: { previewInLetterhead?: boolean }) => {
    mockAgreementProps(props.previewInLetterhead ?? false);
    return null;
  },
}));

jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/doc/proposal-1',
}));

function renderInstruments() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProposalInstruments proposalId="proposal-1" clientName="Elena Marlowe" />
    </QueryClientProvider>,
  );
}

describe('ProposalInstruments — one Preview doorway (FR3 F3-25, 518-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOneVoice = false;
  });

  it('one-voice: the watch prints no Preview of its own once the proposal is out', () => {
    mockOneVoice = true;
    mockProposal = { id: 'proposal-1', status: 'sent', document_kind: 'legacy' };
    renderInstruments();
    expect(mockWatchProps).toHaveBeenLastCalledWith(true);
  });

  it('one-voice: the design agreement prints no Preview of its own', () => {
    mockOneVoice = true;
    mockProposal = { id: 'proposal-1', status: 'draft', document_kind: 'design_services' };
    renderInstruments();
    expect(mockAgreementProps).toHaveBeenLastCalledWith(true);
  });

  it('flag off: both keep their Preview', () => {
    mockProposal = { id: 'proposal-1', status: 'sent', document_kind: 'legacy' };
    renderInstruments();
    expect(mockWatchProps).toHaveBeenLastCalledWith(false);

    mockProposal = { id: 'proposal-1', status: 'draft', document_kind: 'design_services' };
    renderInstruments();
    expect(mockAgreementProps).toHaveBeenLastCalledWith(false);
  });
});
