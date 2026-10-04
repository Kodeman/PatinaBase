import {
  buildSendToScheduleArgs,
  computeBoardDrift,
  findExistingScheduleLine,
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
  vendorId: null,
  vendorName: null,
  sourceUrl: null,
  proposalItemId: null,
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

  it('sends the board price on a retail basis, never as trade (R-DI4)', () => {
    const args = buildSendToScheduleArgs({
      proposalId: 'prop-1',
      snap: snap({ priceCents: 89900 }),
      boardScopeRoomId: null,
      existingCodes: [],
    });
    expect(args.priceBasis).toBe('retail');
    expect(args.unitPrice).toBe(89900);
    expect(args).not.toHaveProperty('unitTradePrice');
  });

  it('carries the pin vendor id, vendor name and source_url', () => {
    const args = buildSendToScheduleArgs({
      proposalId: 'prop-1',
      snap: snap({
        productId: null,
        type: 'capture',
        vendorId: 'vendor-9',
        vendorName: 'Marlow & Co',
        sourceUrl: 'https://maker.example/chair',
      }),
      boardScopeRoomId: null,
      existingCodes: [],
    });
    expect(args).toMatchObject({
      vendorId: 'vendor-9',
      vendorName: 'Marlow & Co',
      customFields: { source_url: 'https://maker.example/chair' },
    });
  });

  it('omits vendor and custom fields the pin does not have', () => {
    const args = buildSendToScheduleArgs({
      proposalId: 'prop-1',
      snap: snap(),
      boardScopeRoomId: null,
      existingCodes: [],
    });
    expect(args).not.toHaveProperty('vendorId');
    expect(args).not.toHaveProperty('vendorName');
    expect(args).not.toHaveProperty('customFields');
  });
});

describe('findExistingScheduleLine (dedupe key)', () => {
  it('finds the line a URL pin was already sent to via data.proposalItemId', () => {
    const sent = line({ id: 'line-7', product_id: null, scope_room_id: null });
    const existing = findExistingScheduleLine(
      [line(), sent],
      snap({ productId: null, proposalItemId: 'line-7' }),
      'room-1',
    );
    expect(existing?.id).toBe('line-7');
  });

  it('lets a pin whose backlinked line was deleted be sent again', () => {
    expect(
      findExistingScheduleLine([line()], snap({ productId: null, proposalItemId: 'gone' }), 'room-1'),
    ).toBeUndefined();
  });

  it('keeps the product twin guard for product pins without a backlink', () => {
    expect(findExistingScheduleLine([line()], snap(), 'room-1')?.id).toBe('line-1');
  });

  it('a product-less pin with no backlink is addable', () => {
    expect(findExistingScheduleLine([line()], snap({ productId: null }), 'room-1')).toBeUndefined();
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
