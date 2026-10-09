/**
 * Room budgets split a placed line's money by share (US-21 T-51, D7 phase 3).
 *
 * The oak floor: 913 sq ft at $11.50 ($10,499.50) over 830 sq ft measured in
 * four rooms. Each room carries its placed share of the line's money, the
 * rooms together hold the line exactly once, and a single-room line counts
 * whole in its primary room as before.
 */
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockTables: Record<string, unknown> = {};

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: (table: string) => {
      const result = { data: mockTables[table] ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order']) chain[method] = () => chain;
      chain.single = () => Promise.resolve(result);
      chain.then = (resolve: (value: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject);
      return chain;
    },
  }),
}));

jest.mock('../use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));

import {
  accountRoomRows,
  useAccountPage,
  type AccountPlacement,
  type AccountRoom,
  type ItemSlice,
} from '../use-account-page';

const ROOMS: AccountRoom[] = [
  { id: 'room-hall', name: 'Hall', budget_cents: 200_000 },
  { id: 'room-living', name: 'Living Room', budget_cents: 500_000 },
  { id: 'room-dining', name: 'Dining', budget_cents: 250_000 },
  { id: 'room-kitchen', name: 'Kitchen', budget_cents: 300_000 },
];

function line(overrides: Partial<ItemSlice> & Pick<ItemSlice, 'id'>): ItemSlice {
  return {
    line_total_cents: 0,
    trade_price_cents: null,
    unit_price_cents: null,
    quantity: 1,
    status: 'ordered',
    project_room_id: null,
    item_type: 'flooring',
    currency: 'USD',
    ...overrides,
  };
}

const OAK = line({
  id: 'line-oak',
  line_total_cents: 1_049_950,
  unit_price_cents: 1_150,
  quantity: 913,
  project_room_id: 'room-hall',
});

// Out of order on purpose: shares follow sort_order, not row order.
const OAK_PLACEMENTS: AccountPlacement[] = [
  { ffe_item_id: 'line-oak', project_room_id: 'room-kitchen', quantity: 210, sort_order: 3 },
  { ffe_item_id: 'line-oak', project_room_id: 'room-hall', quantity: 120, sort_order: 0 },
  { ffe_item_id: 'line-oak', project_room_id: 'room-dining', quantity: 180, sort_order: 2 },
  { ffe_item_id: 'line-oak', project_room_id: 'room-living', quantity: 320, sort_order: 1 },
];

const committedByRoom = (rows: ReturnType<typeof accountRoomRows>) =>
  Object.fromEntries(rows.map((r) => [r.roomName, r.committedCents]));

describe('accountRoomRows — a placed line splits by share', () => {
  it('puts the oak floor in each of its four rooms by its placed share', () => {
    const rows = accountRoomRows(ROOMS, [OAK], OAK_PLACEMENTS);
    expect(committedByRoom(rows)).toEqual({
      Hall: 151_800,
      'Living Room': 404_800,
      Dining: 227_700,
      Kitchen: 265_650,
    });
    const hall = rows.find((r) => r.roomName === 'Hall')!;
    expect(hall.varianceCents).toBe(200_000 - 151_800);
    expect(hall.categories).toEqual([
      { name: 'flooring', committedCents: 151_800, committed: { currency: 'USD', cents: 151_800 } },
    ]);
  });

  it('never doubles the line: the rooms together hold its money exactly once', () => {
    const rows = accountRoomRows(ROOMS, [OAK], OAK_PLACEMENTS);
    const sum = rows.reduce((s, r) => s + r.committedCents, 0);
    expect(sum).toBe(1_049_950);
    expect(rows.some((r) => r.roomName === 'Throughout')).toBe(false);
  });

  it('splits uneven cents by largest remainder so no cent is lost or invented', () => {
    const rug = line({ id: 'line-rug', line_total_cents: 100, project_room_id: 'room-hall' });
    const rows = accountRoomRows(ROOMS.slice(0, 3), [rug], [
      { ffe_item_id: 'line-rug', project_room_id: 'room-hall', quantity: 1, sort_order: 0 },
      { ffe_item_id: 'line-rug', project_room_id: 'room-living', quantity: 1, sort_order: 1 },
      { ffe_item_id: 'line-rug', project_room_id: 'room-dining', quantity: 1, sort_order: 2 },
    ]);
    expect(committedByRoom(rows)).toEqual({ Hall: 34, 'Living Room': 33, Dining: 33 });
  });

  it('leaves a single-room line whole in its primary room, with or without its one placement', () => {
    const sofa = line({ id: 'line-sofa', line_total_cents: 480_000, project_room_id: 'room-living' });
    const tile = line({ id: 'line-tile', line_total_cents: 90_000, project_room_id: 'room-kitchen' });
    const rows = accountRoomRows(ROOMS, [sofa, tile], [
      { ffe_item_id: 'line-tile', project_room_id: 'room-kitchen', quantity: 210, sort_order: 0 },
    ]);
    expect(committedByRoom(rows)).toEqual({
      Hall: 0,
      'Living Room': 480_000,
      Dining: 0,
      Kitchen: 90_000,
    });
  });

  it('keeps an unroomed line under Throughout, as before', () => {
    const paint = line({ id: 'line-paint', line_total_cents: 12_000, project_room_id: null });
    const rows = accountRoomRows(ROOMS, [paint], []);
    expect(rows.at(-1)).toMatchObject({ roomId: null, roomName: 'Throughout', committedCents: 12_000 });
  });
});

describe('useAccountPage — reads placements and splits the room budgets', () => {
  it('splits the oak floor across its rooms while the job total counts it once', async () => {
    mockTables = {
      projects: { budget_cents: 2_000_000, total_amount_cents: 2_000_000, design_fee_cents: 0 },
      project_ffe_items: [OAK],
      project_rooms: ROOMS,
      project_payment_milestones: [],
      project_ffe_placements: OAK_PLACEMENTS,
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useAccountPage('project-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.committedCents).toBe(1_049_950);
    expect(committedByRoom(data.rooms)).toEqual({
      Hall: 151_800,
      'Living Room': 404_800,
      Dining: 227_700,
      Kitchen: 265_650,
    });
  });
});
