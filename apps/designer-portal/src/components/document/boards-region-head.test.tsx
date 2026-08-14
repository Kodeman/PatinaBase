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

describe('Mood boards region head', () => {
  it('inks exactly one ledger leader when open with a live board', () => {
    useProjectOwnedBoards.mockReturnValue({ data: [live], isLoading: false, isError: false });
    render(<ProjectMoodBoards projectId="project-1" />);

    expect(
      document.querySelectorAll('[data-action-variant="inked"]'),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'New board' })).toHaveAttribute(
      'data-action-variant',
      'inked',
    );
  });

  it('renders a folded seam with the no-boards-yet summary by default', () => {
    render(<ProjectMoodBoards projectId="project-1" />);

    expect(
      screen.queryByRole('heading', { name: 'Mood boards' }),
    ).not.toBeInTheDocument();
    const seam = screen.getByRole('button', {
      name: 'Mood boards no boards yet unfold ↓',
    });
    expect(seam).toBeInTheDocument();
    expect(seam).toHaveAttribute('aria-expanded', 'false');
  });

  it('round-trips the seam: unfolding mounts the head and body', () => {
    render(<ProjectMoodBoards projectId="project-1" />);

    const seam = screen.getByRole('button', { name: /mood boards/i });
    fireEvent.click(seam);

    expect(
      screen.getByRole('heading', { name: 'Mood boards' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Start the project.s visual direction/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /unfold/i }),
    ).not.toBeInTheDocument();
  });
});
