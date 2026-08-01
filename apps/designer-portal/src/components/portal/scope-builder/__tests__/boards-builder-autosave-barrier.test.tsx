import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardsBuilder } from '../boards-builder';
import {
  getProposalAutosaveSnapshot,
  registerProposalAutosave,
  resetProposalAutosaveRegistryForTests,
} from '@/lib/proposal-autosave-registry';

const mockDuplicateBoard = jest.fn();
const mockDeleteBoard = jest.fn();
const mockUpsertBoard = jest.fn();

const boards = [
  {
    id: 'board-1',
    proposal_id: 'proposal-1',
    project_id: null,
    name: 'Living room direction',
    scope_room_id: null,
    cover_image_url: null,
    cover_fallback_url: null,
    canvas_width: 1200,
    canvas_height: 800,
    background_color: '#FAF8F5',
    sort_order: 0,
    sections: [],
    status: 'active',
    item_count: 1,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
  },
];

jest.mock('@patina/design-system', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: React.PropsWithChildren<{
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children, disabled }: React.PropsWithChildren<{ disabled?: boolean }>) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

jest.mock('../../../../../../../packages/help-system/src/index.ts', () => ({
  EmptyState: () => null,
  useHelpContent: () => ({ data: null }),
}));

jest.mock('@patina/supabase', () => ({
  useBoards: () => ({ data: boards, isLoading: false }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useProposalScopeRooms: () => ({ data: [] }),
  useUpsertBoard: () => ({
    mutate: mockUpsertBoard,
    mutateAsync: mockUpsertBoard,
    isPending: false,
  }),
  useDuplicateBoard: () => ({
    mutate: mockDuplicateBoard,
    mutateAsync: mockDuplicateBoard,
    isPending: false,
  }),
  useDeleteBoard: () => ({
    mutate: mockDeleteBoard,
    mutateAsync: mockDeleteBoard,
    isPending: false,
  }),
}));

jest.mock('@/components/ui/controls', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: React.PropsWithChildren<{
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  IconButton: ({
    children,
    label,
    onClick,
    disabled,
  }: React.PropsWithChildren<{
    label: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }>) => (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  Select: ({
    wrapperClassName: _wrapperClassName,
    ...props
  }: React.ComponentProps<'select'> & { wrapperClassName?: string }) => <select {...props} />,
}));

jest.mock('@/lib/scope/spec-pdf-client', () => ({
  downloadSpecPdf: jest.fn(),
}));
jest.mock('../board-editor', () => ({
  BoardEditor: () => <div>Board editor</div>,
}));

beforeEach(() => {
  mockDuplicateBoard.mockReset();
  mockDuplicateBoard.mockResolvedValue({ ...boards[0], id: 'board-copy' });
  mockDeleteBoard.mockReset();
  mockDeleteBoard.mockResolvedValue(undefined);
  mockUpsertBoard.mockReset();
  mockUpsertBoard.mockResolvedValue(boards[0]);
});

afterEach(() => resetProposalAutosaveRegistryForTests());

describe('BoardsBuilder autosave barrier', () => {
  it('waits for a deferred proposal layout flush before duplicating the board', async () => {
    let dirty = true;
    let resolveFlush: () => void = () => {};
    let resolveDuplicate: (value: (typeof boards)[number]) => void = () => {};
    const flush = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFlush = () => {
            dirty = false;
            resolve();
          };
        }),
    );
    registerProposalAutosave('proposal-1', {
      getSnapshot: () => ({ dirty, flushing: dirty, error: null }),
      flush,
    });
    mockDuplicateBoard.mockImplementation(
      () =>
        new Promise<(typeof boards)[number]>((resolve) => {
          resolveDuplicate = resolve;
        }),
    );

    render(<BoardsBuilder proposalId="proposal-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
    expect(mockDuplicateBoard).not.toHaveBeenCalled();

    await act(async () => resolveFlush());
    await waitFor(() => expect(mockDuplicateBoard).toHaveBeenCalledTimes(1));
    expect(mockDuplicateBoard).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      boardId: 'board-1',
    });

    expect(getProposalAutosaveSnapshot('proposal-1')).toMatchObject({
      dirty: true,
      flushing: true,
    });

    await act(async () => resolveDuplicate({ ...boards[0], id: 'board-copy' }));
    await waitFor(() =>
      expect(getProposalAutosaveSnapshot('proposal-1')).toMatchObject({
        dirty: false,
        flushing: false,
      }),
    );
  });

  it('keeps the board and dialog open when its layout barrier fails', async () => {
    let error: string | null = null;
    registerProposalAutosave('proposal-1', {
      getSnapshot: () => ({ dirty: true, flushing: false, error }),
      flush: async () => {
        error = 'layout save failed';
        throw new Error(error);
      },
    });

    render(<BoardsBuilder proposalId="proposal-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete board' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete board' })[1]!);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /board could not be deleted.*nothing was changed.*layout save failed/i,
    );
    expect(mockDeleteBoard).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Delete board' })).toBeInTheDocument();
    expect(screen.getByText('Board editor')).toBeInTheDocument();
  });
});
