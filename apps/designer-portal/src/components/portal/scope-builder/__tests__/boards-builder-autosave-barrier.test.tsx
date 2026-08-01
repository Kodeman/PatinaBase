import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardsBuilder } from '../boards-builder';
import {
  flushProposalAutosaves,
  getProposalAutosaveSnapshot,
  registerProposalAutosave,
  resetProposalAutosaveRegistryForTests,
} from '@/lib/proposal-autosave-registry';

const mockDuplicateBoard = jest.fn();
const mockDeleteBoard = jest.fn();
const mockUpsertBoard = jest.fn();
const mockSaveLayout = jest.fn();
const mockMutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false });

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

const editorBoard = {
  ...boards[0],
  items: [
    {
      id: 'item-1',
      board_id: 'board-1',
      type: 'note',
      x: 10,
      y: 20,
      width: 200,
      height: 120,
      z_index: 0,
      rotation: 0,
      locked: false,
      product_id: null,
      capture_id: null,
      palette_id: null,
      image_url: null,
      content: 'Material direction',
      data: {},
      created_at: '2026-08-01T12:00:00.000Z',
      updated_at: '2026-08-01T12:00:00.000Z',
    },
  ],
};

jest.mock('@patina/design-system', () => ({
  BoardCanvas: ({
    items,
    onItemsChange,
    readOnly,
  }: {
    items: Array<{ id: string; position: { x: number; y: number } }>;
    onItemsChange: (items: Array<Record<string, unknown>>) => void;
    readOnly: boolean;
  }) => (
    <div>
      <span>{items[0] ? `Canvas x ${items[0].position.x}` : 'Canvas empty'}</span>
      <span>{readOnly ? 'Canvas locked' : 'Canvas editable'}</span>
      <div
        role="button"
        tabIndex={0}
        onClick={() =>
          onItemsChange([
            {
              ...items[0],
              position: { x: 400, y: 420 },
              zIndex: 2,
              rotation: 35,
            },
          ])
        }
      >
        Drag board item
      </div>
    </div>
  ),
  BoardComposition: () => null,
  ImagePaletteExtractor: () => null,
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
  createBrowserClient: jest.fn(),
  useBoards: () => ({ data: boards, isLoading: false }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useProposalScopeRooms: () => ({ data: [] }),
  useBoard: () => ({ data: editorBoard }),
  useAddBoardItem: () => mockMutation(),
  useUpdateBoardItem: () => mockMutation(),
  useDeleteBoardItem: () => mockMutation(),
  useSaveBoardLayout: () => ({
    mutate: mockSaveLayout,
    mutateAsync: mockSaveLayout,
  }),
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
  usePalettes: () => ({ data: [], isLoading: false }),
  useUpsertPalette: () => mockMutation(),
  useUpsertSwatch: () => mockMutation(),
  useProposal: () => ({ data: { client_id: null } }),
  useRoomScans: () => ({ data: [] }),
  useBoardFeedback: () => ({ data: [] }),
  useProductPrices: () => ({ data: undefined }),
  useProposalScheduleItems: () => ({ data: [] }),
  useAddProposalItem: () => mockMutation(),
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
  Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
}));

jest.mock('@/lib/scope/spec-pdf-client', () => ({
  downloadSpecPdf: jest.fn(),
}));
jest.mock('../../proposals/product-picker-modal', () => ({
  ProductPickerModal: () => null,
}));
jest.mock('../board-suggestions-rail', () => ({
  BoardSuggestionsRail: () => null,
}));

beforeEach(() => {
  mockDuplicateBoard.mockReset();
  mockDuplicateBoard.mockResolvedValue({ ...boards[0], id: 'board-copy' });
  mockDeleteBoard.mockReset();
  mockDeleteBoard.mockResolvedValue(undefined);
  mockUpsertBoard.mockReset();
  mockUpsertBoard.mockResolvedValue(boards[0]);
  mockSaveLayout.mockReset();
  mockSaveLayout.mockResolvedValue(undefined);
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

  it('locks the real editor against stale canvas changes throughout a deferred duplicate', async () => {
    let resolveDuplicate: (value: (typeof boards)[number]) => void = () => {};
    mockDuplicateBoard.mockImplementation(
      () =>
        new Promise<(typeof boards)[number]>((resolve) => {
          resolveDuplicate = resolve;
        }),
    );

    render(<BoardsBuilder proposalId="proposal-1" />);
    expect(await screen.findByText('Canvas x 10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(mockDuplicateBoard).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Canvas locked')).toBeInTheDocument();

    // This div remains pointer-active inside a disabled fieldset and invokes
    // the stale callback even though the real BoardEditor set readOnly.
    fireEvent.click(screen.getByRole('button', { name: 'Drag board item' }));
    expect(screen.getByText('Canvas x 10')).toBeInTheDocument();
    expect(mockSaveLayout).not.toHaveBeenCalled();

    await act(async () => resolveDuplicate({ ...boards[0], id: 'board-copy' }));
    await waitFor(() => expect(screen.getByText('Canvas editable')).toBeInTheDocument());
    await act(async () => flushProposalAutosaves('proposal-1'));

    expect(screen.getByText('Canvas x 10')).toBeInTheDocument();
    expect(mockSaveLayout).not.toHaveBeenCalled();
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
    expect(screen.getByText('Canvas x 10')).toBeInTheDocument();
  });
});
