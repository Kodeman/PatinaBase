import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DeckImportItem } from '@patina/types';
import { webMatchResetLabel } from '@/hooks/use-board-web-match';
import { BoardDeckImportLedger } from '../board-deck-import-ledger';

const mockInvoke = jest.fn();
let mockFlag = true;

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ functions: { invoke: mockInvoke } }),
  deckImportKeys: { all: ['board-deck-import'], items: (id: string) => ['board-deck-import', 'items', id] },
  deckImportRefusalReason: () => null,
  toDeckImportItem: jest.fn(),
  resolveVendor: jest.fn(),
  useKeepBoardDeckImportItem: () => ({ mutateAsync: jest.fn() }),
  useSwapBoardDeckImportItem: () => ({ mutateAsync: jest.fn() }),
  useReferenceBoardDeckImportItem: () => ({ mutateAsync: jest.fn() }),
  useUnkeepBoardDeckImportItem: () => ({ mutateAsync: jest.fn() }),
  useAttachBoardDeckImportPins: () => ({ mutateAsync: jest.fn() }),
  useCaptureFromUrl: () => ({ mutateAsync: jest.fn() }),
  useCommitProposalCapture: () => ({ mutateAsync: jest.fn() }),
  usePromoteBoardReferenceToSelection: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'board-web-match' && mockFlag, isLoading: false }),
}));

jest.mock('@/components/document/overlays/doc-sheet', () => ({
  DocSheet: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}));

jest.mock('@/components/document/ledger-front-matter', () => ({
  LedgerFrontMatter: () => null,
}));

jest.mock('@/components/portal/proposals/product-picker-modal', () => ({
  ProductPickerModal: () => null,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const IMPORT = 'import-1';

function piece(overrides: Partial<DeckImportItem> = {}): DeckImportItem {
  return {
    id: 'item-1',
    importId: IMPORT,
    elementKey: 'slide1:pic1',
    boardItemId: 'pin-1',
    slideIndex: 0,
    slideTitle: 'Living room',
    role: 'product',
    extracted: {},
    state: 'not_found',
    foundBy: null,
    candidates: [],
    chosenProductId: null,
    attempts: 1,
    keptBy: null,
    keptAt: null,
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    ...overrides,
  } as DeckImportItem;
}

function renderLedger(items: DeckImportItem[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BoardDeckImportLedger
        open
        onClose={jest.fn()}
        owner={{ kind: 'project', id: 'project-1' }}
        scopeRoomId={null}
        importId={IMPORT}
        items={items}
        products={new Map()}
        decisions={{
          choose: jest.fn().mockResolvedValue(true),
          reference: jest.fn().mockResolvedValue(true),
          unkeep: jest.fn().mockResolvedValue(true),
          pasteLink: jest.fn().mockResolvedValue(true),
          keepEveryLink: jest.fn().mockResolvedValue(0),
          busyItemId: null,
          error: null,
          clearError: jest.fn(),
        } as never}
        pins={[]}
        onPromoted={jest.fn()}
        sendToSchedule={jest.fn()}
      />
    </QueryClientProvider>,
  );
}

function probeAnswers(enabled: boolean) {
  mockInvoke.mockImplementation((name: string) =>
    Promise.resolve(name === 'board-web-match?probe=1' ? { data: { enabled }, error: null } : { data: null, error: null }));
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockFlag = true;
});

describe('Search the web (board-web-match)', () => {
  it('stays hidden when the probe reports no key', async () => {
    probeAnswers(false);
    renderLedger([piece()]);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('board-web-match?probe=1', { method: 'GET' }));
    expect(screen.queryByText('Search the web for this piece')).toBeNull();
    expect(screen.queryByText(/Search the web for the/)).toBeNull();
  });

  it('stays hidden, without probing, when the flag is off', async () => {
    mockFlag = false;
    probeAnswers(true);
    renderLedger([piece()]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(screen.queryByText('Search the web for this piece')).toBeNull();
  });

  it('offers the row and footer searches when enabled; nothing is called until she presses', async () => {
    probeAnswers(true);
    renderLedger([
      piece({ id: 'a' }),
      piece({ id: 'b', elementKey: 'slide1:pic2', boardItemId: 'pin-2' }),
      piece({ id: 'nopic', elementKey: 'slide1:pic3', boardItemId: null }),
      piece({ id: 'kept', elementKey: 'slide1:pic4', state: 'kept' }),
    ]);
    expect(await screen.findAllByText('Search the web for this piece')).toHaveLength(2);
    const footer = screen.getByText('Search the web for the 2 not found yet');
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    fireEvent.click(footer);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('board-web-match', { body: { item_ids: ['a', 'b'] } }));
  });

  it('shows the plain cap line when this month is used up', async () => {
    mockInvoke.mockImplementation((name: string) => {
      if (name === 'board-web-match?probe=1') return Promise.resolve({ data: { enabled: true }, error: null });
      return Promise.resolve({
        data: null,
        error: { context: { json: () => Promise.resolve({ code: 'cap_reached', resets_at: '2026-11-01T00:00:00+00:00' }) } },
      });
    });
    renderLedger([piece({ id: 'a' })]);
    fireEvent.click(await screen.findByText('Search the web for this piece'));
    expect(await screen.findByText('This month\'s web searches are used up — resets November 1')).toBeInTheDocument();
  });

  it('labels the reset date in UTC', () => {
    expect(webMatchResetLabel('2026-11-01T00:00:00+00:00')).toBe('November 1');
    expect(webMatchResetLabel(null)).toBe('next month');
  });
});
