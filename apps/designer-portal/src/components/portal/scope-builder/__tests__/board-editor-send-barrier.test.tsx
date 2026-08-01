import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardEditor } from '../board-editor';
import { SendSheet } from '@/components/document/overlays/send-sheet';
import {
  getProposalAutosaveSnapshot,
  resetProposalAutosaveRegistryForTests,
} from '@/lib/proposal-autosave-registry';

const mockSaveLayout = jest.fn();
const mockLegacySaveLayout = jest.fn();
const mockSend = jest.fn();
const mockInvalidate = jest.fn();
const mockMirrorRefetch = jest.fn();
const mockRefreshDrafting = jest.fn();

const board = {
  id: 'board-1',
  proposal_id: 'proposal-1',
  project_id: null,
  name: 'Living room direction',
  scope_room_id: null,
  cover_image_url: null,
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#FAF8F5',
  sort_order: 0,
  sections: [],
  status: 'active',
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-01T12:00:00.000Z',
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

const staleClientData = {
  totalCents: 1_320_000,
  milestones: [
    {
      id: 'deposit',
      label: 'Project deposit',
      percentage: 100,
      amount_cents: 1_320_000,
    },
  ],
  paymentSchedule: { storedAmountsMatch: true },
  sendSnapshot: {
    proposalUpdatedAt: '2026-08-01T12:00:00.000Z',
    proposalTotalAmount: 1_320_000,
    scheduleFingerprint: 'before-layout',
  },
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  useIsMutating: () => 0,
}));

jest.mock('@patina/design-system', () => ({
  BoardCanvas: ({ onItemsChange }: { onItemsChange: (items: Array<Record<string, unknown>>) => void }) => (
    <button
      type="button"
      onClick={() =>
        onItemsChange([
          {
            id: 'item-1',
            type: 'note',
            position: { x: 140, y: 180 },
            zIndex: 2,
            rotation: 35,
          },
        ])
      }
    >
      Drag and rotate board item
    </button>
  ),
  BoardComposition: () => null,
  ImagePaletteExtractor: () => null,
}));

jest.mock('@patina/supabase', () => {
  const mutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn() });
  return {
    PROPOSAL_CLIENT_MUTATION_KEY: 'proposal-client-copy',
    assessProposalPaymentSchedule: () => ({ issues: [] }),
    createBrowserClient: jest.fn(),
    useBoard: () => ({ data: board }),
    useAddBoardItem: mutation,
    useUpdateBoardItem: mutation,
    useDeleteBoardItem: mutation,
    useSaveBoardLayout: () => ({
      mutate: mockLegacySaveLayout,
      mutateAsync: mockSaveLayout,
    }),
    useUpsertBoard: mutation,
    usePalettes: () => ({ data: [], isLoading: false }),
    useUpsertPalette: mutation,
    useUpsertSwatch: mutation,
    useProposal: () => ({ data: { client_id: null } }),
    useRoomScans: () => ({ data: [] }),
    useBoardFeedback: () => ({ data: [] }),
    useProductPrices: () => ({ data: undefined }),
    useProposalScheduleItems: () => ({ data: [] }),
    useAddProposalItem: mutation,
  };
});

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
  Select: (props: React.ComponentProps<'select'>) => <select {...props} />,
  Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
}));

jest.mock('../../proposals/product-picker-modal', () => ({
  ProductPickerModal: () => null,
}));

jest.mock('../board-suggestions-rail', () => ({
  BoardSuggestionsRail: () => null,
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({
    data: {
      id: 'proposal-1',
      title: 'Lakeshore library & lounge',
      version: 1,
      total_amount: 1_320_000,
      client_id: 'client-1',
      client: {
        id: 'client-1',
        full_name: 'Harper Vale',
        email: 'harper@example.com',
      },
      items: [],
    },
  }),
  useProposalVersions: () => ({ data: [] }),
  useSendProposal: () => ({ mutateAsync: mockSend, isPending: false }),
  useUpdateProposal: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({
    gaps: [],
    isLoading: false,
    isFetching: false,
    refresh: mockRefreshDrafting,
  }),
}));

jest.mock('@/components/document/drafting/proposal-mirror', () => ({
  useProposalMirrorData: () => ({
    data: staleClientData,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: mockMirrorRefetch,
  }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => null,
}));

jest.mock('@/components/portal/toast-provider', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { sent: jest.fn() },
}));

jest.mock('@/components/document/overlays/doc-sheet', () => ({
  DocSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

jest.mock('@/components/document/document-action', () => ({
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DocumentAction: ({
    children,
    loading,
    loadingLabel,
    onClick,
    disabled,
  }: React.PropsWithChildren<{
    loading?: boolean;
    loadingLabel?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }>) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>
      {loading ? loadingLabel : children}
    </button>
  ),
}));

function BoardToSendHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <BoardEditor proposalId="proposal-1" boardId="board-1" />
      <button type="button" onClick={() => setOpen(true)}>
        Open send sheet
      </button>
      <SendSheet proposalId="proposal-1" open={open} onClose={() => setOpen(false)} />
    </>
  );
}

beforeEach(() => {
  mockSaveLayout.mockReset();
  mockSaveLayout.mockResolvedValue(undefined);
  mockLegacySaveLayout.mockReset();
  mockSend.mockReset();
  mockSend.mockResolvedValue({ _emailDispatched: true });
  mockInvalidate.mockReset();
  mockInvalidate.mockResolvedValue(undefined);
  mockRefreshDrafting.mockReset();
  mockRefreshDrafting.mockResolvedValue({ gaps: [] });
  mockMirrorRefetch.mockReset();
  mockMirrorRefetch.mockResolvedValue({ data: staleClientData, error: null });
});

afterEach(() => resetProposalAutosaveRegistryForTests());

describe('BoardEditor proposal send barrier', () => {
  it('flushes a drag and rotation before the 600ms debounce can review or send', async () => {
    const order: string[] = [];
    const freshData = {
      ...staleClientData,
      sendSnapshot: {
        ...staleClientData.sendSnapshot,
        scheduleFingerprint: 'after-layout',
      },
    };
    let persisted = false;
    let resolveLayout: () => void = () => {};
    mockSaveLayout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          order.push('layout');
          resolveLayout = () => {
            persisted = true;
            resolve();
          };
        }),
    );
    mockMirrorRefetch.mockImplementation(async () => {
      order.push('refetch');
      return { data: persisted ? freshData : staleClientData, error: null };
    });

    render(<BoardToSendHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Drag and rotate board item' }));
    expect(mockSaveLayout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open send sheet' }));

    const send = screen.getByRole('button', { name: 'Send proposal' });
    await waitFor(() => expect(mockSaveLayout).toHaveBeenCalledTimes(1));
    expect(mockLegacySaveLayout).not.toHaveBeenCalled();
    expect(getProposalAutosaveSnapshot('proposal-1')).toMatchObject({
      dirty: true,
      flushing: true,
      error: null,
    });
    expect(send).toBeDisabled();
    expect(mockMirrorRefetch).not.toHaveBeenCalled();

    await act(async () => resolveLayout());
    await waitFor(() => expect(send).toBeEnabled());
    expect(order.slice(0, 2)).toEqual(['layout', 'refetch']);
    expect(mockSaveLayout).toHaveBeenCalledWith({
      boardId: 'board-1',
      proposalId: 'proposal-1',
      positions: [
        expect.objectContaining({
          id: 'item-1',
          x: 140,
          y: 180,
          z_index: 2,
          rotation: 35,
        }),
      ],
    });

    fireEvent.click(send);
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ expectedSnapshot: freshData.sendSnapshot }));
  });

  it('keeps a failed layout dirty and blocks client-copy review and send', async () => {
    mockSaveLayout.mockRejectedValue(new Error('layout save failed'));

    render(<BoardToSendHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Drag and rotate board item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open send sheet' }));

    expect(await screen.findByText(/layout save failed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send proposal' })).toBeDisabled();
    expect(mockMirrorRefetch).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
