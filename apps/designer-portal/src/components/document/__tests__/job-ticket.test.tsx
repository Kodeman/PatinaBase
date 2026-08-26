import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  JobTicket,
  LETTERHEAD_SENTINEL_ID,
} from '@/components/document/job-ticket';
import { RoomLensProvider } from '@/components/document/room-lens-context';
import type { TicketRow, TicketSeam } from '@/lib/document/ticket-derivation';

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
    door: { kind: 'leaf', shelf: 'planroom' },
    exception: null,
  },
  {
    key: 'spec',
    label: 'Spec',
    value: '34 of 36 specified · by room',
    door: { kind: 'leaf', shelf: 'specbook' },
    exception: null,
  },
  {
    key: 'boards',
    label: 'Boards',
    value: 'No boards yet · start one',
    door: { kind: 'leaf', shelf: 'moodboards' },
    exception: null,
  },
  {
    key: 'money',
    label: 'Money',
    value: '$141,600 ordered · $17,500 owed you, 22 days',
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
    door: { kind: 'unfold-region', region: 'schedule' },
    exception: null,
  },
  {
    key: 'people',
    label: 'People',
    value: 'Nobody on it yet',
    door: { kind: 'overlay', overlay: 'call-sheet', available: true },
    exception: null,
  },
];

const SEAM: TicketSeam = {
  identity: 'The job · Project · Procurement & Orders 4 of 6',
  exceptions: '1 damaged · $17,500 owed you',
};

function renderTicket(props: Partial<Parameters<typeof JobTicket>[0]> = {}) {
  const onOpenLeaf = jest.fn();
  const onUnfoldRegion = jest.fn();
  const onOpenCallSheet = jest.fn();
  const view = render(
    <RoomLensProvider>
      <div id={LETTERHEAD_SENTINEL_ID} />
      <JobTicket
        rows={ROWS}
        seam={SEAM}
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
    expect(screen.getByText(SEAM.identity)).toBeInTheDocument();
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

  it('wears no shadow (D4)', () => {
    renderTicket();
    const ticket = document.querySelector('[data-job-ticket]')!;
    const shadowed = [ticket, ...Array.from(ticket.querySelectorAll('*'))].filter(
      (el) => /shadow/.test(el.getAttribute('class') ?? ''),
    );
    expect(shadowed).toHaveLength(0);
  });
});
