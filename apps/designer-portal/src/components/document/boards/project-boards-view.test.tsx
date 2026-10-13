/**
 * J-01 — the boards destination that did not exist. Below 1440 the ticket's
 * `Boards` row had nowhere to go: the list lived only inside the ≥1440 shelf
 * leaf, which force-closes at that width. These cases pin the page that now
 * answers it — this project's boards, the act that starts one, and the return.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/doc/eng-1/boards',
}));

const mockEngagement = jest.fn();
jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => mockEngagement(),
}));

const mockLive = jest.fn();
const mockFrozen = jest.fn();
const mockStatuses = jest.fn((): Map<string, string> => new Map());
jest.mock('@patina/supabase', () => ({
  useProjectOwnedBoards: () => mockLive(),
  useProjectBoards: () => mockFrozen(),
  // Board-level reaction status chip (board-paths W2b #1) — no active shares
  // in this suite's fixtures, so every row renders no chip.
  useBoardReactionStatuses: () => mockStatuses(),
}));

// SQ-852 — the launcher prints its own `New board` act. It must never mount on
// this page beside the head's; the mock keeps that act so a regression shows.
jest.mock('@/components/portal/scope-builder/boards-builder', () => ({
  BoardsBuilder: () => (
    <button type="button" data-testid="boards-builder">
      New board
    </button>
  ),
}));

type PickerProps = {
  owner: { kind: string; id: string };
  boardsCount: number;
  sortOrderSeed?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (boardId: string, meta: { materialized: boolean }) => void;
};
jest.mock('@/components/portal/scope-builder/board-create-picker-dialog', () => ({
  BoardCreatePickerDialog: (props: PickerProps) =>
    props.open ? (
      <div
        role="dialog"
        aria-label="Start a mood board"
        data-testid="board-picker"
        data-owner={`${props.owner.kind}:${props.owner.id}`}
        data-boards-count={props.boardsCount}
        data-sort-order-seed={props.sortOrderSeed}
      >
        <button type="button" onClick={() => props.onCreated('b-new', { materialized: false })}>
          Blank board
        </button>
        <button type="button" onClick={() => props.onCreated('b-tpl', { materialized: true })}>
          From a template
        </button>
      </div>
    ) : null,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { ProjectBoardsView } from './project-boards-view';
import ProjectBoardsPage from '@/app/(document)/doc/[id]/boards/page';
import { startBoardPending } from '@/lib/document/shelves';

function engagement(over: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    data: {
      kind: 'engagement',
      row: {
        engagement_kind: 'project',
        engagement_id: 'eng-1',
        project_id: 'proj-1',
        title: 'Vandersteen residence',
        active_section: 'project',
        ...over,
      },
    },
  };
}

beforeEach(() => {
  startBoardPending.projectId = null;
  mockReplace.mockClear();
  mockPush.mockClear();
  mockStatuses.mockImplementation(() => new Map());
  mockEngagement.mockReturnValue(engagement());
  mockLive.mockReturnValue({
    isLoading: false,
    data: [
      { id: 'b1', name: 'Living room, warm', item_count: 7, status: 'active' },
      { id: 'b2', name: 'Retired', item_count: 2, status: 'archived' },
    ],
  });
  mockFrozen.mockReturnValue({
    isLoading: false,
    data: [{ id: 'f1', name: 'Signed direction', items: [{}, {}, {}] }],
  });
});

describe('the boards page', () => {
  it('lists this project’s boards, working and signed', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Design boards' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Living room, warm' }),
    ).toHaveAttribute('href', expect.stringContaining('/board/b1'));
    // US-28 S12: the Card's tertiary "Present" act opens the room in Present.
    const present = screen.getByRole('link', { name: 'Present Living room, warm' });
    expect(present).toHaveAttribute('href', expect.stringContaining('/board/b1?'));
    expect(present.getAttribute('href')).toMatch(/[?&]present=1(&|$)/);
    expect(screen.getByText('7 pieces')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Signed design direction' })).toBeInTheDocument();
    expect(screen.getByText(/Signed snapshot · 3 items/)).toBeInTheDocument();
    // An archived board is not a board this project is composing from.
    expect(screen.queryByText('Retired')).toBeNull();
  });

  // US-28 S11 — a job's open boards are a bounded, ranked set: each a Card
  // with a plate slot (U-Q20); the stage prints as a word beside its tick; the
  // act is the scored ＋ New board, never filled; state is an ink word.
  it('lays the open boards as Cards with a plate slot, under the job and its stage word', () => {
    mockEngagement.mockReturnValue(engagement({ client_name: 'Hal and Dana Whitfield' }));
    const { container } = render(<ProjectBoardsView routeId="eng-1" />);

    const card = container.querySelector('article.card[data-board-card="b1"]');
    expect(card).not.toBeNull();
    expect(card!.querySelector('.plate')).not.toBeNull();
    expect(card!.querySelector('.card-up .name')).toHaveTextContent('Living room, warm');
    expect(container.querySelectorAll('article.card')).toHaveLength(1);

    const tick = container.querySelector('.s11-tab-job .tick');
    expect(tick).toHaveClass('st-project');
    expect(tick).toHaveTextContent('Vandersteen residence');
    expect(screen.getByText('Project · Hal and Dana Whitfield')).toBeInTheDocument();

    const act = screen.getByRole('button', { name: 'New board' });
    expect(act.closest('[data-variant="primary"]')).toBeNull();
  });

  it('prints the board’s reaction state as an ink word, never a pigment dot', () => {
    mockStatuses.mockImplementation(() => new Map([['b1', 'reactions_in']]));
    const { container } = render(<ProjectBoardsView routeId="eng-1" />);
    const word = screen.getByText('Feedback received');
    expect(word).toHaveClass('word');
    expect(container.querySelector('.rounded-full')).toBeNull();
  });

  it('says plainly that nothing is signed yet when only working boards exist', () => {
    mockFrozen.mockReturnValue({ isLoading: false, data: [] });
    render(<ProjectBoardsView routeId="eng-1" />);
    expect(
      screen.getByText('Nothing is signed yet. When the client signs a board, it lands here.'),
    ).toBeInTheDocument();
  });

  it('returns by the document’s full name (SP-14)', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(
      screen.getByRole('link', { name: '← Vandersteen residence' }),
    ).toHaveAttribute('href', '/doc/eng-1');
  });

  // SQ-852 — the head's ＋ New board opens the create picker itself; it never
  // mounts the launcher, whose own `New board` act would make two.
  it('opens the create picker from the one New board act, and no second act appears', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.queryByTestId('board-picker')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New board' }));

    const picker = screen.getByTestId('board-picker');
    expect(picker).toHaveAttribute('data-owner', 'project:proj-1');
    // Named from the open boards; ordered after every board, archived included.
    expect(picker).toHaveAttribute('data-boards-count', '1');
    expect(picker).toHaveAttribute('data-sort-order-seed', '2');
    expect(screen.queryByTestId('boards-builder')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'New board' })).toHaveLength(1);
  });

  it('opens the new board in its room, flagging a template for Promote all (DV3)', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blank board' }));
    expect(mockPush).toHaveBeenLastCalledWith(expect.stringContaining('/board/b-new'));
    expect(mockPush.mock.calls[0][0]).not.toContain('materialized=template');

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));
    fireEvent.click(screen.getByRole('button', { name: 'From a template' }));
    expect(mockPush).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/board\/b-tpl\?.*&materialized=template$/),
    );
  });

  it('opens the same picker when the Add-to-project sheet asks for a board (F30)', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    act(() => {
      window.dispatchEvent(new CustomEvent('document:new-project-board'));
    });

    expect(screen.getByTestId('board-picker')).toBeInTheDocument();
  });

  // D4' — ⌘K's "Start a board…" command navigates here before the event it
  // would fire has a listener; the pending flag carries the intent across
  // that navigation instead, same pattern as command-bar.tsx's callSheetPending.
  it('opens the picker immediately when it lands carrying its own project’s pending flag', () => {
    startBoardPending.projectId = 'proj-1'; // this page's project (engagement()'s fixture)
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.getByTestId('board-picker')).toBeInTheDocument();
    expect(startBoardPending.projectId).toBeNull();
  });

  it('does not auto-open the picker when no pending flag was set', () => {
    render(<ProjectBoardsView routeId="eng-1" />);
    expect(screen.queryByTestId('board-picker')).toBeNull();
  });

  // The P2 fix: a boolean flag left stuck true by an abandoned navigation
  // (a superseded push, a fast back, an aborted RSC nav) used to auto-open
  // the builder on the NEXT unrelated project's Boards page. Scoping the
  // flag to a project id closes that leak — a mismatch is ignored, not
  // honored, AND the stale flag is cleared here rather than left to leak
  // into whatever page mounts after this one.
  it('ignores and clears a pending flag left over from a different project', () => {
    startBoardPending.projectId = 'proj-abandoned';
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.queryByTestId('board-picker')).toBeNull();
    expect(startBoardPending.projectId).toBeNull();
  });

  it('says so plainly when there are none', () => {
    mockLive.mockReturnValue({ isLoading: false, data: [] });
    mockFrozen.mockReturnValue({ isLoading: false, data: [] });

    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.getAllByText('No boards yet · start one').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'New board' })).toBeInTheDocument();
  });

  it('carries a moved identity to the boards page, not to the document', async () => {
    mockEngagement.mockReturnValue({
      isLoading: false,
      data: { kind: 'redirect', projectId: 'proj-9' },
    });

    render(<ProjectBoardsView routeId="prop-1" />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/doc/proj-9/boards'),
    );
  });

  it('offers the same act on install and care, where the ticket also mounts', () => {
    mockEngagement.mockReturnValue(engagement({ active_section: 'install' }));
    render(<ProjectBoardsView routeId="eng-1" />);
    expect(
      screen.getByRole('button', { name: 'New board' }),
    ).toBeInTheDocument();
  });

  it('sends a proposal’s boards to the Drafting Room instead of dead-ending', () => {
    // ⌘K offers ONE Boards door on every document (F62). On a proposal the
    // project id is null, and the boards that exist are the Drafting Room's.
    mockEngagement.mockReturnValue(
      engagement({
        engagement_kind: 'proposal',
        project_id: null,
        proposal_id: 'prop-9',
      }),
    );
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(
      screen.getByRole('link', { name: 'Open the proposal workspace' }),
    ).toHaveAttribute('href', '/drafting/prop-9');
    expect(
      screen.getByText(
        'This proposal’s design boards are in the proposal workspace.',
      ),
    ).toBeInTheDocument();
  });

  it('says the plain thing when there is no proposal either', () => {
    mockEngagement.mockReturnValue(
      engagement({ engagement_kind: 'proposal', project_id: null }),
    );
    render(<ProjectBoardsView routeId="eng-1" />);
    expect(screen.queryByRole('link', { name: /proposal workspace/ })).toBeNull();
    expect(
      screen.getByText(
        'Design boards are available once a project is created.',
      ),
    ).toBeInTheDocument();
  });

  it('uses singular item for a one-item signed snapshot', () => {
    mockFrozen.mockReturnValue({
      isLoading: false,
      data: [{ id: 'f1', name: 'Signed direction', items: [{}] }],
    });
    render(<ProjectBoardsView routeId="eng-1" />);
    expect(screen.getByText('Signed snapshot · 1 item')).toBeInTheDocument();
  });

  it('is what /doc/[id]/boards renders', async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ProjectBoardsPage params={Promise.resolve({ id: 'eng-1' })} />
        </Suspense>,
      );
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Design boards' }),
    ).toBeInTheDocument();
  });
});
