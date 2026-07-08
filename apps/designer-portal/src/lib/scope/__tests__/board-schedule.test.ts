import {
  buildSendToScheduleArgs,
  computeBoardDrift,
  findScheduleTwin,
  type DriftPin,
  type PinScheduleSnapshot,
  type ScheduleLineRef,
} from '../board-schedule';

const line = (overrides: Partial<ScheduleLineRef> = {}): ScheduleLineRef => ({
  id: 'line-1',
  product_id: 'prod-a',
  doc_code: 'CH-01',
  scope_room_id: 'room-1',
  name: 'Walnut chair',
  ffe_category: 'seating',
  ...overrides,
});

const snap = (overrides: Partial<PinScheduleSnapshot> = {}): PinScheduleSnapshot => ({
  type: 'product',
  productId: 'prod-a',
  name: 'Walnut chair',
  imageUrl: 'https://cdn.example.com/chair.jpg',
  priceCents: 120000,
  ...overrides,
});

describe('findScheduleTwin (idempotence guard)', () => {
  it('matches same product in the same room', () => {
    const twin = findScheduleTwin([line()], 'prod-a', 'room-1');
    expect(twin?.id).toBe('line-1');
  });

  it('is NOT a twin when the room differs', () => {
    expect(findScheduleTwin([line({ scope_room_id: 'room-2' })], 'prod-a', 'room-1')).toBeUndefined();
  });

  it('null-normalizes rooms — "whole home" (null) matches null', () => {
    const twin = findScheduleTwin([line({ scope_room_id: null })], 'prod-a', null);
    expect(twin?.id).toBe('line-1');
  });

  it('a pin without a product_id never has a twin (always addable)', () => {
    expect(findScheduleTwin([line()], null, 'room-1')).toBeUndefined();
  });

  it('does not match a different product', () => {
    expect(findScheduleTwin([line()], 'prod-b', 'room-1')).toBeUndefined();
  });
});

describe('buildSendToScheduleArgs (payload mapping)', () => {
  it('maps name/image/price to the sell side, carries product + room', () => {
    const args = buildSendToScheduleArgs({
      proposalId: 'prop-1',
      snap: snap(),
      boardScopeRoomId: 'room-1',
      existingCodes: [],
    });
    expect(args).toMatchObject({
      proposalId: 'prop-1',
      productId: 'prod-a',
      name: 'Walnut chair',
      quantity: 1,
      unitPrice: 120000, // → unit_sell_price in useAddProposalItem
      imageUrl: 'https://cdn.example.com/chair.jpg',
      scopeRoomId: 'room-1',
    });
  });

  it('suggests a doc_code that avoids collisions with existing codes', () => {
    // No ffe_category on a board pin → consonant-prefix of the name ("Walnut
    // chair" → WL). The suggester bumps past WL-01 already on the schedule.
    const args = buildSendToScheduleArgs({
      proposalId: 'prop-1',
      snap: snap({ name: 'Walnut chair' }),
      boardScopeRoomId: 'room-1',
      existingCodes: ['WL-01'],
    });
    expect(args.docCode).toMatch(/^WL-\d{2}$/);
    expect(args.docCode).not.toBe('WL-01');
  });

  it('a price-less / name-less pin degrades to sane defaults', () => {
    const args = buildSendToScheduleArgs({
      proposalId: 'prop-1',
      snap: snap({ name: null, priceCents: null, productId: null }),
      boardScopeRoomId: null,
      existingCodes: [],
    });
    expect(args.name).toBe('Board pick');
    expect(args.unitPrice).toBe(0);
    expect(args.productId).toBeUndefined();
    expect(args.scopeRoomId).toBeNull();
  });
});

describe('computeBoardDrift (price-moved badge)', () => {
  const pin = (overrides: Partial<DriftPin> = {}): DriftPin => ({
    id: 'pin-1',
    product_id: 'prod-a',
    snapshotPriceCents: 120000,
    ...overrides,
  });

  it('flags a pin whose live price differs from the snapshot', () => {
    const drift = computeBoardDrift([pin()], new Map([['prod-a', 150000]]));
    expect(drift.has('pin-1')).toBe(true);
  });

  it('does NOT flag when the live price equals the snapshot', () => {
    const drift = computeBoardDrift([pin()], new Map([['prod-a', 120000]]));
    expect(drift.has('pin-1')).toBe(false);
  });

  it('does not flag a pin with no product_id', () => {
    const drift = computeBoardDrift([pin({ product_id: null })], new Map([['prod-a', 150000]]));
    expect(drift.size).toBe(0);
  });

  it('does not flag when the current price is unknown (missing / null)', () => {
    expect(computeBoardDrift([pin()], new Map()).size).toBe(0);
    expect(computeBoardDrift([pin()], new Map([['prod-a', null]])).size).toBe(0);
  });

  it('does not flag when the snapshot price is missing', () => {
    const drift = computeBoardDrift([pin({ snapshotPriceCents: null })], new Map([['prod-a', 150000]]));
    expect(drift.size).toBe(0);
  });
});
