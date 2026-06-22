import {
  mapDiscoveryToScopeRooms,
  formatBudgetRange,
  type DiscoveryRoom,
} from '../discovery-seed';

describe('mapDiscoveryToScopeRooms (R66 field→field, mirrors the RPC)', () => {
  it('maps name/type/area and indexes sort_order', () => {
    const rooms: DiscoveryRoom[] = [
      { name: 'Living', room_type: 'living', floor_area_sqft: 420 },
      { name: 'Dining', room_type: 'dining', floor_area_sqft: '210' },
    ];
    const out = mapDiscoveryToScopeRooms(rooms);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      name: 'Living',
      room_type: 'living',
      floor_area_sqft: 420,
      budget_cents: 0,
      sort_order: 0,
    });
    expect(out[1].floor_area_sqft).toBe(210); // string coerced
    expect(out[1].sort_order).toBe(1);
  });

  it('carries keep-as-is as a notes prefix', () => {
    const out = mapDiscoveryToScopeRooms([{ name: 'Kitchen', keep_as_is: true }]);
    expect(out[0].notes).toBe('Keep as-is');
  });

  it('combines keep-as-is with a note', () => {
    const out = mapDiscoveryToScopeRooms([
      { name: 'Kitchen', keep_as_is: true, notes: 'leave the range' },
    ]);
    expect(out[0].notes).toBe('Keep as-is · leave the range');
  });

  it('defaults a blank name to "Room" and a blank area to null', () => {
    const out = mapDiscoveryToScopeRooms([{ name: '  ', floor_area_sqft: '' }]);
    expect(out[0].name).toBe('Room');
    expect(out[0].floor_area_sqft).toBeNull();
    expect(out[0].notes).toBeNull();
  });

  it('handles a non-array defensively', () => {
    expect(mapDiscoveryToScopeRooms(undefined as unknown as DiscoveryRoom[])).toEqual([]);
  });
});

describe('formatBudgetRange', () => {
  it('formats cents to a dollar range', () => {
    expect(formatBudgetRange(6_000_000, 8_000_000)).toBe('$60,000–$80,000');
  });
  it('marks a missing bound', () => {
    expect(formatBudgetRange(null, 8_000_000)).toBe('?–$80,000');
  });
});
