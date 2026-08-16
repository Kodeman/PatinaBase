/**
 * The Drafting Room becomes a press (Start to Signature W4a, Q5 step 2).
 *
 * Flag on, every way into the Room lands on the document instead — except the
 * Desk's flagged-lines walk-in, which is the one entry the paper cannot answer
 * yet and would otherwise be stranded. Flag off, the Room opens exactly as it
 * always has.
 */
import { render, screen } from '@testing-library/react';
import DraftingRoute from './page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/drafting/proposal-1',
}));

jest.mock('@/components/document/rooms/drafting/drafting-room', () => ({
  DraftingRoom: ({ proposalId }: { proposalId: string }) => (
    <div data-room={proposalId}>The Drafting Room</div>
  ),
}));
jest.mock('@/components/document/drafting/drafting-estimate-flow', () => ({
  DraftingEstimateFlow: () => null,
}));

const proposal: { current: Record<string, unknown> | undefined } = {
  current: { id: 'proposal-1', document_kind: 'legacy', status: 'draft' },
};
jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: proposal.current }),
}));

const flag = { on: true, loading: false };
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'worktable' && flag.on,
    isLoading: flag.loading,
  }),
}));

const paramsFor = (proposalId: string) =>
  ({
    status: 'fulfilled',
    value: { proposalId },
    then: () => undefined,
  }) as unknown as Promise<{ proposalId: string }>;

function renderRoute(search = '') {
  window.history.replaceState({}, '', `/drafting/proposal-1${search}`);
  return render(<DraftingRoute params={paramsFor('proposal-1')} />);
}

describe('the Drafting Room as a press', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    flag.on = true;
    flag.loading = false;
    proposal.current = {
      id: 'proposal-1',
      document_kind: 'legacy',
      status: 'draft',
    };
  });

  it('sends a flag-on arrival to the document and never renders the Room', () => {
    renderRoute();
    expect(mockReplace).toHaveBeenCalledWith('/doc/proposal-1');
    expect(screen.queryByText('The Drafting Room')).not.toBeInTheDocument();
    expect(
      screen.getByText(/The drafting happens on the paper now/),
    ).toBeInTheDocument();
  });

  it('opens the Room untouched with the flag off', () => {
    flag.on = false;
    renderRoute();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('The Drafting Room')).toBeInTheDocument();
  });

  it('lets the Desk’s flagged-lines walk-in through — a stranded entry is worse than an open door', () => {
    renderRoute('?flagged=1');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('The Drafting Room')).toBeInTheDocument();
  });

  it('does not press while the flag is still unread — fail closed', () => {
    flag.loading = true;
    renderRoute();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('The Drafting Room')).toBeInTheDocument();
  });

  it('spares a design-services agreement — its authoring never moved to the paper', () => {
    for (const kind of ['design_services', 'service_addendum']) {
      jest.clearAllMocks();
      proposal.current = { id: 'proposal-1', document_kind: kind, status: 'draft' };
      const { unmount } = renderRoute();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.getByText('The Drafting Room')).toBeInTheDocument();
      unmount();
    }
  });

  it('does not press before it knows what it is pressing', () => {
    proposal.current = undefined;
    renderRoute();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('The Drafting Room')).toBeInTheDocument();
  });
});
