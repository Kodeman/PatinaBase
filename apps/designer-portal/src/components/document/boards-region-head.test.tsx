import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectMoodBoards } from './project-mood-boards';

const push = jest.fn();
const useProjectOwnedBoards = jest.fn();
const useProjectBoards = jest.fn();
const useProjectFFEItems = jest.fn();
const useProjectFfeReadiness = jest.fn();
const useProjectReviewAttention = jest.fn();
const mutateAsync = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/project-1',
  useRouter: () => ({ push }),
}));

jest.mock('@patina/supabase', () => ({
  useProjectOwnedBoards: (...args: unknown[]) => useProjectOwnedBoards(...args),
  useProjectBoards: (...args: unknown[]) => useProjectBoards(...args),
  useProjectFFEItems: (...args: unknown[]) => useProjectFFEItems(...args),
  useProjectFfeReadiness: (...args: unknown[]) => useProjectFfeReadiness(...args),
  useProjectReviewAttention: (...args: unknown[]) => useProjectReviewAttention(...args),
  useContinueBoardInProject: () => ({ mutateAsync, isPending: false }),
  // Board-level reaction status chip (board-paths W2b #1) — no active shares
  // in this suite's fixtures, so every card renders no chip.
  useBoardReactionStatuses: () => new Map(),
}));

jest.mock('@patina/design-system', () => ({
  BoardComposition: () => <div />,
}));

jest.mock('@/components/portal/scope-builder/boards-builder', () => ({
  BoardsBuilder: ({ projectId }: { projectId: string }) => (
    <div data-testid="boards-builder">Boards for {projectId}</div>
  ),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

const live = {
  id: 'live-board-1',
  proposal_id: null,
  project_id: 'project-1',
  source_project_board_id: null,
  name: 'Living room mood',
  scope_room_id: null,
  cover_image_url: null,
  cover_fallback_url: null,
  cover_fallback_urls: [],
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#faf8f5',
  sort_order: 0,
  sections: [],
  status: 'active',
  created_at: '2026-08-03T12:00:00.000Z',
  updated_at: '2026-08-03T12:00:00.000Z',
  item_count: 2,
};

beforeEach(() => {
  window.localStorage.clear();
  push.mockReset();
  mutateAsync.mockReset();
  useProjectOwnedBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
  useProjectBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
  useProjectFFEItems.mockReturnValue({ data: [], isLoading: false, isError: false });
  useProjectFfeReadiness.mockReturnValue({ data: [], isLoading: false, isError: false });
  useProjectReviewAttention.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe('Boards region head', () => {
  it('inks exactly one ledger leader when open with a live board', () => {
    useProjectOwnedBoards.mockReturnValue({ data: [live], isLoading: false, isError: false });
    render(<ProjectMoodBoards projectId="project-1" />);

    expect(
      document.querySelectorAll('[data-action-variant="inked"]'),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Start a board' })).toHaveAttribute(
      'data-action-variant',
      'inked',
    );
  });

  // D4' — an empty region used to default folded shut, so the only "Start a
  // board" affordance was a click behind a plain unfold seam. It now defaults
  // OPEN even with no boards yet; a designer can still fold it explicitly
  // (that choice is remembered, same as ever — see the round-trip below).
  it('renders unfolded by default even with no boards yet', () => {
    render(<ProjectMoodBoards projectId="project-1" />);

    expect(screen.getByRole('heading', { name: 'Boards' })).toBeInTheDocument();
    expect(
      screen.getByText(/Start the project.s visual direction/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unfold/i })).not.toBeInTheDocument();
  });

  it('round-trips the fold: an explicit fold shows the seam, and unfolding it restores the head and body', () => {
    render(<ProjectMoodBoards projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Fold ↑' }));

    const seam = screen.getByRole('button', { name: /no boards yet/i });
    expect(seam).toBeInTheDocument();
    expect(seam).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Boards' })).not.toBeInTheDocument();

    fireEvent.click(seam);

    expect(
      screen.getByRole('heading', { name: 'Boards' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Start the project.s visual direction/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /unfold/i }),
    ).not.toBeInTheDocument();
  });
});
