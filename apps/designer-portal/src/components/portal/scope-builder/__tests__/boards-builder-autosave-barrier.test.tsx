import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardsBuilder } from '../boards-builder';

const push = jest.fn();
const upsert = jest.fn();
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
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio' }] }),
  useBoardTemplates: () => ({ data: [template], isLoading: false, isError: false }),
  useUpsertBoard: () => ({ mutateAsync: upsert, isPending: false }),
  useMaterializeBoardTemplate: () => ({ mutateAsync: materialize, isPending: false }),
}));

describe('BoardsBuilder launcher', () => {
  beforeEach(() => {
    push.mockReset();
    upsert.mockReset();
    materialize.mockReset();
    draftingTouched.mockReset();
    templateUsed.mockReset();
    mockProposalBoards = [board];
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

  it('uses the project owner namespace before creating a project-owned board', async () => {
    upsert.mockResolvedValue({ id: 'project-board' });
    render(<BoardsBuilder projectId="same-id" />);

    fireEvent.click(screen.getByRole('button', { name: 'New board' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blank board A clean, flexible canvas. Choose' }));

    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      proposalId: undefined,
      projectId: 'same-id',
    })));
    expect(runAutosaveAction).toHaveBeenCalledWith(
      { kind: 'project', id: 'same-id' },
      expect.any(Function),
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
});
