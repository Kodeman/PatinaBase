import {
  adaptClientSelections,
  adaptCommercialDocumentBundle,
  clientQuantityLabel,
  clientRoomsLine,
} from '../commercial-documents';

// D7 phase 2 (00745): every client line carries `unit` and
// `rooms: [{name, quantity, unit}]`; roomName stays the primary room.

const OAK_ROOMS = [
  { name: 'Hall', quantity: 120, unit: 'sq_ft' },
  { name: 'Living Room', quantity: 320, unit: 'sq_ft' },
  { name: 'Dining', quantity: 60, unit: 'sq_ft' },
  { name: 'Kitchen', quantity: 330, unit: 'sq_ft' },
];

/** Keys 00745 never sends; the mapper must drop them even if they arrive. */
const NEVER_SHOWN = {
  rough_cents: 950_000,
  roughCents: 950_000,
  need_label: 'Flooring through the ground floor',
  needLabel: 'Flooring through the ground floor',
  line_kind: 'goods',
  lineKind: 'goods',
  link_kind: 'labor',
  linkKind: 'labor',
  parent_ffe_item_id: 'line-parent',
  parentFfeItemId: 'line-parent',
};

function bundleWith(items: unknown[]) {
  const adapted = adaptCommercialDocumentBundle({
    document: {
      id: 'fa-9',
      projectId: 'p1',
      documentKind: 'furnishings_authorization',
      commercialState: 'executed',
      title: 'Floors',
    },
    furnishings: { depositRequiredCents: 0, depositPaidCents: 0, items },
  });
  if (!adapted?.furnishings) throw new Error('expected a furnishings bundle');
  return adapted.furnishings;
}

describe('commercial bundle — a released line in several rooms', () => {
  it('reads rooms and unit and prints the line with every room, in placement order', () => {
    const [oak] = bundleWith([
      {
        description: 'White oak floor',
        roomName: 'Hall',
        quantity: 913,
        unit: 'sq_ft',
        rooms: OAK_ROOMS.map((room) => ({ ...room, areaNote: 'under the stair' })),
        clientUnitPriceCents: 1_150,
        clientLineTotalCents: 1_049_950,
        currency: 'USD',
        ...NEVER_SHOWN,
      },
    ]).items;

    expect(oak.unit).toBe('sq_ft');
    expect(oak.roomName).toBe('Hall');
    expect(oak.rooms).toEqual(OAK_ROOMS);
    expect(clientRoomsLine(oak.description, oak)).toBe(
      'White oak floor · 913 sq ft · Hall · Living Room · Dining · Kitchen',
    );
  });

  it('carries no rough, need label or internal field onto the client line', () => {
    const [oak] = bundleWith([
      {
        description: 'White oak floor',
        roomName: 'Hall',
        quantity: 913,
        unit: 'sq_ft',
        rooms: OAK_ROOMS,
        clientUnitPriceCents: 1_150,
        clientLineTotalCents: 1_049_950,
        currency: 'USD',
        ...NEVER_SHOWN,
      },
    ]).items;

    expect(Object.keys(oak).sort()).toEqual([
      'clientLineTotalCents',
      'clientUnitPriceCents',
      'currency',
      'description',
      'quantity',
      'roomName',
      'rooms',
      'unit',
    ]);
    for (const room of oak.rooms ?? []) {
      expect(Object.keys(room).sort()).toEqual(['name', 'quantity', 'unit']);
    }
    expect(JSON.stringify(oak)).not.toMatch(/rough|need|Flooring through|line_?kind|link_?kind|parent/i);
  });

  it('prints nothing new for a one-room line, a line in no room, or a legacy payload', () => {
    const items = bundleWith([
      {
        description: 'Writing desk',
        roomName: 'Study',
        quantity: 1,
        unit: 'each',
        rooms: [{ name: 'Study', quantity: 1, unit: 'each' }],
        clientUnitPriceCents: 320_000,
        clientLineTotalCents: 320_000,
        currency: 'USD',
      },
      {
        description: 'Paint throughout',
        roomName: null,
        quantity: 1,
        unit: null,
        rooms: [],
        clientUnitPriceCents: 0,
        clientLineTotalCents: 0,
        currency: 'USD',
      },
      {
        description: 'Meadow linen sectional',
        roomName: 'Living room',
        quantity: 1,
        clientUnitPriceCents: 1_480_000,
        clientLineTotalCents: 1_480_000,
        currency: 'USD',
      },
    ]).items;

    expect(items.map((item) => item.unit)).toEqual(['each', 'each', 'each']);
    expect(items.map((item) => item.rooms)).toEqual([
      [{ name: 'Study', quantity: 1, unit: 'each' }],
      [],
      [],
    ]);
    expect(items.map((item) => item.roomName)).toEqual(['Study', 'General', 'Living room']);
    for (const item of items) expect(clientRoomsLine(item.description, item)).toBeNull();
  });
});

describe('client selections — the threshold payload', () => {
  it('reads rooms and unit off a selection and keeps roomName the primary room', () => {
    const { selections } = adaptClientSelections({
      origin: 'commercial',
      selections: [
        {
          id: 'sel-oak',
          kind: 'furnishings',
          name: 'White oak floor',
          roomId: 'room-hall',
          roomName: 'Hall',
          quantity: 913,
          unit: 'sq_ft',
          rooms: OAK_ROOMS,
          clientUnitPriceCents: 1_150,
          clientLineTotalCents: 1_049_950,
          ...NEVER_SHOWN,
        },
      ],
    });

    const [oak] = selections;
    expect(oak.roomName).toBe('Hall');
    expect(oak.unit).toBe('sq_ft');
    expect(oak.rooms).toEqual(OAK_ROOMS);
    expect(clientRoomsLine(oak.name, oak)).toBe(
      'White oak floor · 913 sq ft · Hall · Living Room · Dining · Kitchen',
    );
    expect(JSON.stringify(oak)).not.toMatch(/rough|need|Flooring through|line_?kind|link_?kind|parent/i);
  });

  it('drops a room entry with no name and reads an unknown unit as each', () => {
    const { selections } = adaptClientSelections({
      origin: 'commercial',
      selections: [
        {
          id: 'sel-chairs',
          name: 'Dining chair',
          roomName: 'Dining',
          quantity: 8,
          unit: 'parsec',
          rooms: [{ name: 'Dining', quantity: 6 }, { quantity: 1 }, { name: 'Kitchen', quantity: 2 }],
        },
      ],
    });

    const [chairs] = selections;
    expect(chairs.unit).toBe('each');
    expect(chairs.rooms).toEqual([
      { name: 'Dining', quantity: 6, unit: 'each' },
      { name: 'Kitchen', quantity: 2, unit: 'each' },
    ]);
    expect(clientRoomsLine(chairs.name, chairs)).toBe('Dining chair · 8 · Dining · Kitchen');
  });
});

describe('clientQuantityLabel', () => {
  it('prints the unit with its underscore read as a space, and a bare count for each', () => {
    expect(clientQuantityLabel(913, 'sq_ft')).toBe('913 sq ft');
    expect(clientQuantityLabel(40, 'lin_ft')).toBe('40 lin ft');
    expect(clientQuantityLabel(9, 'roll')).toBe('9 roll');
    expect(clientQuantityLabel(1200, 'sq_ft')).toBe('1,200 sq ft');
    expect(clientQuantityLabel(8, 'each')).toBe('8');
    expect(clientQuantityLabel(8)).toBe('8');
  });
});
