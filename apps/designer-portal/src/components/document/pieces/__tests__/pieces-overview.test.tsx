/**
 * US-21 T-31 (Q14, S7) — the Document's Pieces region as room overview rows,
 * pinned against SPEC §4 (artifacts/pieces-building-room-2026-10-08/specimens
 * /SPEC.md), Whole Home Renovation before frame 1: 7 rooms, 26 lines.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  deriveOverviewJob,
  deriveOverviewRows,
  overviewFrontMatter,
  overviewHeadStages,
  overviewHeadStatus,
  overviewRowCounts,
  overviewRowFigure,
  type OverviewLine,
  type OverviewPlacement,
} from '@/lib/document/pieces/overview-derivation';

let mockMembers: unknown[] = [];
let mockProjectState = { data: { studio_id: 'job-studio' } as { studio_id: string } | null, isPending: false, isError: false };
let mockMemberState = { isPending: false, isError: false };
let mockPlacements: OverviewPlacement[] = [];
let mockPalettes: Array<{ scope_room_id: string | null; swatches: unknown }> = [];

jest.mock('@patina/supabase', () => ({
  useProjectRoomPlacements: () => ({ data: mockPlacements }),
  useProjectPalettes: () => ({ data: mockPalettes }),
  useProjectV2: () => mockProjectState,
  useOrganizationMembers: () => ({ data: mockMembers, ...mockMemberState }),
}));
// The overview never reads a flag: `one-voice` and `ask-the-paper` are not
// branched on here. A read would throw.
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => {
    throw new Error(`the Pieces overview read the ${flag} flag`);
  },
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('../../strata-mark', () => ({
  StrataMark: ({ state }: { state: string }) => (
    <span data-testid="strata-mark" data-state={state} />
  ),
}));

import { PiecesOverview } from '../pieces-overview';

const ROOMS = [
  { id: 'hall', name: 'Hall' },
  { id: 'living', name: 'Living Room' },
  { id: 'dining', name: 'Dining' },
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'bath', name: 'Primary Bath' },
  { id: 'sunroom', name: 'Sunroom' },
  { id: 'bedroom', name: 'Bedroom' },
];

/** A line with no piece behind it, roughed at `rough` dollars each. */
const placeholder = (id: string, room: string | null, quantity: number, rough: number): OverviewLine => ({
  id,
  project_room_id: room,
  quantity,
  status: 'specified',
  item_type: 'fixed',
  unit_price_cents: 0,
  rough_cents: Math.round(rough * 100),
});
/** A line with a maker and no client price yet: specced, still roughed. */
const specced = (id: string, room: string, quantity: number, rough: number): OverviewLine => ({
  ...placeholder(id, room, quantity, rough),
  vendor_name: 'A maker',
});

/** SPEC §4.2, as the paper stands before frame 1. */
const LINES: OverviewLine[] = [
  placeholder('H1', 'hall', 1, 1200),
  placeholder('H2', 'hall', 1, 680),
  placeholder('L1', 'living', 2, 4800),
  placeholder('L2', 'living', 2, 1400),
  placeholder('L3', 'living', 2, 38),
  placeholder('L4', 'living', 4, 52),
  placeholder('L5', 'living', 1, 7200),
  specced('F1', 'living', 830, 11.5),
  specced('D1', 'dining', 1, 6800),
  placeholder('D2', 'dining', 8, 900),
  placeholder('D3', 'dining', 3, 420),
  placeholder('K1', 'kitchen', 3, 640),
  placeholder('K2', 'kitchen', 1, 1150),
  placeholder('B1', 'bath', 1, 650),
  placeholder('B2', 'bath', 1, 320),
  placeholder('B3', 'bath', 1, 280),
  placeholder('B4', 'bath', 1, 240),
  placeholder('B5', 'bath', 1, 160),
  placeholder('B6', 'bath', 1, 1800),
  placeholder('B7', 'bath', 1, 3200),
  specced('T1', 'bath', 280, 6.8),
  placeholder('S1', 'sunroom', 2, 1100),
  specced('R1', 'bedroom', 9, 230),
  {
    ...specced('R1a', 'bedroom', 9, 85),
    line_kind: 'labor',
    parent_ffe_item_id: 'R1',
  },
  placeholder('R2', 'bedroom', 1, 4200),
  placeholder('R3', 'bedroom', 2, 950),
];

/** SPEC §4.3: the floor and the tile placed across rooms. */
const PLACEMENTS: OverviewPlacement[] = [
  { ffeItemId: 'F1', projectRoomId: 'hall', quantity: 120 },
  { ffeItemId: 'F1', projectRoomId: 'living', quantity: 320 },
  { ffeItemId: 'F1', projectRoomId: 'dining', quantity: 180 },
  { ffeItemId: 'F1', projectRoomId: 'kitchen', quantity: 210 },
  { ffeItemId: 'T1', projectRoomId: 'bath', quantity: 72 },
  { ffeItemId: 'T1', projectRoomId: 'sunroom', quantity: 148 },
  { ffeItemId: 'T1', projectRoomId: 'hall', quantity: 36 },
  { ffeItemId: 'T1', projectRoomId: 'kitchen', quantity: 24 },
];

describe('the overview derivation (SPEC §4.4, before frame 1)', () => {
  const job = deriveOverviewJob(LINES);
  const rows = deriveOverviewRows(LINES, PLACEMENTS, ROOMS);
  const living = rows.find((row) => row.key === 'living')!;

  it('heads the region by room, counting the job', () => {
    expect(overviewHeadStatus(ROOMS.length, job)).toBe('by room · 7 rooms · 26 lines');
    expect(overviewHeadStages(job)).toBe('21 placeholders · 4 specced · nothing released');
  });

  it('prints the front matter: ~$69,328 roughed · nothing released', () => {
    expect(overviewFrontMatter(job)).toBe('~$69,328 roughed · nothing released');
  });

  it('prints the Living Room row with its share of the placed floor', () => {
    expect(overviewRowCounts(living)).toBe('6 lines · 5 placeholders');
    expect(overviewRowFigure(living)).toBe('~$23,564');
  });

  it('prints every room in order, each placed line counted in each room', () => {
    expect(rows.map((row) => row.name)).toEqual(ROOMS.map((room) => room.name));
    expect(rows.map(overviewRowCounts)).toEqual([
      '4 lines · 2 placeholders',
      '6 lines · 5 placeholders',
      '4 lines · 2 placeholders',
      '4 lines · 2 placeholders',
      '8 lines · 7 placeholders',
      '2 lines · 1 placeholder',
      '4 lines · 2 placeholders',
    ]);
    // A placed line prints once on the page: in its primary room.
    expect(rows.filter((row) => row.primaryLineIds.includes('F1')).map((row) => row.key)).toEqual([
      'living',
    ]);
  });

  it('prints no figure for an empty room, and Throughout only when it holds a line', () => {
    const empty = deriveOverviewRows([], [], ROOMS);
    expect(empty).toHaveLength(7);
    expect(overviewRowFigure(empty[0])).toBeNull();
    expect(empty[0].mark).toBe('future');
    const loose = deriveOverviewRows([placeholder('X', null, 1, 10)], [], ROOMS);
    expect(loose.map((row) => row.key)).toContain('throughout');
  });
});

describe('<PiecesOverview>', () => {
  const job = deriveOverviewJob(LINES);
  const renderOverview = (props: Partial<Parameters<typeof PiecesOverview>[0]> = {}) => {
    const onAddLine = jest.fn();
    const view = render(
      <PiecesOverview
        projectId="project-1"
        docId="doc-1"
        lines={LINES}
        rooms={ROOMS}
        job={job}
        onAddLine={onAddLine}
        renderLines={(_row, ids) => (
          <ul>
            {ids.map((id) => (
              <li key={id} data-testid={`line-${id}`}>
                {id}
              </li>
            ))}
          </ul>
        )}
        {...props}
      />,
    );
    return { ...view, onAddLine };
  };
  const row = (key: string) =>
    document.querySelector<HTMLElement>(`[data-pieces-room="${key}"]`)!;

  beforeEach(() => {
    window.localStorage.clear();
    mockPlacements = PLACEMENTS;
    mockPalettes = [];
  });
  const toggle = (key: string, name: string) =>
    within(row(key)).getByRole('button', { name });

  it('shows the wall swatch on the room row, and none where no wall has a colour (S8)', () => {
    mockPalettes = [
      {
        scope_room_id: 'bedroom',
        swatches: [
          { surface: 'Ceiling', product: 'Chantilly Lace OC-65', sheen: 'Flat', hex: '#F7F6F1', sort_order: 0 },
          { surface: 'Walls', product: 'Farrow & Ball Setting Plaster No. 231', sheen: 'Eggshell', hex: '#F2DCD2', sort_order: 1 },
        ],
      },
      { scope_room_id: 'hall', swatches: [{ surface: 'Walls', product: 'Not chosen yet', hex: null, sort_order: 0 }] },
      { scope_room_id: null, swatches: [{ surface: 'Walls', hex: '#000000', sort_order: 0 }] },
    ];
    renderOverview();
    const swatch = within(row('bedroom')).getByRole('img', {
      name: 'Walls, Farrow & Ball Setting Plaster No. 231',
    });
    expect(swatch).toHaveAttribute('width', '24');
    expect(swatch.querySelector('rect')).toHaveAttribute('fill', '#F2DCD2');
    expect(within(row('hall')).queryByRole('img')).not.toBeInTheDocument();
    expect(within(row('living')).queryByRole('img')).not.toBeInTheDocument();
  });

  it('prints the front matter and one row per room: mark, name with its ⌄, counts and figure', () => {
    renderOverview();
    expect(screen.getByText('~$69,328 roughed · nothing released')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-pieces-room]')).toHaveLength(7);

    const living = row('living');
    expect(within(living).getByTestId('strata-mark')).toHaveAttribute('data-state', 'active');
    const name = toggle('living', 'Living Room');
    // US-43 R4: the name is `.t-d3`, with a visible ⌄ that is not its name.
    expect(name.closest('h3')).toHaveClass('t-d3');
    expect(name).toHaveTextContent('⌄');
    expect(name).toHaveAttribute('aria-expanded', 'false');
    expect(within(living).getByText('6 lines · 5 placeholders')).toBeInTheDocument();
    expect(within(living).getByText('~$23,564')).toBeInTheDocument();
    // A closed row carries no acts of its own.
    expect(document.querySelectorAll('[data-action-key="open-add-schedule-line"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-action-key="work-this-room"]')).toHaveLength(0);
  });

  it('US-43 R4 — stands the room’s two acts inside the room she opens', () => {
    renderOverview();
    fireEvent.click(toggle('living', 'Living Room'));
    const body = document.getElementById('pieces-room-lines-living')!;
    expect(within(body).getByRole('button', { name: 'Add room selection' })).toHaveAttribute(
      'data-action-key',
      'open-add-schedule-line',
    );
    const work = within(body).getByRole('link', { name: /Edit room selections/ });
    expect(work).toHaveAttribute('href', '/doc/doc-1/pieces?lens=rough&room=living');
    expect(work).toHaveTextContent('→');
    expect(document.querySelectorAll('[data-action-key="open-add-schedule-line"]')).toHaveLength(1);
  });

  it('hands ADD A LINE its room', () => {
    const { onAddLine } = renderOverview();
    fireEvent.click(toggle('dining', 'Dining'));
    fireEvent.click(within(row('dining')).getByRole('button', { name: 'Add room selection' }));
    expect(onAddLine).toHaveBeenCalledWith(expect.objectContaining({ key: 'dining', roomId: 'dining' }));
  });

  it('US-43 R4 — opens a one-room job’s room by default, and remembers her closing it', () => {
    const oneRoom = LINES.filter((line) => line.project_room_id === 'dining');
    const props = { lines: oneRoom, rooms: [{ id: 'dining', name: 'Dining' }], job: deriveOverviewJob(oneRoom) };
    const first = renderOverview(props);
    expect(document.querySelectorAll('[data-pieces-room]')).toHaveLength(1);
    expect(toggle('dining', 'Dining')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('line-D1')).toBeInTheDocument();

    fireEvent.click(toggle('dining', 'Dining'));
    expect(toggle('dining', 'Dining')).toHaveAttribute('aria-expanded', 'false');
    first.unmount();

    // Her choice outranks the default on this project, and only on this one.
    renderOverview(props).unmount();
    renderOverview(props);
    expect(toggle('dining', 'Dining')).toHaveAttribute('aria-expanded', 'false');
  });

  it('US-43 R4 — remembers the room left open per project, in storage that may refuse', () => {
    const first = renderOverview();
    fireEvent.click(toggle('kitchen', 'Kitchen'));
    first.unmount();

    const again = renderOverview();
    expect(toggle('kitchen', 'Kitchen')).toHaveAttribute('aria-expanded', 'true');
    again.unmount();

    const other = renderOverview({ projectId: 'project-2' });
    expect(toggle('kitchen', 'Kitchen')).toHaveAttribute('aria-expanded', 'false');
    other.unmount();

    // A refusing store forgets the room, and the overview still works.
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      renderOverview();
      expect(toggle('kitchen', 'Kitchen')).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle('hall', 'Hall'));
      expect(toggle('hall', 'Hall')).toHaveAttribute('aria-expanded', 'true');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('US-43 R4 — hands focus back to the room’s toggle when it closes with focus inside', () => {
    const { rerender } = renderOverview({ openLineId: 'D2' });
    const add = within(row('dining')).getByRole('button', { name: 'Add room selection' });
    add.focus();
    expect(add).toHaveFocus();

    // A line held open in another room takes the page there; Dining folds.
    rerender(
      <PiecesOverview
        projectId="project-1"
        docId="doc-1"
        lines={LINES}
        rooms={ROOMS}
        job={job}
        openLineId="K1"
        onAddLine={jest.fn()}
        renderLines={(_row, ids) => ids.map((id) => <span key={id} data-testid={`line-${id}`} />)}
      />,
    );
    expect(toggle('dining', 'Dining')).toHaveAttribute('aria-expanded', 'false');
    expect(toggle('dining', 'Dining')).toHaveFocus();
  });

  it('unfolds a room to its lines, placed lines included, one room at a time', () => {
    renderOverview();
    expect(screen.queryByTestId('line-L1')).not.toBeInTheDocument();

    const living = within(row('living')).getByRole('button', { name: 'Living Room' });
    fireEvent.click(living);
    expect(living).toHaveAttribute('aria-expanded', 'true');
    expect(living).toHaveAttribute('aria-controls', 'pieces-room-lines-living');
    for (const id of ['L1', 'L2', 'L3', 'L4', 'L5', 'F1']) {
      expect(screen.getByTestId(`line-${id}`)).toBeInTheDocument();
    }

    // The hall holds the floor too: the living room folds as the hall opens,
    // so the floor is on the page once.
    fireEvent.click(within(row('hall')).getByRole('button', { name: 'Hall' }));
    expect(living).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('line-L1')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('line-F1')).toHaveLength(1);
    expect(screen.getByTestId('line-T1')).toBeInTheDocument();
  });

  it('unfolds the room a held line stands in, and keeps it unfolded when the line folds', () => {
    const { rerender } = renderOverview({ openLineId: 'D2' });
    expect(within(row('dining')).getByRole('button', { name: 'Dining' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('line-D2')).toBeInTheDocument();

    rerender(
      <PiecesOverview
        projectId="project-1"
        docId="doc-1"
        lines={LINES}
        rooms={ROOMS}
        job={job}
        openLineId={null}
        onAddLine={jest.fn()}
        renderLines={(_row, ids) => ids.map((id) => <span key={id} data-testid={`line-${id}`} />)}
      />,
    );
    expect(screen.getByTestId('line-D2')).toBeInTheDocument();
  });

  it('opens every room, each line once in its primary room, while every line must show', () => {
    renderOverview({ allOpen: true });
    expect(
      document.querySelectorAll('[data-pieces-room] button[aria-expanded="true"]'),
    ).toHaveLength(7);
    expect(screen.getAllByTestId('line-F1')).toHaveLength(1);
    expect(screen.getAllByTestId('line-T1')).toHaveLength(1);
    expect(screen.getAllByTestId(/^line-/)).toHaveLength(26);
  });

  it('bars the row the reader came back to with the 3px ink rule (a10)', () => {
    renderOverview({ returnedRoomId: 'kitchen' });
    const kitchen = row('kitchen');
    expect(kitchen).toHaveAttribute('id', 'pieces-room-kitchen');
    expect(kitchen).toHaveAttribute('data-returned', 'true');
    expect(kitchen).toHaveClass('border-l-[3px]', 'border-l-[color:var(--ink)]');
    expect(row('hall')).not.toHaveAttribute('data-returned');
    expect(row('hall')).toHaveClass('border-l-transparent');
  });

  it('stacks the row at 390 and lays it in one line from sm (a12)', () => {
    renderOverview();
    const line = row('living').firstElementChild as HTMLElement;
    expect(line).toHaveClass('flex-col', 'sm:flex-row', 'min-h-14');
    // US-43 R4: the room's acts wrap in one line inside the opened room.
    fireEvent.click(toggle('living', 'Living Room'));
    const acts = within(row('living')).getByRole('link', { name: /Edit room selections/ })
      .parentElement as HTMLElement;
    expect(acts).toHaveClass('flex', 'flex-wrap');
  });

  it('lifts the room the room lens holds to the top', () => {
    renderOverview({ heldRoomId: 'bedroom' });
    const keys = Array.from(document.querySelectorAll('[data-pieces-room]')).map((el) =>
      el.getAttribute('data-pieces-room'),
    );
    expect(keys[0]).toBe('bedroom');
    expect(row('bedroom')).toHaveClass('doc-room-lifted');
  });
});


describe('P-01 truthful purchasing overview', () => {
  const pieces = [
    { ...placeholder('chairs', 'living', 6, 100), name: 'Dining chairs', unit: 'each',
      purchase_order: { status: 'draft', created_by: 'buyer', ship_to: 'Receiving warehouse\n12 Main St',
        creator: { display_name: 'Morgan', full_name: 'Morgan Buyer' } } },
    { ...placeholder('rug', 'living', 1, 100), name: 'Rug' },
  ];
  function show(lines = pieces) {
    return render(<PiecesOverview projectId="project-1" docId="doc-1" lines={lines}
      rooms={ROOMS} job={deriveOverviewJob(lines)} onAddLine={jest.fn()} renderLines={() => null} />);
  }
  beforeEach(() => { window.localStorage.clear(); mockPlacements = []; mockPalettes = []; mockMembers = []; });

  it('shows quantity, the PO destination snapshot and creator while the room is collapsed', () => {
    show();
    const room = document.querySelector('[data-pieces-room="living"]') as HTMLElement;
    expect(within(room).getByRole('button', { name: 'Living Room' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(room).getByText('Dining chairs · Quantity 6')).toBeInTheDocument();
    expect(within(room).getByText(/Receiving warehouse/)).toHaveTextContent('12 Main St');
    expect(within(room).getByText('Next: Morgan')).toBeInTheDocument();
  });

  it('names missing destination and owner without inventing a job-site default', () => {
    show();
    expect(screen.getByText('No destination yet')).toBeInTheDocument();
    expect(screen.getByText('Next: Owner not named')).toBeInTheDocument();
  });

  it('hands a held order to the active studio owner, not its creator or invited owner', () => {
    mockMembers = [
      { role: 'owner', status: 'active', profiles: { display_name: 'Leah', full_name: 'Leah Owner' } },
      { role: 'owner', status: 'invited', profiles: { display_name: 'Invited' } },
    ];
    const held = [{ ...pieces[0], purchase_order: { ...pieces[0].purchase_order!, status: 'held_for_release' } }];
    const view = show(held);
    const refresh = () => view.rerender(<PiecesOverview projectId="project-1" docId="doc-1" lines={held} rooms={ROOMS} job={deriveOverviewJob(held)} onAddLine={jest.fn()} renderLines={() => null} />);
    expect(screen.getByText('Next: Leah')).toBeInTheDocument();
    expect(screen.queryByText('Next: Morgan')).not.toBeInTheDocument();
    expect(screen.queryByText('Invited')).not.toBeInTheDocument();
    mockMembers = [];
    refresh();
    expect(screen.getByText('Next: Studio owner not named')).toBeInTheDocument();
    mockMemberState.isPending = true;
    refresh();
    expect(screen.getByText('Next: Reading studio owner…')).toBeInTheDocument();
    mockMemberState.isError = true;
    refresh();
    expect(screen.getByText('Next: Studio owner unavailable')).toBeInTheDocument();
    mockProjectState.isPending = true;
    refresh();
    expect(screen.getByText('Next: Reading studio owner…')).toBeInTheDocument();
    mockProjectState.isError = true;
    refresh();
    expect(screen.getByText('Next: Studio owner unavailable')).toBeInTheDocument();
    mockProjectState = { data: null, isPending: false, isError: false };
    refresh();
    expect(screen.getByText('Next: Studio owner not named')).toBeInTheDocument();
    mockProjectState = { data: { studio_id: 'job-studio' }, isPending: false, isError: false };
    mockMemberState = { isPending: false, isError: false };
  });
});
