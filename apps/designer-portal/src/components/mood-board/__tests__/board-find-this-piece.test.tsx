import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeckImportCandidate, DeckImportItem, EditableMoodBoardItem, PinPatch } from '@patina/types';
import type { BoardRoomControllerApi } from '@/components/portal/scope-builder/board-room-controller';
import { canFindThisPiece, groupFoundCandidates } from '@/hooks/use-board-find-this-piece';
import { BoardFindThisPiece } from '../board-find-this-piece';

let mockFlagOn = true;
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockKeep = jest.fn();
let mockItemRow: DeckImportItem;
let mockProducts: Array<Record<string, unknown>>;

function mockQuery(result: () => unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'in']) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return chain;
}

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: mockFlagOn && name === 'board-photo-match', isLoading: false }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (table: string) => mockQuery(() => (
      table === 'products'
        ? { data: mockProducts, error: null }
        : { data: [mockItemRow], error: null }
    )),
  }),
  deckImportKeys: { all: ['board-deck-import'], items: (id: string) => ['board-deck-import', 'items', id] },
  deckImportRefusalReason: () => null,
  toDeckImportItem: (row: unknown) => row,
  resolveVendor: jest.fn(),
  useKeepBoardDeckImportItem: () => ({ mutateAsync: mockKeep }),
  useSwapBoardDeckImportItem: () => ({ mutateAsync: jest.fn() }),
  useReferenceBoardDeckImportItem: () => ({ mutateAsync: jest.fn() }),
  useUnkeepBoardDeckImportItem: () => ({ mutateAsync: jest.fn() }),
  useAttachBoardDeckImportPins: () => ({ mutateAsync: jest.fn() }),
  useCaptureFromUrl: () => ({ mutateAsync: jest.fn() }),
  useCommitProposalCapture: () => ({ mutateAsync: jest.fn() }),
}));

const CROP = 'https://example.supabase.co/storage/v1/object/public/proposal-mood-boards/b/crop.jpg';

const pin: EditableMoodBoardItem = {
  id: 'pin-1', type: 'image', x: 10, y: 10, width: 200, height: 200, zIndex: 1, rotation: 0,
  locked: false, productId: null, captureId: null, paletteId: null, imageUrl: CROP, content: null,
  data: { name: 'Cove sofa', section_id: 'living' },
};

const look = (rank: number, productId: string, band: DeckImportCandidate['band'], layer: string): DeckImportCandidate => ({
  source: 'look', productId, band, rank, evidence: { layer, similarity: 0.9, fused: true },
});

const candidates: DeckImportCandidate[] = [
  { source: 'words', productId: 'p-words', band: 'possible', rank: 1, evidence: {} },
  look(2, 'p-mine', 'possible', 'personal'),
  look(3, 'p-catalog-likely', 'likely', 'catalog'),
  look(4, 'p-catalog-possible', 'possible', 'catalog'),
];

function itemRow(overrides: Partial<DeckImportItem> = {}): DeckImportItem {
  return {
    id: 'item-1', importId: 'imp-1', elementKey: 'pin:pin-1', boardItemId: 'pin-1', slideIndex: 0,
    slideTitle: null, role: 'product', extracted: {}, state: 'found', foundBy: 'words', candidates,
    chosenProductId: null, attempts: 1, keptBy: null, keptAt: null, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function api(): BoardRoomControllerApi {
  return {
    state: { boardId: 'board-1', items: [pin] },
    replaceItem: jest.fn(),
    addItems: jest.fn().mockReturnValue([]),
    flushPending: jest.fn().mockResolvedValue(undefined),
  } as unknown as BoardRoomControllerApi;
}

function renderAction(room = api(), target = pin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<BoardFindThisPiece api={room} pin={target} />, { wrapper });
  return room;
}

beforeEach(() => {
  mockFlagOn = true;
  mockRpc.mockReset().mockResolvedValue({
    data: { import_id: 'imp-1', resumed: false, status: 'resolving', items: [{ item_id: 'item-1' }] },
    error: null,
  });
  mockInvoke.mockReset().mockResolvedValue({ data: { ok: true, summary: { look: { status: 'ran' } } }, error: null });
  mockKeep.mockReset();
  mockItemRow = itemRow();
  mockProducts = [
    { id: 'p-words', name: 'Cove sofa', images: null, price_retail: null, source_url: null, vendor: { name: 'Maker' } },
    { id: 'p-mine', name: 'My sofa', images: null, price_retail: null, source_url: null, vendor: null },
    { id: 'p-catalog-likely', name: 'Catalog sofa', images: null, price_retail: null, source_url: null, vendor: null },
    { id: 'p-catalog-possible', name: 'Other sofa', images: null, price_retail: null, source_url: null, vendor: null },
  ];
});

describe('groupFoundCandidates', () => {
  it('puts link/words and own-library look matches under the library; catalog look matches by band', () => {
    const groups = groupFoundCandidates(candidates);
    expect(groups.library.map((c) => c.productId)).toEqual(['p-words', 'p-mine']);
    expect(groups.likely.map((c) => c.productId)).toEqual(['p-catalog-likely']);
    expect(groups.possible.map((c) => c.productId)).toEqual(['p-catalog-possible']);
  });

  it('shows at most five', () => {
    const many = Array.from({ length: 7 }, (_, i) => look(i + 1, `p${i}`, 'possible', 'catalog'));
    expect(groupFoundCandidates(many).possible).toHaveLength(5);
  });
});

describe('canFindThisPiece', () => {
  it('is for picture pins that are not already deck pieces', () => {
    expect(canFindThisPiece(pin)).toBe(true);
    expect(canFindThisPiece({ ...pin, type: 'product' })).toBe(false);
    expect(canFindThisPiece({ ...pin, imageUrl: null, data: {} })).toBe(false);
    expect(canFindThisPiece({ ...pin, data: { deck_import: { import_id: 'deck-1', state: 'to_confirm' } } })).toBe(false);
  });
});

describe('BoardFindThisPiece', () => {
  it('renders nothing while board-photo-match is off', () => {
    mockFlagOn = false;
    renderAction();
    expect(screen.queryByRole('button', { name: 'Find this piece' })).toBeNull();
  });

  it('registers a pin job, runs the resolver and shows the candidates in their groups', async () => {
    const room = renderAction();
    fireEvent.click(screen.getByRole('button', { name: 'Find this piece' }));

    await screen.findByRole('region', { name: 'From your library' });
    expect(room.flushPending).toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('register_board_deck_import', {
      p_board_id: 'board-1',
      p_file_sha256: '',
      p_file_name: '',
      p_manifest: {
        source_format: 'pin',
        board_item_id: 'pin-1',
        options: { photo_match: true },
        extracted: { caption: { name: 'Cove sofa' } },
      },
    });
    expect(mockInvoke).toHaveBeenCalledWith('board-deck-import-resolve', { body: { import_id: 'imp-1' } });

    const library = screen.getByRole('region', { name: 'From your library' });
    expect(await within(library).findByText(/Cove sofa/)).toBeInTheDocument();
    expect(within(library).getByText('· Maker')).toBeInTheDocument();
    expect(within(library).getByText('My sofa')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Likely, by look' })).getByText('Catalog sofa')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Possible, by look' })).getByText('Other sofa')).toBeInTheDocument();
    expect(screen.queryByText('Photo match is unavailable right now')).toBeNull();
    // No scores or percentages are shown.
    expect(screen.queryByText(/%|0\.9/)).toBeNull();
  });

  it('says photo match is unavailable when the resolver could not look', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, summary: { look: { status: 'unavailable' } } }, error: null });
    mockItemRow = itemRow({ candidates: candidates.slice(0, 1) });
    renderAction();
    fireEvent.click(screen.getByRole('button', { name: 'Find this piece' }));
    expect(await screen.findByText('Photo match is unavailable right now')).toBeInTheDocument();
    expect(await screen.findByText(/Cove sofa/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Likely, by look' })).toBeNull();
  });

  it('keeps through the keep RPC and pin patch; the picture stays as data.original_image_url', async () => {
    const patch: PinPatch = {
      itemId: 'item-1', boardItemId: 'pin-1', type: 'product', productId: 'p-catalog-likely', captureId: null,
      data: {
        name: 'Catalog sofa', vendor_name: null, price_cents: null, source_url: null,
        product_image_url: 'https://cdn.example/catalog-sofa.jpg',
        deck_import: { state: 'kept', found_by: 'look' },
      },
    };
    mockKeep.mockResolvedValue(patch);
    const room = renderAction();
    fireEvent.click(screen.getByRole('button', { name: 'Find this piece' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep Catalog sofa' }));

    await waitFor(() => expect(room.replaceItem).toHaveBeenCalled());
    expect(mockKeep).toHaveBeenCalledWith({ importId: 'imp-1', itemId: 'item-1', candidateRank: 3 });
    const kept = (room.replaceItem as jest.Mock).mock.calls[0][0] as EditableMoodBoardItem;
    expect(kept.id).toBe('pin-1');
    expect(kept.type).toBe('product');
    expect(kept.productId).toBe('p-catalog-likely');
    expect(kept.imageUrl).toBe(CROP);
    expect(kept.data?.original_image_url).toBe(CROP);
    expect(kept.data?.section_id).toBe('living');
    expect(kept.data?.deck_import).toMatchObject({ import_id: 'imp-1', item_id: 'item-1', state: 'kept', found_by: 'look' });
  });
});
