/**
 * US-19 FR2 F2-16 and F2-9 (`one-voice`) — the Direction card at 390.
 *
 * Design review 2 (`390-direction-top`): `Not started yet` broke a word a line
 * beside `WRITE THE PROPOSAL →`, which overprinted it. Below 640 the card's row
 * wraps and a zero-height, full-basis break puts the act on its own line under
 * the status. The share doorway beneath it printed `SHARE…`; D1 names it
 * `Sharing`. jsdom lays nothing out, so the stack is asserted as structure.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProposalInstruments } from '../proposal-instruments';

let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));
jest.mock('@patina/supabase', () => ({
  useProposalFeedback: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({
    data: { id: 'proposal-1', status: 'draft', document_kind: 'legacy', project_id: null },
    isLoading: false,
  }),
  useProposalEngagement: () => ({ data: [] }),
  useProposalEngagementStats: () => ({ data: null }),
  useNudgeProposal: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({ state: 'Not started', pct: 0, fill: [0, 0, 0], gaps: [] }),
}));
jest.mock('../proposal-watch', () => ({ ProposalWatch: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../proposal-version-history', () => ({ ProposalVersionHistory: () => null }));
jest.mock('../overlays/share-sheet', () => ({ ShareSheet: () => null }));
jest.mock('../commercial/service-agreement-instruments', () => ({
  ServiceAgreementInstruments: () => null,
}));
jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
  useMobileSecondaryAction: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/doc/proposal-1',
}));

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProposalInstruments proposalId="proposal-1" clientName="Elena Marlowe" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockOneVoice = true;
});

describe('the Direction card at 390 under one-voice (FR2 F2-16)', () => {
  it('stacks `Not started yet` above `Write the proposal` below 640', () => {
    const { container } = renderCard();
    const card = container.querySelector('[data-direction-card]') as HTMLElement;
    expect(card).toHaveClass('max-[639px]:flex-wrap');

    const status = screen.getByText('Not started yet');
    const act = screen.getByRole('button', { name: /Write the proposal/ });
    const brk = card.querySelector('[data-direction-card-break]') as HTMLElement;
    expect(brk).toHaveClass('hidden', 'basis-full', 'h-0', 'max-[639px]:block');
    // Order on the line: the status's block, then the break, then the act.
    expect(card.contains(status)).toBe(true);
    expect(brk.previousElementSibling?.contains(status)).toBe(true);
    expect(brk.nextElementSibling).toBe(act);
  });

  it('names the share doorway `Sharing`, never `Share…` (F2-9)', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Sharing' })).toBeInTheDocument();
    expect(screen.queryByText('Share…')).toBeNull();
  });

  it('flag off: the card and the doorway are unchanged', () => {
    mockOneVoice = false;
    const { container } = renderCard();
    const card = container.querySelector('[data-direction-card]') as HTMLElement;
    expect(card).not.toHaveClass('max-[639px]:flex-wrap');
    expect(card.querySelector('[data-direction-card-break]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share…' })).toBeInTheDocument();
  });
});
