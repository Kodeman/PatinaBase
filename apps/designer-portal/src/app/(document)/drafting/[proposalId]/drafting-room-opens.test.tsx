/**
 * The Drafting Room opens — flag on and flag off (Start to Signature W4,
 * corrected).
 *
 * W4a built a press here: with `worktable` on, a legacy proposal's
 * `/drafting/<id>` redirected to `/doc/<id>`. The W4 review found the Offer
 * had no authorable home once it did — draft proposals compose the Speccing
 * table (Scope + Vision only) and the Finalize table's Offer seams are
 * read-only by the Room's own gate — so phases, exclusions, payment milestones
 * and terms could never be written on a new proposal. Kody's Q5 ruling was a
 * TWO-step retirement and the decomposition is step two, a later release; the
 * press was descoped.
 *
 * This spec is the guard on that ruling: the route is the Room, in both flag
 * states, until the Speccing table gives the Offer somewhere to live.
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

const flag = { on: true };
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'worktable' && flag.on,
    isLoading: false,
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

describe('the Drafting Room route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    flag.on = true;
  });

  it('opens the Room with the worktable flag ON — the press is descoped', () => {
    renderRoute();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('The Drafting Room')).toBeInTheDocument();
  });

  it('opens the Room with the flag off, exactly as it always has', () => {
    flag.on = false;
    renderRoute();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('The Drafting Room')).toBeInTheDocument();
  });

  it('opens the Room on the Desk’s flagged-lines walk-in, either way', () => {
    for (const on of [true, false]) {
      jest.clearAllMocks();
      flag.on = on;
      const { unmount } = renderRoute('?flagged=1');
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.getByText('The Drafting Room')).toBeInTheDocument();
      unmount();
    }
  });
});
