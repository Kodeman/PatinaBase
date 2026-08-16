/**
 * One act, offered once (Start to Signature W4a).
 *
 * The Finalize table's head promotes one of the wall's own verbs to the table's
 * inked leader. The wall reads the SAME derivation — never a second answer —
 * and stands that one verb down. This spec walks the wall: with the table on,
 * the nudge leaves the send-wall line and the watch's own acts are told which
 * one has been taken; off the table nothing moves.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProposalInstruments } from '../proposal-instruments';

let mockProposal: Record<string, unknown> = {};
let mockFeedback: Array<Record<string, unknown>> = [];

jest.mock('@patina/supabase', () => ({
  useProposalFeedback: () => ({ data: mockFeedback }),
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: mockProposal, isLoading: false }),
  useProposalEngagement: () => ({ data: [] }),
  useProposalEngagementStats: () => ({ data: null }),
  useNudgeProposal: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const mockWatchProps = jest.fn();
jest.mock('../proposal-watch', () => ({
  ProposalWatch: (props: { hoistedLeader?: string | null }) => {
    mockWatchProps(props.hoistedLeader ?? null);
    return <div data-watch />;
  },
}));

jest.mock('../commercial/service-agreement-instruments', () => ({
  ServiceAgreementInstruments: () => null,
}));

jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/doc/proposal-1',
}));

function renderWall(props: { onFinalizeTable?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProposalInstruments
        proposalId="proposal-1"
        clientName="Avery Stone"
        {...props}
      />
    </QueryClientProvider>,
  );
}

const approvals = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    proposal_item_id: `line-${i}`,
    verdict: 'approved',
    created_at: '2026-08-12T12:00:00Z',
    resolved_at: null,
  }));

describe('the wall stands down what the table’s head has taken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProposal = {
      id: 'proposal-1',
      status: 'sent',
      document_kind: 'legacy',
      commercial_state: null,
      issued_on_paper: false,
      sent_at: '2026-08-10T12:00:00Z',
      last_nudged_at: null,
      items: [{ id: 'line-0' }, { id: 'line-1' }],
    };
    mockFeedback = approvals(2);
  });

  it('drops the send-wall nudge when the head carries it, and names the state instead', () => {
    renderWall({ onFinalizeTable: true });
    expect(
      screen.queryByRole('button', { name: /Nudge Avery Stone/ }),
    ).not.toBeInTheDocument();
    const line = screen.getByLabelText('Proposal state');
    expect(line.textContent).toContain('Sent');
    // The head took the verb, not the news: without the state word the wall
    // read "Sent 5 days ago" over a row with nothing in it.
    expect(line.textContent).toContain('awaiting the client’s signature');
    expect(line.textContent).toContain('—');
    expect(mockWatchProps).toHaveBeenCalledWith('nudge');
  });

  it('keeps the nudge on the wall off the Finalize table', () => {
    renderWall();
    expect(
      screen.getByRole('button', { name: /Nudge Avery Stone/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Proposal state').textContent).toContain('—');
    expect(mockWatchProps).toHaveBeenCalledWith(null);
  });

  it('tells the watch which of its own acts the head took', () => {
    mockFeedback = [];
    renderWall({ onFinalizeTable: true });
    // No verdicts: the head leads with the watch's Preview act.
    expect(mockWatchProps).toHaveBeenCalledWith('preview');
    // …and the wall's own nudge is untouched, because the head did not take it.
    expect(
      screen.getByRole('button', { name: /Nudge Avery Stone/ }),
    ).toBeInTheDocument();
  });
});
