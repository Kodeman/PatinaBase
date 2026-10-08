import {
  specAlsoInLine,
  specQuantityLabel,
  type SpecRoomPlacement,
} from '../model';

/**
 * US-21 T-32. The words a spec-book line prints for 00735's piece keys, the
 * same words the issued book prints (spec-book-render `quantityText` and
 * `alsoInText`). D7 case 1's oak floor: 913 sq ft bought, 830 placed.
 */
const oak: SpecRoomPlacement[] = [
  { roomName: 'Hall', quantity: 120 },
  { roomName: 'Living Room', quantity: 320 },
  { roomName: 'Dining', quantity: 210, areaNote: 'to the bay' },
  { roomName: 'Kitchen', quantity: 180, areaNote: null },
];

describe('specQuantityLabel', () => {
  it('prints the quantity with the unit it counts', () => {
    expect(specQuantityLabel(913, 'sq_ft')).toBe('913 sq ft');
    expect(specQuantityLabel(42, 'lin_ft')).toBe('42 lin ft');
    expect(specQuantityLabel(9, 'roll')).toBe('9 roll');
  });

  it('prints the bare number for each and for a line with no unit, as today', () => {
    expect(specQuantityLabel(2, 'each')).toBe('2');
    expect(specQuantityLabel(2, null)).toBe('2');
    expect(specQuantityLabel(2)).toBe('2');
  });
});

describe('specAlsoInLine', () => {
  it('names the other rooms, then this room’s share', () => {
    expect(specAlsoInLine(oak, 'Living Room', 'sq_ft')).toBe(
      'ALSO IN HALL · DINING · KITCHEN · 320 SQ FT HERE',
    );
  });

  it('carries this room’s area note after its share', () => {
    expect(specAlsoInLine(oak, 'Dining', 'sq_ft')).toBe(
      'ALSO IN HALL · LIVING ROOM · KITCHEN · 210 SQ FT HERE · TO THE BAY',
    );
  });

  it('names every room when the line is read from none of them', () => {
    expect(specAlsoInLine(oak, null, 'sq_ft')).toBe(
      'ALSO IN HALL · LIVING ROOM · DINING · KITCHEN',
    );
  });

  it('prints a counted share with no unit word', () => {
    expect(
      specAlsoInLine(
        [
          { roomName: 'Hall', quantity: 1 },
          { roomName: 'Study', quantity: 2 },
        ],
        'Study',
        'each',
      ),
    ).toBe('ALSO IN HALL · 2 HERE');
  });

  it('prints nothing for a line in one room or none, as today', () => {
    expect(specAlsoInLine(undefined, 'Hall', 'sq_ft')).toBeNull();
    expect(specAlsoInLine(null, 'Hall')).toBeNull();
    expect(specAlsoInLine([], 'Hall')).toBeNull();
    expect(specAlsoInLine([{ roomName: 'Hall', quantity: 120 }], 'Hall', 'sq_ft')).toBeNull();
  });
});
