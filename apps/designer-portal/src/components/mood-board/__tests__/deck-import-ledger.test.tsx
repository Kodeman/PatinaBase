import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DeckImportCandidate, DeckImportItem, EditableMoodBoardItem, PinPatch } from '@patina/types';
import {
  applyPinPatch,
  canvasCaption,
  frontMatterStats,
  howPhrase,
  isBulkKeepEligible,
  roomHeadLine,
  rowState,
  useDeckImportDecisions,
  type DeckReviewRoom,
} from '@/hooks/use-board-deck-import-review';
import { deckPinsToSchedule } from '@/lib/scope/board-schedule';
import { BoardDeckImportLedger } from '../board-deck-import-ledger';

const mockKeep = jest.fn();
const mockSwap = jest.fn();
const mockReference = jest.fn();
const mockUnkeep = jest.fn();
const mockAttach = jest.fn();
const mockPromote = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  deckImportKeys: { all: ['board-deck-import'], items: (id: string) => ['board-deck-import', 'items', id] },
  deckImportRefusalReason: (error: { hint?: string }) =>
    error?.hint === 'on_schedule' || error?.hint === 'promoted' ? error.hint : null,
  toDeckImportItem: jest.fn(),
  resolveVendor: jest.fn(),
  useKeepBoardDeckImportItem: () => ({ mutateAsync: mockKeep }),
  useSwapBoardDeckImportItem: () => ({ mutateAsync: mockSwap }),
  useReferenceBoardDeckImportItem: () => ({ mutateAsync: mockReference }),
  useUnkeepBoardDeckImportItem: () => ({ mutateAsync: mockUnkeep }),
  useAttachBoardDeckImportPins: () => ({ mutateAsync: mockAttach }),
  useCaptureFromUrl: () => ({ mutateAsync: jest.fn() }),
  useCommitProposalCapture: () => ({ mutateAsync: jest.fn() }),
  usePromoteBoardReferenceToSelection: () => ({ mutateAsync: mockPromote, isPending: false }),
}));

jest.mock('@/components/document/overlays/doc-sheet', () => ({
  DocSheet: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}));

jest.mock('@/components/document/ledger-front-matter', () => ({
  LedgerFrontMatter: ({ stats }: { stats: { label: string; value: string }[] }) => (
    <p data-testid="front-matter">{stats.map((s) => `${s.value} ${s.label}`).join(' · ')}</p>
  ),
}));

jest.mock('@/components/portal/proposals/product-picker-modal', () => ({
  ProductPickerModal: () => null,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const IMPORT = 'import-1';

function candidate(overrides: Partial<DeckImportCandidate> = {}): DeckImportCandidate {
  return {
    source: 'link',
    extracted: { name: 'Cove sofa', brand: 'Four Hands', priceCents: 249900, sourceUrl: 'https://www.fourhands.com/cove' },
    band: 'strong',
    rank: 1,
    evidence: {},
    ...overrides,
  };
}

function piece(overrides: Partial<DeckImportItem> = {}): DeckImportItem {
  return {
    id: 'item-1',
    importId: IMPORT,
    elementKey: 'slide1:pic1',
    boardItemId: 'pin-1',
    slideIndex: 0,
    slideTitle: 'Living room',
    role: 'product',
    extracted: { caption: { name: 'Cove sofa', text: 'Cove sofa' } },
    state: 'found',
    foundBy: 'link',
    candidates: [candidate()],
    chosenProductId: null,
    attempts: 1,
    keptBy: null,
    keptAt: null,
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    ...overrides,
  };
}

function pin(overrides: Partial<EditableMoodBoardItem> = {}): EditableMoodBoardItem {
  return {
    id: 'pin-1',
    type: 'capture',
    x: 0,
    y: 0,
    width: 200,
    imageUrl: 'https://cdn.example/crop.webp',
    productId: null,
    captureId: null,
    data: {
      section_id: 'section-1',
      provenance: 'imported_deck',
      original_image_url: 'https://cdn.example/crop.webp',
      deck_import: {
        import_id: IMPORT,
        item_id: 'item-1',
        element_key: 'slide1:pic1',
        slide_index: 0,
        slide_title: 'Living room',
        state: 'to_confirm',
      },
    },
    ...overrides,
  };
}

const keptPatch: PinPatch = {
  itemId: 'item-1',
  boardItemId: 'pin-1',
  type: 'capture',
  productId: 'product-9',
  captureId: 'capture-9',
  data: {
    name: 'Cove sofa',
    vendor_name: 'Four Hands',
    price_cents: 249900,
    source_url: 'https://www.fourhands.com/cove',
    product_image_url: 'https://www.fourhands.com/cove.jpg',
    deck_import: { state: 'kept', found_by: 'link' },
  },
};

function makeRoom(pins: EditableMoodBoardItem[]): DeckReviewRoom & {
  replaceItem: jest.Mock;
  addItems: jest.Mock;
} {
  return {
    pins: () => pins,
    replaceItem: jest.fn(),
    addItems: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  };
}

beforeAll(() => {
  // jsdom has no crypto.randomUUID; the room mints pin ids with it.
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => '00000000-0000-4000-8000-000000000001',
    });
  }
});

beforeEach(() => {
  [mockKeep, mockSwap, mockReference, mockUnkeep, mockAttach, mockPromote].forEach((fn) => fn.mockReset());
});

describe('deck review row states and lexicon', () => {
  it('names every row state in the contract words', () => {
    expect(howPhrase(piece())).toBe('From the link on the slide');
    expect(howPhrase(piece({ foundBy: 'words', candidates: [candidate({ source: 'words', band: 'likely' })] })))
      .toBe('Named on the slide');
    expect(howPhrase(piece({ foundBy: 'look', candidates: [candidate({ source: 'look', band: 'likely' })] })))
      .toBe('Likely, by look');
    expect(howPhrase(piece({ foundBy: 'look', candidates: [candidate({ source: 'look', band: 'possible' })] })))
      .toBe('Possible, by look');
    expect(howPhrase(piece({ state: 'not_found', foundBy: null, candidates: [] }))).toBe('Not found yet');
    expect(rowState(piece({ state: 'pending' }))).toBe('finding');
    expect(rowState(piece({ state: 'kept' }))).toBe('kept');
    expect(rowState(piece({ state: 'reference' }))).toBe('reference');
    const linkOnly = piece({ boardItemId: null, elementKey: 'link:abc', slideIndex: 3 });
    expect(rowState(linkOnly)).toBe('needs_picture');
    expect(howPhrase(linkOnly)).toBe('Found from a link on slide 4');
  });

  it('writes the canvas caption as band · name, maker — never a score', () => {
    const products = new Map();
    expect(canvasCaption(piece({ candidates: [candidate({ band: 'likely' })] }), products))
      .toBe('likely · Cove sofa, Four Hands');
    expect(canvasCaption(piece({ state: 'not_found', candidates: [] }), products)).toBe('not found yet');
    expect(canvasCaption(piece({ state: 'kept' }), products)).toBeNull();
    expect(canvasCaption(piece({ state: 'pending', candidates: [] }), products)).toBeNull();
  });

  it('counts the front matter by how each piece was found, link-only rows on their own', () => {
    const stats = frontMatterStats([
      piece({ id: 'a' }),
      piece({ id: 'b', state: 'kept' }),
      piece({ id: 'c', foundBy: 'look', candidates: [candidate({ source: 'look', band: 'likely' })] }),
      piece({ id: 'd', foundBy: 'words' }),
      piece({ id: 'e', state: 'not_found', foundBy: null, candidates: [] }),
      piece({ id: 'f', boardItemId: null, elementKey: 'link:x' }),
      piece({ id: 'g', role: 'reference' }),
      // A link row folded into the picture it was kept onto (00678) drops out.
      piece({ id: 'h', boardItemId: null, elementKey: 'link:y', state: 'merged' as DeckImportItem['state'] }),
    ]);
    expect(stats).toEqual([
      { value: '6', label: 'pieces' },
      { value: '2', label: 'by link' },
      { value: '1', label: 'by look' },
      { value: '1', label: 'named on the slide' },
      { value: '1', label: 'not found yet' },
      { value: '1', label: 'link still needs a picture' },
    ]);
  });

  it('reads "Finding pieces · n of m" while resolving and "N pieces from the deck · n to confirm" when ready', () => {
    const items = [piece({ id: 'a' }), piece({ id: 'b', state: 'pending' }), piece({ id: 'c', state: 'kept' })];
    expect(roomHeadLine('resolving', items)).toEqual({ text: 'Finding pieces · 2 of 3', review: true });
    expect(roomHeadLine('ready', items.map((i) => (i.state === 'pending' ? { ...i, state: 'not_found' as const } : i))))
      .toEqual({ text: '3 pieces from the deck · 2 to confirm', review: true });
    expect(roomHeadLine('laying_out', items)).toBeNull();
  });
});

describe('bulk-keep eligibility (R-DI7)', () => {
  it('takes only link rows with a picture whose page photo agrees (band strong)', () => {
    expect(isBulkKeepEligible(piece())).toBe(true);
    expect(isBulkKeepEligible(piece({ candidates: [candidate({ source: 'link_existing', productId: 'p', extracted: undefined })] })))
      .toBe(true);
    expect(isBulkKeepEligible(piece({ candidates: [candidate({ band: 'likely' })] }))).toBe(false);
    expect(isBulkKeepEligible(piece({ foundBy: 'look', candidates: [candidate({ source: 'look', band: 'strong' })] })))
      .toBe(false);
    expect(isBulkKeepEligible(piece({ candidates: [candidate({ evidence: { paired_by: 'look' } })] }))).toBe(false);
    expect(isBulkKeepEligible(piece({ boardItemId: null, elementKey: 'link:x' }))).toBe(false);
    expect(isBulkKeepEligible(piece({ state: 'kept' }))).toBe(false);
  });
});

describe('pin patches', () => {
  it('applies a keep patch onto the pin, keeping the crop and every other key', () => {
    const next = applyPinPatch(pin(), keptPatch);
    expect(next).toMatchObject({
      id: 'pin-1',
      type: 'capture',
      productId: 'product-9',
      captureId: 'capture-9',
      imageUrl: 'https://cdn.example/crop.webp',
    });
    expect(next.data).toMatchObject({
      section_id: 'section-1',
      name: 'Cove sofa',
      vendor_name: 'Four Hands',
      product_image_url: 'https://www.fourhands.com/cove.jpg',
      deck_import: { import_id: IMPORT, item_id: 'item-1', slide_index: 0, state: 'kept', found_by: 'link' },
    });
  });

  it('unkeep restores the deck crop and clears the product', () => {
    const kept = applyPinPatch(pin({ imageUrl: 'https://maker.example/photo.jpg' }), keptPatch);
    const back = applyPinPatch(kept, {
      ...keptPatch,
      productId: null,
      captureId: null,
      data: {
        name: null, vendor_name: null, price_cents: null, source_url: null, product_image_url: null,
        provenance: 'imported_deck',
        deck_import: { state: 'to_confirm', found_by: 'link' },
      },
    });
    expect(back.imageUrl).toBe('https://cdn.example/crop.webp');
    expect(back.productId).toBeNull();
    expect(back.data).not.toHaveProperty('name');
    expect((back.data?.deck_import as { state: string }).state).toBe('to_confirm');
  });

  it('lists kept pieces not yet onward, once per deck piece', () => {
    const kept = (id: string, extra: Partial<EditableMoodBoardItem> = {}, itemId = id) => pin({
      id,
      ...extra,
      data: { ...pin().data, deck_import: { import_id: IMPORT, item_id: itemId, state: 'kept' }, ...(extra.data ?? {}) },
    });
    const pins = [
      kept('a'),
      kept('b', { projectFfeItemId: 'ffe-1' }),
      kept('c', { data: { proposalItemId: 'line-1' } }),
      kept('d', {}, 'a'),
      pin({ id: 'e' }),
    ];
    expect(deckPinsToSchedule(pins, 'project').map((p) => p.id)).toEqual(['a', 'c']);
    expect(deckPinsToSchedule(pins, 'proposal').map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('useDeckImportDecisions', () => {
  it('Keep applies the returned patch through the room command path', async () => {
    mockKeep.mockResolvedValue(keptPatch);
    const room = makeRoom([pin()]);
    const { result } = renderHook(() => useDeckImportDecisions(IMPORT, room));
    await act(async () => {
      await result.current.choose(piece());
    });
    expect(mockKeep).toHaveBeenCalledWith({ importId: IMPORT, itemId: 'item-1', candidateRank: 1 });
    expect(room.replaceItem).toHaveBeenCalledTimes(1);
    expect(room.replaceItem.mock.calls[0][0]).toMatchObject({
      id: 'pin-1',
      productId: 'product-9',
      data: { deck_import: { state: 'kept' } },
    });
  });

  it('Unkeep is blocked once the piece is on the schedule, without calling the server', async () => {
    const room = makeRoom([pin({ data: { ...pin().data, proposalItemId: 'line-1' } })]);
    const { result } = renderHook(() => useDeckImportDecisions(IMPORT, room));
    let ok = true;
    await act(async () => {
      ok = await result.current.unkeep(piece({ state: 'kept' }));
    });
    expect(ok).toBe(false);
    expect(mockUnkeep).not.toHaveBeenCalled();
    expect(room.replaceItem).not.toHaveBeenCalled();
    expect(result.current.error).toEqual({ itemId: 'item-1', message: 'Already on the schedule' });
  });

  it('Unkeep refused by the server reads the reason, not the code', async () => {
    mockUnkeep.mockRejectedValue(Object.assign(new Error('check_violation'), { hint: 'promoted' }));
    const room = makeRoom([pin()]);
    const { result } = renderHook(() => useDeckImportDecisions(IMPORT, room));
    await act(async () => {
      await result.current.unkeep(piece({ state: 'kept' }));
    });
    expect(result.current.error?.message).toBe('Already in the project');
  });

  it('a link kept without a picture becomes a new pin, saved then attached', async () => {
    mockKeep.mockResolvedValue({ ...keptPatch, itemId: 'link-1', boardItemId: null });
    const room = makeRoom([pin()]);
    const { result } = renderHook(() => useDeckImportDecisions(IMPORT, room));
    await act(async () => {
      await result.current.choose(piece({ id: 'link-1', boardItemId: null, elementKey: 'link:abc' }));
    });
    expect(room.addItems).toHaveBeenCalledTimes(1);
    const created = room.addItems.mock.calls[0][0][0] as EditableMoodBoardItem;
    expect(created).toMatchObject({ productId: 'product-9', x: 224, data: { section_id: 'section-1' } });
    expect(room.flush).toHaveBeenCalled();
    expect(mockAttach).toHaveBeenCalledWith({
      importId: IMPORT,
      pins: [{ elementKey: 'link:abc', boardItemId: created.id }],
    });
  });
});

describe('BoardDeckImportLedger', () => {
  const owner = { kind: 'project' as const, id: 'project-1' };

  function renderLedger(items: DeckImportItem[], pins: EditableMoodBoardItem[], decisions = {}) {
    const choose = jest.fn().mockResolvedValue(true);
    const props = {
      choose,
      reference: jest.fn().mockResolvedValue(true),
      unkeep: jest.fn().mockResolvedValue(true),
      pasteLink: jest.fn().mockResolvedValue(true),
      keepEveryLink: jest.fn().mockResolvedValue(0),
      busyItemId: null,
      error: null,
      clearError: jest.fn(),
      ...decisions,
    };
    render(
      <BoardDeckImportLedger
        open
        onClose={jest.fn()}
        owner={owner}
        scopeRoomId={null}
        importId={IMPORT}
        items={items}
        products={new Map()}
        decisions={props}
        pins={pins}
        onPromoted={jest.fn()}
        sendToSchedule={jest.fn()}
      />,
    );
    return props;
  }

  it('shows each row state with its acts', () => {
    renderLedger(
      [
        piece({ id: 'a' }),
        piece({ id: 'b', boardItemId: 'pin-b', state: 'kept' }),
        piece({ id: 'c', boardItemId: 'pin-c', state: 'not_found', foundBy: null, candidates: [] }),
        piece({ id: 'd', boardItemId: null, elementKey: 'link:d' }),
      ],
      [pin()],
    );
    const row = (id: string) => document.querySelector(`[data-deck-row="${id}"]`)!;
    expect(row('a').getAttribute('data-deck-row-state')).toBe('to_confirm');
    expect(row('a').querySelector('[data-deck-act="keep"]')).not.toBeNull();
    expect(row('b').getAttribute('data-deck-row-state')).toBe('kept');
    expect(row('b').querySelector('[data-deck-act="unkeep"]')).not.toBeNull();
    expect(row('b').querySelector('[data-deck-act="keep"]')).toBeNull();
    expect(row('c').textContent).toContain('Not found yet');
    expect(row('c').querySelector('[data-deck-act="reference"]')).not.toBeNull();
    expect(row('d').getAttribute('data-deck-row-state')).toBe('needs_picture');
    expect(row('d').textContent).toContain('Which picture?');
    expect(row('d').textContent).toContain('Keep without a picture');
    expect(screen.getByTestId('front-matter').textContent).toContain('1 link still needs a picture');
  });

  it('bulk keep offers only the link rows found by their link', async () => {
    const look = piece({ id: 'look', boardItemId: 'pin-l', foundBy: 'look', candidates: [candidate({ source: 'look', band: 'likely' })] });
    const strong = piece({ id: 'strong' });
    const weak = piece({ id: 'weak', boardItemId: 'pin-w', candidates: [candidate({ band: 'likely' })] });
    const props = renderLedger([strong, look, weak], [pin()]);
    const bulk = screen.getByRole('button', { name: 'Keep every piece found by its link · 1' });
    fireEvent.click(bulk);
    await waitFor(() => expect(props.keepEveryLink).toHaveBeenCalledWith([strong]));
  });

  it('keys: j moves down, Enter keeps the active row, u unkeeps a kept one', async () => {
    const props = renderLedger(
      [piece({ id: 'a' }), piece({ id: 'b', boardItemId: 'pin-b', state: 'kept' })],
      [pin()],
    );
    const ledger = document.querySelector('[data-deck-import-ledger]') as HTMLElement;
    fireEvent.keyDown(ledger, { key: 'Enter' });
    expect(props.choose).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    fireEvent.keyDown(ledger, { key: 'j' });
    fireEvent.keyDown(ledger, { key: 'u' });
    expect(props.unkeep).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('puts kept pieces on the schedule as her selections by default (project board)', async () => {
    mockPromote.mockResolvedValue({ selectionId: 'ffe-1' });
    const kept = pin({ data: { ...pin().data, name: 'Cove sofa', deck_import: { import_id: IMPORT, item_id: 'item-1', state: 'kept' } } });
    renderLedger([piece({ state: 'kept' })], [kept]);
    fireEvent.click(screen.getByRole('button', { name: 'Put 1 piece on the schedule' }));
    await waitFor(() => expect(mockPromote).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      boardItemId: 'pin-1',
      disposition: 'selected',
      idempotencyKey: 'promote:pin-1',
      name: 'Cove sofa',
    })));
    expect(await screen.findByText('Order from the schedule')).toHaveAttribute('href', '/doc/project-1');
  });
});
