import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardsBuilder } from '../boards-builder';

const push = jest.fn();
const upsert = jest.fn();
const createProjectBoard = jest.fn();
const materialize = jest.fn();
const draftingTouched = jest.fn();
const templateUsed = jest.fn();
const runAutosaveAction = jest.fn(async (
  _owner: { kind: 'proposal' | 'project'; id: string },
  action: () => Promise<void>,
) => action());

const board = {
  id: 'board-1',
  proposal_id: 'proposal-1',
  project_id: null,
  name: 'Living room direction',
  scope_room_id: null,
  cover_image_url: null,
  cover_fallback_url: null,
  cover_fallback_urls: [],
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#FAF8F5',
  sort_order: 0,
  sections: [],
  status: 'active',
  item_count: 4,
  verdict_counts: { approved: 2, rejected: 1, comment: 0, total: 3 },
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-01T12:00:00.000Z',
};
let mockProposalBoards = [board];
let mockProjectBoards: typeof mockProposalBoards = [];

const template = {
  id: 'template-1',
  template_key: 'single-room-concept',
  name: 'Single room concept',
  description: 'A balanced room direction.',
  kind: 'seeded',
  studio_id: null,
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#FAF8F5',
  sections: [],
  items: [],
  cover_url: null,
  created_by: null,
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-01T12:00:00.000Z',
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/drafting/proposal-1',
}));

jest.mock('@/lib/proposal-autosave-registry', () => ({
  runBoardOwnerAutosaveAction: (...args: Parameters<typeof runAutosaveAction>) =>
    runAutosaveAction(...args),
}));

jest.mock('@/lib/analytics/mood-board-events', () => ({
  moodBoardEvents: {
    draftingTouched: (...args: unknown[]) => draftingTouched(...args),
    templateUsed: (...args: unknown[]) => templateUsed(...args),
  },
}));

jest.mock('@/components/ui/controls', () => ({
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

jest.mock('@patina/design-system', () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

jest.mock('@patina/supabase', () => ({
  useBoards: () => ({ data: mockProposalBoards, isLoading: false }),
  useProjectOwnedBoards: () => ({ data: mockProjectBoards, isLoading: false }),
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio' }] }),
  useBoardTemplates: () => ({ data: [template], isLoading: false, isError: false }),
  useUpsertBoard: () => ({ mutateAsync: upsert, isPending: false }),
  useCreateProjectBoard: () => ({ mutateAsync: createProjectBoard, isPending: false }),
  useMaterializeBoardTemplate: () => ({ mutateAsync: materialize, isPending: false }),
}));

describe('BoardsBuilder launcher', () => {
  beforeEach(() => {
    push.mockReset();
    upsert.mockReset();
    createProjectBoard.mockReset();
    materialize.mockReset();
    draftingTouched.mockReset();
    templateUsed.mockReset();
    mockProposalBoards = [board];
    mockProjectBoards = [];
    runAutosaveAction.mockClear();
  });

  it('records a durable drafting-touch denominator and opens existing boards with attribution', async () => {
    render(<BoardsBuilder proposalId="proposal-1" />);

    await waitFor(() => expect(draftingTouched).toHaveBeenCalledWith({
      proposal_id: 'proposal-1',
      board_count: 1,
      has_board: true,
      surface: 'drafting_facet',
      touch_type: 'facet_visit',
    }));
    expect(draftingTouched).toHaveBeenCalledTimes(1);

    expect(screen.queryByText('Canvas editable')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open mood board Living room direction' })).toHaveAttribute(
      'href',
      '/board/board-1?source=drafting_strip&from=%2Fdrafting%2Fproposal-1',
    );
    expect(screen.getByText('4 pieces · Open room')).toBeInTheDocument();
    expect(screen.getByLabelText('Client verdicts: 2 approved, 1 flagged')).toHaveTextContent('2 Approved');
    expect(screen.getByLabelText('Client verdicts: 2 approved, 1 flagged')).toHaveTextContent('1 Flagged');
  });

  it('counts an empty-state facet visit while making the no-board cohort explicit', async () => {
    mockProposalBoards = [];

    render(<BoardsBuilder proposalId="proposal-1" />);

    await waitFor(() => expect(draftingTouched).toHaveBeenCalledWith({
      proposal_id: 'proposal-1',
      board_count: 0,
      has_board: false,
      surface: 'drafting_facet',
      touch_type: 'facet_visit',
    }));
  });

  it('flushes surrounding work before creating a blank board and navigating', async () => {
    upsert.mockResolvedValue({ id: 'blank-board' });
    render(<BoardsBuilder proposalId="proposal-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blank board A clean, flexible canvas. Choose' }));

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(runAutosaveAction).toHaveBeenCalledWith(
      { kind: 'proposal', id: 'proposal-1' },
      expect.any(Function),
    );
    expect(push).toHaveBeenCalledWith(
      '/board/blank-board?source=drafting_strip&from=%2Fdrafting%2Fproposal-1',
    );
  });

  it('creates a project-owned blank board through the owner-aware server path', async () => {
    createProjectBoard.mockResolvedValue('project-board');
    render(<BoardsBuilder projectId="same-id" />);

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blank board A clean, flexible canvas. Choose' }));

    await waitFor(() => expect(createProjectBoard).toHaveBeenCalledWith({
      projectId: 'same-id',
      name: 'Board 1',
    }));
    // useUpsertBoard throws outright for a project owner, so it must never be
    // the blank-create path on this leg.
    expect(upsert).not.toHaveBeenCalled();
    expect(runAutosaveAction).toHaveBeenCalledWith(
      { kind: 'project', id: 'same-id' },
      expect.any(Function),
    );
    expect(push).toHaveBeenCalledWith(
      '/board/project-board?source=project_surface&from=%2Fdrafting%2Fproposal-1',
    );
    expect(draftingTouched).not.toHaveBeenCalled();
  });

  it('offers Patina starters and materializes a fresh board under the owner', async () => {
    materialize.mockResolvedValue('template-board');
    render(<BoardsBuilder proposalId="proposal-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));
    expect(screen.getByText('Patina starters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start from Single room concept' }));

    await waitFor(() =>
      expect(materialize).toHaveBeenCalledWith({
        templateId: 'template-1',
        owner: { kind: 'proposal', id: 'proposal-1' },
      }),
    );
    expect(push).toHaveBeenCalledWith(
      '/board/template-board?source=drafting_strip&from=%2Fdrafting%2Fproposal-1',
    );
  });

  // IA-6 — naming prompt.
  it('threads an explicit board name through the blank-create path', async () => {
    upsert.mockResolvedValue({ id: 'blank-board' });
    render(<BoardsBuilder proposalId="proposal-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));
    fireEvent.change(screen.getByDisplayValue('Board 2'), {
      target: { value: 'Primary Bedroom Concept' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Blank board A clean, flexible canvas. Choose' }));

    await waitFor(() => expect(upsert).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      name: 'Primary Bedroom Concept',
      sortOrder: 1,
    }));
  });

  it('threads an explicit board name through the template-materialize path, overriding the template default', async () => {
    materialize.mockResolvedValue('template-board');
    render(<BoardsBuilder proposalId="proposal-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));
    fireEvent.change(screen.getByDisplayValue('Board 2'), {
      target: { value: 'Kitchen — from starter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start from Single room concept' }));

    await waitFor(() => expect(materialize).toHaveBeenCalledWith({
      templateId: 'template-1',
      owner: { kind: 'proposal', id: 'proposal-1' },
      name: 'Kitchen — from starter',
    }));
  });

  it('selects the whole default name on focus, mirroring the share dialog pattern', () => {
    render(<BoardsBuilder proposalId="proposal-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'New board' }));

    const selectSpy = jest.spyOn(HTMLInputElement.prototype, 'select');
    fireEvent.focus(screen.getByDisplayValue('Board 2'));
    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockRestore();
  });

  // IA-7 — archived boards reachable.
  describe('archived boards', () => {
    beforeEach(() => {
      mockProposalBoards = [
        board,
        {
          ...board,
          id: 'board-archived',
          name: 'Retired direction',
          status: 'archived',
          updated_at: '2026-07-15T00:00:00.000Z',
        },
      ];
    });

    it('makes the archived count a control that reveals a read-only list with an Unarchive action', async () => {
      upsert.mockResolvedValue({});
      render(<BoardsBuilder proposalId="proposal-1" />);

      fireEvent.click(screen.getByRole('button', { name: '1 archived' }));
      expect(screen.getByText('Retired direction')).toBeInTheDocument();
      expect(screen.getByText(/Archived · .*2026/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
      await waitFor(() => expect(upsert).toHaveBeenCalledWith({
        boardId: 'board-archived',
        status: 'active',
      }));
    });

    it('ships the archived list read-only for a project-owned board (no backend unarchive path)', () => {
      mockProjectBoards = [
        {
          ...board,
          id: 'proj-board-archived',
          project_id: 'same-id',
          proposal_id: null,
          name: 'Retired project board',
          status: 'archived',
        },
      ];
      render(<BoardsBuilder projectId="same-id" />);

      fireEvent.click(screen.getByRole('button', { name: '1 archived' }));
      expect(screen.getByText('Retired project board')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument();
    });
  });
});
