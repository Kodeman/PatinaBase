import { act, fireEvent, render, screen } from '@testing-library/react';
import { JobTicket } from '@/components/document/job-ticket';
import { RoomLensProvider } from '@/components/document/room-lens-context';
import {
  deriveTicket,
  type TicketHead,
  type TicketInput,
  type TicketRow,
  type TicketSeam,
} from '@/lib/document/ticket-derivation';
import type { MoneyLadder, MoneyRung } from '@/lib/document/money-ladder';

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

let observerCallbacks: ObserverCallback[] = [];

beforeEach(() => {
  observerCallbacks = [];
  (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  class TestIntersectionObserver {
    constructor(callback: ObserverCallback) {
      observerCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  global.IntersectionObserver =
    TestIntersectionObserver as unknown as typeof IntersectionObserver;
});

function crossTheLetterhead(isIntersecting: boolean) {
  act(() => {
    for (const callback of observerCallbacks) callback([{ isIntersecting }]);
  });
}

const ROWS: TicketRow[] = [
  {
    key: 'rooms',
    label: 'Rooms',
    value: '4 rooms · 36 lines',
    emphasis: null,
    door: {
      kind: 'expand',
      rooms: [
        { id: 'living', name: 'Living room', lineCount: 14 },
        { id: 'dining', name: 'Dining room', lineCount: 8 },
      ],
    },
    exception: null,
  },
  {
    key: 'pieces',
    label: 'Pieces',
    value: '29 ordered · 1 damaged',
    emphasis: '1 damaged',
    door: { kind: 'unfold-region', region: 'ffe' },
    exception: {
      rank: 'money-at-risk',
      phrase: '1 damaged',
      standingSince: null,
    },
  },
  {
    key: 'drawings',
    label: 'Drawings',
    value: 'Nothing filed',
    emphasis: null,
    door: { kind: 'leaf', shelf: 'planroom' },
    exception: null,
  },
  {
    key: 'spec',
    label: 'Spec',
    value: '34 of 36 specified · by room',
    emphasis: null,
    door: { kind: 'leaf', shelf: 'specbook' },
    exception: null,
  },
  {
    key: 'boards',
    label: 'Boards',
    value: 'No boards yet · start one',
    emphasis: null,
    door: { kind: 'leaf', shelf: 'moodboards' },
    exception: null,
  },
  {
    key: 'money',
    label: 'Money',
    value: '$141,600 ordered · $17,500 owed you, 22 days',
    emphasis: '$17,500 owed you, 22 days',
    door: { kind: 'unfold-region', region: 'money' },
    exception: {
      rank: 'promise-past-due',
      phrase: '$17,500 owed you',
      standingSince: '2026-08-03',
    },
  },
  {
    key: 'dates',
    label: 'Dates',
    value: 'Install Tuesday, September 15 · three weeks out',
    emphasis: null,
    door: { kind: 'unfold-region', region: 'schedule' },
    exception: null,
  },
  {
    key: 'people',
    label: 'People',
    value: 'Nobody on it yet',
    emphasis: null,
    door: { kind: 'overlay', overlay: 'call-sheet', available: true },
    exception: null,
  },
];

const EIGHT = [
  'rooms',
  'pieces',
  'drawings',
  'spec',
  'boards',
  'money',
  'dates',
  'people',
];

const rung = (word: string): MoneyRung => ({ cents: null, note: '', word });

const emptyLadder = (): MoneyLadder => ({
  budget: rung('budget'),
  plan: rung('plan'),
  authorized: rung('authorized'),
  moved: rung('moved'),
  owed: rung('owed'),
  notDrawn: rung('not drawn'),
});

/** A proposal document standing on the Finalize table — the one composition
 *  that derives a ninth row. */
const FINALIZE_INPUT: TicketInput = {
  section: 'proposal',
  phase: null,
  rooms: { settled: true, list: [] },
  pieces: { settled: true, lines: [] },
  drawings: { settled: true, sheetCount: 0 },
  boards: { settled: true, count: 0 },
  money: {
    settled: true,
    failed: false,
    ladder: emptyLadder(),
    owedDays: null,
    undrawnKind: null,
    owedSince: null,
  },
  dates: { settled: true, schedule: null },
  people: { settled: true, callSheetEnabled: true, rosterCount: 0 },
};

const SEAM: TicketSeam = {
  identity: 'The job · Project · Procurement & Orders 4 of 6',
  exceptions: '1 damaged · $17,500 owed you',
};

const HEAD: TicketHead = {
  subject: 'The job · Project',
  phase: 'Procurement & Orders · 4 of 6',
};

function renderTicket(props: Partial<Parameters<typeof JobTicket>[0]> = {}) {
  const onOpenLeaf = jest.fn();
  const onUnfoldRegion = jest.fn();
  const onOpenCallSheet = jest.fn();
  const view = render(
    <RoomLensProvider>
      <JobTicket
        rows={ROWS}
        seam={SEAM}
        head={HEAD}
        onOpenLeaf={onOpenLeaf}
        routes={{}}
        onUnfoldRegion={onUnfoldRegion}
        onOpenCallSheet={onOpenCallSheet}
        {...props}
      />
    </RoomLensProvider>,
  );
  return { ...view, onOpenLeaf, onUnfoldRegion, onOpenCallSheet };
}

/** ≥1440 — the tier where a shelf row opens the leaf beside the spine. Every
 *  case that does not call this answers `false` to every query, i.e. 390. */
function atFullTier() {
  (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
    matches: query === '(min-width: 1440px)',
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

const ticketRows = () =>
  Array.from(document.querySelectorAll('[data-ticket-row]')).map((el) =>
    el.getAttribute('data-ticket-row'),
  );

describe('JobTicket', () => {
  it('prints eight rows, in order, under the identity', () => {
    renderTicket();
    expect(ticketRows()).toEqual([
      'rooms',
      'pieces',
      'drawings',
      'spec',
      'boards',
      'money',
      'dates',
      'people',
    ]);
    // M2's head is two parts across the band; the seam's one line is M4's.
    expect(screen.getByText(HEAD.subject)).toBeInTheDocument();
    expect(screen.getByText(HEAD.phase!)).toBeInTheDocument();
    expect(screen.getByText('Nothing filed')).toBeInTheDocument();
  });

  it('collapses to the two-line seam when the letterhead leaves the viewport', () => {
    renderTicket();
    expect(ticketRows()).toHaveLength(8);

    crossTheLetterhead(false);

    expect(ticketRows()).toHaveLength(0);
    expect(screen.getByText(SEAM.identity)).toBeInTheDocument();
    expect(screen.getByText(SEAM.exceptions)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unfold ↓' })).toBeInTheDocument();
  });

  it('sticks, and prints its eight rows again when the letterhead returns', () => {
    renderTicket();
    const ticket = document.querySelector('[data-job-ticket]');
    expect(ticket).toHaveClass('sticky');

    crossTheLetterhead(false);
    expect(ticket).toHaveAttribute('data-pinned', 'true');

    crossTheLetterhead(true);
    expect(ticketRows()).toHaveLength(8);
  });

  it('unfolds the seam in place without losing the pin', () => {
    renderTicket();
    crossTheLetterhead(false);
    fireEvent.click(screen.getByRole('button', { name: 'Unfold ↓' }));
    expect(ticketRows()).toHaveLength(8);
    expect(document.querySelector('[data-job-ticket]')).toHaveAttribute(
      'data-pinned',
      'true',
    );
  });

  it('lifts a room from the Rooms row and hides nothing', () => {
    renderTicket();
    fireEvent.click(screen.getByRole('button', { name: /Rooms/ }));

    const chip = screen.getByRole('button', { name: /Living room/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip);

    expect(
      screen.getByRole('button', { name: /Living room/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    // The lens lifts; it never filters — every chip and every row still prints.
    expect(screen.getByRole('button', { name: /Dining room/ })).toBeInTheDocument();
    expect(ticketRows()).toHaveLength(8);
  });

  it('opens each row on its own door', () => {
    // At the full tier: below 1440 a shelf row with no page of its own has
    // nowhere to send the reader, and prints no door at all (see below).
    atFullTier();
    const { onOpenLeaf, onUnfoldRegion, onOpenCallSheet } = renderTicket();

    fireEvent.click(screen.getByRole('button', { name: /Pieces/ }));
    expect(onUnfoldRegion).toHaveBeenCalledWith('ffe');

    fireEvent.click(screen.getByRole('button', { name: /Drawings/ }));
    expect(onOpenLeaf).toHaveBeenCalledWith('planroom');

    fireEvent.click(screen.getByRole('button', { name: /People/ }));
    expect(onOpenCallSheet).toHaveBeenCalled();
  });

  it('routes a leaf row below 1440 when the page gave it a route', () => {
    renderTicket({ routes: { moodboards: '/doc/abc/boards' } });
    const boards = screen.getByRole('link', { name: /Boards/ });
    expect(boards).toHaveAttribute('href', '/doc/abc/boards');
  });

  it('offers no door where the call sheet is not turned on', () => {
    renderTicket({
      rows: ROWS.map((row) =>
        row.key === 'people'
          ? {
              ...row,
              value: "the call sheet isn't turned on for this studio",
              door: {
                kind: 'overlay' as const,
                overlay: 'call-sheet' as const,
                available: false,
              },
            }
          : row,
      ),
    });
    expect(screen.queryByRole('button', { name: /People/ })).toBeNull();
    expect(
      screen.getByText("the call sheet isn't turned on for this studio"),
    ).toBeInTheDocument();
  });

  it('prints the ninth row only where the derivation gave it one', () => {
    // Eight is what every project, install and care document derives, so the
    // component must not invent a ninth of its own.
    renderTicket();
    expect(ticketRows()).not.toContain('clientcopy');
  });

  it('opens the client’s copy leaf from the ninth row on the Finalize table', () => {
    atFullTier();
    const rows = deriveTicket({
      ...FINALIZE_INPUT,
      clientCopy: { settled: true, sent: true },
    });
    const { onOpenLeaf } = renderTicket({ rows });

    expect(ticketRows()).toEqual([...EIGHT, 'clientcopy']);
    expect(screen.getByText('The client’s copy · as sent, live')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    expect(onOpenLeaf).toHaveBeenCalledWith('clientcopy');
  });

  it('prints a leaf row that has nowhere to go below 1440 as a fact', () => {
    // The leaf stands only from 1440px, and `The client’s copy` has no page of
    // its own. A press that toggles state and shows nothing is worse than a
    // row that plainly does not open, so the row prints no `→` and no control.
    const rows = deriveTicket({
      ...FINALIZE_INPUT,
      clientCopy: { settled: true, sent: true },
    });
    renderTicket({ rows });

    expect(ticketRows()).toContain('clientcopy');
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Copy/ })).toBeNull();
    const row = document.querySelector('[data-ticket-row="clientcopy"]')!;
    expect(row.textContent).not.toContain('→');
  });

  it('anchors a row to the tool the table already stands on the paper', () => {
    // B2-L4 / direction-b §9 — on the Speccing table the Rooms row takes the
    // reader to I139's rail rather than expanding a second list of the rooms.
    const scrollIntoView = jest.fn();
    const slot = document.createElement('div');
    slot.setAttribute('data-table-slot', 'rooms-rail');
    slot.scrollIntoView = scrollIntoView;
    document.body.appendChild(slot);

    renderTicket({
      rows: ROWS.map((row) =>
        row.key === 'rooms'
          ? { ...row, door: { kind: 'slot' as const, slot: 'rooms-rail' as const } }
          : row,
      ),
    });
    fireEvent.click(screen.getByRole('button', { name: /Rooms/ }));
    expect(scrollIntoView).toHaveBeenCalled();
    slot.remove();
  });

  it('opens at rest as the seam at 390, and unfolds to the eight rows', () => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query === '(max-width: 1179px)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    renderTicket();

    expect(ticketRows()).toHaveLength(0);
    expect(screen.getByText(SEAM.identity)).toBeInTheDocument();
    expect(screen.getByText(SEAM.exceptions)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unfold ↓' }));
    expect(ticketRows()).toHaveLength(8);
  });

  it('opens the leaf, not the route, at the full tier', () => {
    // B1-L4's acceptance: at ≥1440 the same row that routes on a phone opens
    // the 320px leaf beside the spine. Every other case here answers `false`
    // to every query, so this is the only one that proves the wide branch.
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query === '(min-width: 1440px)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const { onOpenLeaf } = renderTicket({
      routes: { moodboards: '/doc/abc/boards' },
    });

    expect(screen.queryByRole('link', { name: /Boards/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Boards/ }));
    expect(onOpenLeaf).toHaveBeenCalledWith('moodboards');
  });

  it('prints a row with no door as a fact, not a button', () => {
    // The install and care spreads mount neither the Money region nor the
    // Schedule, so those two rows state their figure and open nothing rather
    // than firing an unfold nobody hears.
    renderTicket({
      rows: ROWS.map((row) =>
        row.key === 'money' ? { ...row, door: { kind: 'none' as const } } : row,
      ),
    });
    expect(screen.queryByRole('button', { name: /Money/ })).toBeNull();
    const money = document.querySelector('[data-ticket-row="money"]')!;
    expect(money).toHaveTextContent('$141,600 ordered');
    expect(money.textContent).not.toContain('→');
  });

  it('gives the clause that is wrong the weight, in ledger order', () => {
    renderTicket();
    const pieces = document.querySelector('[data-ticket-row="pieces"]')!;
    expect(pieces).toHaveTextContent('29 ordered · 1 damaged');
    expect(pieces.querySelector('strong')).toHaveTextContent('1 damaged');
  });

  it('names what the fold and the Rooms row control', () => {
    renderTicket();
    const fold = screen.getByRole('button', { name: 'Fold ↑' });
    const rowsId = fold.getAttribute('aria-controls');
    expect(rowsId).toBeTruthy();
    expect(document.getElementById(rowsId!)).not.toBeNull();

    const rooms = screen.getByRole('button', { name: /Rooms/ });
    fireEvent.click(rooms);
    const chipsId = rooms.getAttribute('aria-controls');
    expect(chipsId).toBeTruthy();
    expect(document.getElementById(chipsId!)).not.toBeNull();
  });

  it('keeps the fold control under the reader through a fold and an unfold', () => {
    renderTicket();
    const fold = screen.getByRole('button', { name: 'Fold ↑' });
    fold.focus();
    fireEvent.click(fold);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Unfold ↓' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unfold ↓' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Fold ↑' }),
    );
  });

  it('catches focus when the letterhead scrolls past and the rows go', () => {
    atFullTier();
    renderTicket();
    const drawings = screen.getByRole('button', { name: /Drawings/ });
    drawings.focus();

    crossTheLetterhead(false);

    // The row the reader was standing on is gone; focus lands on the control
    // that brings it back, not on <body>.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Unfold ↓' }),
    );
  });

  it('holds the top over the schedule’s own pinned glance', () => {
    // Both are `sticky top-0` inside the same scroll container, and the glance
    // is later in DOM order. The seam publishes its height so the glance
    // stands under it (globals.css) instead of painting over the map.
    renderTicket();
    const ticket = document.querySelector('[data-job-ticket]')!;
    expect(ticket).toHaveClass('z-[4]');
    expect(
      document.documentElement.style.getPropertyValue('--doc-seam-height'),
    ).toBe('');

    crossTheLetterhead(false);
    expect(
      document.documentElement.style.getPropertyValue('--doc-seam-height'),
    ).toMatch(/px$/);

    crossTheLetterhead(true);
    expect(
      document.documentElement.style.getPropertyValue('--doc-seam-height'),
    ).toBe('');
  });

  it('wears no shadow (D4)', () => {
    renderTicket();
    const ticket = document.querySelector('[data-job-ticket]')!;
    const shadowed = [ticket, ...Array.from(ticket.querySelectorAll('*'))].filter(
      (el) => /shadow/.test(el.getAttribute('class') ?? ''),
    );
    expect(shadowed).toHaveLength(0);
  });
});
