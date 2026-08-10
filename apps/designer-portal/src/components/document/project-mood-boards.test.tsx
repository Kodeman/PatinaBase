import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectMoodBoards } from './project-mood-boards';

const push = jest.fn();
const useProjectOwnedBoards = jest.fn();
const useProjectBoards = jest.fn();
const useProjectFFEItems = jest.fn();
const mutateAsync = jest.fn();
const createBoard = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/project-1',
  useRouter: () => ({ push }),
}));

jest.mock('@patina/supabase', () => ({
  useProjectOwnedBoards: (...args: unknown[]) => useProjectOwnedBoards(...args),
  useProjectBoards: (...args: unknown[]) => useProjectBoards(...args),
  useProjectFFEItems: (...args: unknown[]) => useProjectFFEItems(...args),
  useContinueBoardInProject: () => ({ mutateAsync, isPending: false }),
  useCreateProjectBoard: () => ({ mutateAsync: createBoard, isPending: false }),
}));

jest.mock('@patina/design-system', () => ({
  BoardComposition: ({ board, interactive }: { board: { id: string }; interactive: boolean }) => (
    <div data-testid={`composition-${board.id}`} data-interactive={String(interactive)} />
  ),
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
    createBoard.mockReset();
    useProjectOwnedBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
    useProjectBoards.mockReturnValue({ data: [frozen], isLoading: false, isError: false });
    useProjectFFEItems.mockReturnValue({ data: [], isLoading: false });
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

  it('keeps the empty board surface visible and creates through the canonical command', async () => {
    useProjectBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
    createBoard.mockResolvedValue('board-new');
    render(<ProjectMoodBoards projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: /start the first working board/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Board name' }), {
      target: { value: 'Living selections' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start board' }));

    await waitFor(() => expect(createBoard).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      name: 'Living selections',
      starterIntent: 'blank',
      idempotencyKey: expect.any(String),
    })));
    expect(push).toHaveBeenCalledWith(
      '/board/board-new?source=project_surface&from=%2Fdoc%2Fproject-1',
    );
  });

  it('caps Continue work at three rows in priority order', () => {
    useProjectFFEItems.mockReturnValue({
      isLoading: false,
      data: [
        { id: 'review', latest_review_verdict: 'comment', created_at: '2026-08-05' },
        { id: 'unsorted', assignment_scope: 'unassigned', created_at: '2026-08-01' },
        { id: 'gap', missing_required_field_count: 2, created_at: '2026-08-03' },
      ],
    });
    render(<ProjectMoodBoards projectId="project-1" />);
    const region = screen.getByLabelText('Continue project FF&E work');
    expect(region.children).toHaveLength(3);
    expect(region.children[0]).toHaveTextContent('Continue client review changes');
    expect(region.children[1]).toHaveTextContent('Route the oldest Unsorted selection');
  });
});
