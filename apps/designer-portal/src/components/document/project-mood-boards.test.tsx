import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  BoardComposition: ({ board, interactive }: { board: { id: string }; interactive: boolean }) => (
    <div data-testid={`composition-${board.id}`} data-interactive={String(interactive)} />
  ),
}));

jest.mock('@/components/portal/scope-builder/boards-builder', () => ({
  BoardsBuilder: ({ projectId }: { projectId: string }) => <div data-testid="boards-builder">Boards for {projectId}</div>,
}));

const frozen = {
  id: 'snapshot-1',
  project_id: 'project-1',
  source_board_id: 'proposal-board-1',
  name: 'Signed living room',
  project_room_id: null,
  cover_image_url: null,
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#faf8f5',
  sections: [{ id: 'section-1', name: 'Palette' }],
  items: [
    {
      type: 'note',
      x: 10,
      y: 20,
      width: 180,
      height: 100,
      z_index: 1,
      rotation: 0,
      product_id: null,
      image_url: null,
      content: 'Keep the room warm',
      data: {},
    },
  ],
  sort_order: 0,
  created_at: '2026-08-03T12:00:00.000Z',
};

describe('ProjectMoodBoards', () => {
  beforeEach(() => {
    push.mockReset();
    mutateAsync.mockReset();
    useProjectOwnedBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
    useProjectBoards.mockReturnValue({ data: [frozen], isLoading: false, isError: false });
    useProjectFFEItems.mockReturnValue({ data: [], isLoading: false, isError: false });
    useProjectFfeReadiness.mockReturnValue({ data: [], isLoading: false, isError: false });
    useProjectReviewAttention.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it('renders an id-less frozen snapshot read-only and continues it into the room', async () => {
    mutateAsync.mockResolvedValue('live-board-1');
    render(<ProjectMoodBoards projectId="project-1" />);

    expect(screen.getByText('Signed living room')).toBeInTheDocument();
    expect(screen.getByTestId('composition-snapshot-1')).toHaveAttribute('data-interactive', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Continue in project' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectBoardId: 'snapshot-1',
        projectId: 'project-1',
      }),
    );
    expect(push).toHaveBeenCalledWith(
      '/board/live-board-1?source=project_surface&from=%2Fdoc%2Fproject-1',
    );
  });

  it('offers the existing lineage board instead of another continuation', () => {
    useProjectOwnedBoards.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 'live-board-existing',
          proposal_id: null,
          project_id: 'project-1',
          source_project_board_id: 'snapshot-1',
          name: 'Signed living room — working',
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
          item_count: 1,
        },
      ],
    });

    render(<ProjectMoodBoards projectId="project-1" />);

    expect(screen.queryByRole('button', { name: 'Continue in project' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open continued board' })).toHaveAttribute(
      'href',
      '/board/live-board-existing?source=project_surface&from=%2Fdoc%2Fproject-1',
    );
  });

  it('guides a new project into the canonical board builder', () => {
    useProjectBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ProjectMoodBoards projectId="project-1" />);

    // Boards are empty, so the region defaults folded shut — unfold the seam first.
    fireEvent.click(screen.getByRole('button', { name: /mood boards/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start a mood board' }));
    expect(screen.getByTestId('boards-builder')).toHaveTextContent('Boards for project-1');
  });

  it('opens the canonical board builder from the working-boards surface', () => {
    render(<ProjectMoodBoards projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: /start the first working board/i }));
    expect(screen.getByTestId('boards-builder')).toHaveTextContent('Boards for project-1');
  });

  it('uses only fields present on the live selection query for Continue work', () => {
    useProjectFFEItems.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        { id: 'review', latest_review_verdict: 'comment', created_at: '2026-08-05' },
        { id: 'unsorted', assignment_scope: 'unassigned', created_at: '2026-08-01' },
        { id: 'gap', missing_required_field_count: 2, created_at: '2026-08-03' },
      ],
    });
    render(<ProjectMoodBoards projectId="project-1" />);
    const region = screen.getByLabelText('Continue project FF&E work');
    expect(region.children).toHaveLength(1);
    expect(region.children[0]).toHaveTextContent('Route the oldest Unsorted selection');
    expect(region).not.toHaveTextContent('Continue client review changes');
    expect(region).not.toHaveTextContent('release-blocking specification');
  });

  it('prioritizes unresolved review attention and authoritative release gaps', () => {
    useProjectOwnedBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
    useProjectFFEItems.mockReturnValue({
      data: [{ id: 'selected-gap', design_disposition: 'selected', created_at: '2026-08-01' }],
      isLoading: false,
      isError: false,
    });
    useProjectReviewAttention.mockReturnValue({
      data: [{ feedbackId: 'feedback-1', selectionId: 'selected-gap', verdict: 'comment' }],
      isLoading: false,
      isError: false,
    });
    useProjectFfeReadiness.mockReturnValue({
      data: [{ selectionId: 'selected-gap', ready: false, missingFields: ['vendor'] }],
      isLoading: false,
      isError: false,
    });
    render(<ProjectMoodBoards projectId="project-1" />);
    const region = screen.getByLabelText('Continue project FF&E work');
    expect(region.children[0]).toHaveTextContent('Answer a client question');
    expect(region.children[1]).toHaveTextContent('release-blocking specification');
  });

  it('filters archived live boards and fails closed while selections load', () => {
    useProjectOwnedBoards.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [{ id: 'archived', status: 'archived', name: 'Old board', updated_at: '2026-08-10', item_count: 2 }],
    });
    useProjectFFEItems.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ProjectMoodBoards projectId="project-1" />);
    expect(screen.getByLabelText('Mood boards')).toBeInTheDocument();
    expect(screen.queryByText('Old board')).not.toBeInTheDocument();
  });

  it('does not route inactive selections from Continue', () => {
    useProjectFFEItems.mockReturnValue({
      data: [
        { id: 'removed', assignment_scope: 'unassigned', removed_at: '2026-08-10' },
        { id: 'rejected', assignment_scope: 'unassigned', design_disposition: 'not_selected' },
        { id: 'old', assignment_scope: 'unassigned', design_disposition: 'superseded' },
      ],
      isLoading: false,
      isError: false,
    });

    render(<ProjectMoodBoards projectId="project-1" />);

    expect(screen.queryByText('Route the oldest Unsorted selection')).not.toBeInTheDocument();
    expect(screen.getByText('Make the first project selection')).toBeInTheDocument();
  });

  it('keeps board creation and continuation read-only after Project', () => {
    render(<ProjectMoodBoards projectId="project-1" canCreate={false} />);
    expect(screen.queryByRole('button', { name: 'New board' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start the first working board/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue in project' })).not.toBeInTheDocument();
    expect(screen.getByText('Historical')).toBeInTheDocument();
  });
});
