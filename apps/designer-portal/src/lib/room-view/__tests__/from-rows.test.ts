import {
  roomGeometryFromRows,
  THICKNESS_CONVENTION_FT,
  WALL_HEIGHT_FALLBACK_FT,
  type RoomScanGeometryElementRow,
  type RoomScanGeometryRow,
} from '../from-rows';

/** minimal element factory with required shared fields */
function el(partial: Partial<RoomScanGeometryElementRow> & Pick<RoomScanGeometryElementRow, 'id' | 'kind'>): RoomScanGeometryElementRow {
  return {
    position: null,
    confidence: null,
    label: null,
    apple_id: null,
    ...partial,
  };
}

const geoRow = (over: Partial<RoomScanGeometryRow> = {}): RoomScanGeometryRow => ({
  width_ft: 19,
  depth_ft: 14,
  wall_height_ft: 8,
  wall_thickness_ft: 0.5,
  floor_polygon: null,
  floor_area_sqft: null,
  confidence_summary: null,
  ...over,
});

describe('roomGeometryFromRows — wall ordering by position', () => {
  it('orders walls by the position column, not array order', () => {
    const elements = [
      el({ id: 'w-b', kind: 'wall', position: 1, x1_ft: 5, z1_ft: 0, x2_ft: 5, z2_ft: 8, label: 'B' }),
      el({ id: 'w-a', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 5, z2_ft: 0, label: 'A' }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.walls.map((w) => w.name)).toEqual(['A', 'B']);
  });

  it('places null-position walls last, preserving input order among them', () => {
    const elements = [
      el({ id: 'w-null', kind: 'wall', position: null, x1_ft: 0, z1_ft: 0, x2_ft: 1, z2_ft: 0, label: 'N' }),
      el({ id: 'w-0', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 2, z2_ft: 0, label: 'Z' }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.walls.map((w) => w.name)).toEqual(['Z', 'N']);
  });

  it('computes wall length from endpoints', () => {
    const elements = [el({ id: 'w', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 3, z2_ft: 4 })];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.walls[0].len).toBeCloseTo(5, 6);
  });

  it('names an unlabelled wall "Wall N"', () => {
    const elements = [el({ id: 'w', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 3, z2_ft: 0 })];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.walls[0].name).toBe('Wall 1');
  });
});

describe('roomGeometryFromRows — wall_element_id → wall index resolution', () => {
  it('resolves an opening to the wall index by element id', () => {
    const elements = [
      el({ id: 'wall-A', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 10, z2_ft: 0 }),
      el({ id: 'wall-B', kind: 'wall', position: 1, x1_ft: 10, z1_ft: 0, x2_ft: 10, z2_ft: 8 }),
      el({ id: 'win-1', kind: 'window', wall_element_id: 'wall-B', from_ft: 2, to_ft: 5, sill_ft: 2.5, head_ft: 7 }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.windows).toHaveLength(1);
    expect(geometry.windows[0].wall).toBe(1); // wall-B is index 1 after ordering
    expect(geometry.windows[0]).toMatchObject({ from: 2, to: 5, sill: 2.5, head: 7 });
  });

  it('resolves by apple_id when wall_element_id references it', () => {
    const elements = [
      el({ id: 'row-1', apple_id: 'apple-xyz', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 10, z2_ft: 0 }),
      el({ id: 'door-1', kind: 'door', wall_element_id: 'apple-xyz', from_ft: 3, to_ft: 6, head_ft: 7 }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.doors).toHaveLength(1);
    expect(geometry.doors[0].wall).toBe(0);
  });

  it('drops an opening with an unresolvable wall_element_id and warns', () => {
    const elements = [
      el({ id: 'wall-A', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 10, z2_ft: 0 }),
      el({ id: 'win-x', kind: 'window', wall_element_id: 'nope', from_ft: 2, to_ft: 5 }),
    ];
    const { geometry, warnings } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.windows).toHaveLength(0);
    expect(warnings.some((w) => w.includes('win-x') && w.includes('unresolved'))).toBe(true);
  });
});

describe('roomGeometryFromRows — thickness default + convention flag (I73d)', () => {
  it('defaults thickness to 0.45 ft and flags the convention when null', () => {
    const { geometry, warnings, thicknessConvention } = roomGeometryFromRows(
      geoRow({ wall_thickness_ft: null }),
      [],
    );
    expect(geometry.thick).toBe(THICKNESS_CONVENTION_FT);
    expect(thicknessConvention).toBe(true);
    expect(warnings.some((w) => w.includes('wall_thickness_ft'))).toBe(true);
  });

  it('uses the provided thickness and does not flag a convention', () => {
    const { geometry, thicknessConvention } = roomGeometryFromRows(geoRow({ wall_thickness_ft: 0.6 }), []);
    expect(geometry.thick).toBe(0.6);
    expect(thicknessConvention).toBe(false);
  });

  it('defaults wall height to the fallback and warns when null', () => {
    const { geometry, warnings } = roomGeometryFromRows(geoRow({ wall_height_ft: null }), []);
    expect(geometry.wallH).toBe(WALL_HEIGHT_FALLBACK_FT);
    expect(warnings.some((w) => w.includes('wall_height_ft'))).toBe(true);
  });
});

describe('roomGeometryFromRows — object centre → corner conversion', () => {
  it('converts centre to top-left corner and preserves rotation', () => {
    const elements = [
      el({
        id: 'obj-1',
        kind: 'object',
        position: 0,
        cat: 'sofa',
        label: 'sofa · 84″ × 36″',
        center_x_ft: 17.1,
        center_z_ft: 7,
        width_ft: 3,
        depth_ft: 7,
        height_ft: 2.6,
        rotation_deg: 15,
      }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.objects).toHaveLength(1);
    const o = geometry.objects[0];
    expect(o.x).toBeCloseTo(17.1 - 3 / 2, 6); // 15.6
    expect(o.z).toBeCloseTo(7 - 7 / 2, 6); // 3.5
    expect(o).toMatchObject({ w: 3, d: 7, h: 2.6, rotationDeg: 15, cat: 'sofa', label: 'sofa · 84″ × 36″' });
  });

  it('defaults rotation to 0 and label to the category when absent', () => {
    const elements = [
      el({ id: 'obj-2', kind: 'object', position: 0, cat: 'chair', center_x_ft: 4, center_z_ft: 4, width_ft: 2, depth_ft: 2 }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.objects[0]).toMatchObject({ rotationDeg: 0, cat: 'chair', label: 'chair' });
  });
});

describe('roomGeometryFromRows — defensive handling of partial rows (never throws)', () => {
  it('drops a wall with incomplete endpoints and warns', () => {
    const elements = [
      el({ id: 'good', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 5, z2_ft: 0 }),
      el({ id: 'bad', kind: 'wall', position: 1, x1_ft: 0, z1_ft: 0, x2_ft: null, z2_ft: 0 }),
    ];
    const { geometry, warnings } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.walls).toHaveLength(1);
    expect(warnings.some((w) => w.includes('bad') && w.includes('incomplete'))).toBe(true);
  });

  it('drops an object with missing size and warns', () => {
    const elements = [
      el({ id: 'obj-bad', kind: 'object', position: 0, cat: 'lamp', center_x_ft: 1, center_z_ft: 1, width_ft: null, depth_ft: 2 }),
    ];
    const { geometry, warnings } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.objects).toHaveLength(0);
    expect(warnings.some((w) => w.includes('obj-bad'))).toBe(true);
  });

  it('does not throw when given a null geometry row and empty elements', () => {
    expect(() => roomGeometryFromRows(null, [])).not.toThrow();
    const { geometry, thicknessConvention } = roomGeometryFromRows(null, []);
    expect(geometry.thick).toBe(THICKNESS_CONVENTION_FT);
    expect(thicknessConvention).toBe(true);
    expect(geometry.walls).toEqual([]);
  });
});

describe('roomGeometryFromRows — pass-through openings buckets', () => {
  it('buckets a well-formed opening into openings[] resolved to its wall index', () => {
    const elements = [
      el({ id: 'wall-A', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 10, z2_ft: 0 }),
      el({ id: 'wall-B', kind: 'wall', position: 1, x1_ft: 10, z1_ft: 0, x2_ft: 10, z2_ft: 8 }),
      el({ id: 'open-1', kind: 'opening', wall_element_id: 'wall-B', from_ft: 2, to_ft: 5, head_ft: 7 }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.openings).toHaveLength(1);
    expect(geometry.openings[0]).toMatchObject({ wall: 1, from: 2, to: 5, h: 7 });
    // an opening is NOT a door and NOT a window
    expect(geometry.doors).toHaveLength(0);
    expect(geometry.windows).toHaveLength(0);
  });

  it('defaults opening head to null when absent (cased openings often omit it)', () => {
    const elements = [
      el({ id: 'wall-A', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 10, z2_ft: 0 }),
      el({ id: 'open-1', kind: 'opening', wall_element_id: 'wall-A', from_ft: 2, to_ft: 5 }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.openings[0].h).toBeNull();
  });

  it('drops an opening with an unresolvable wall and warns (malformed only)', () => {
    const elements = [
      el({ id: 'wall-A', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 10, z2_ft: 0 }),
      el({ id: 'open-x', kind: 'opening', wall_element_id: 'nope', from_ft: 2, to_ft: 5 }),
    ];
    const { geometry, warnings } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.openings).toHaveLength(0);
    expect(warnings.some((w) => w.includes('open-x') && w.includes('unresolved'))).toBe(true);
  });

  it('drops an opening missing from_ft/to_ft and warns', () => {
    const elements = [
      el({ id: 'wall-A', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 10, z2_ft: 0 }),
      el({ id: 'open-y', kind: 'opening', wall_element_id: 'wall-A', from_ft: 2, to_ft: null }),
    ];
    const { geometry, warnings } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.openings).toHaveLength(0);
    expect(warnings.some((w) => w.includes('open-y') && w.includes('from_ft/to_ft'))).toBe(true);
  });
});

describe('roomGeometryFromRows — confidence + swing normalization', () => {
  it('normalizes confidence case-insensitively and keeps all three levels', () => {
    const elements = [
      el({ id: 'w1', kind: 'wall', position: 0, confidence: 'LOW', x1_ft: 0, z1_ft: 0, x2_ft: 3, z2_ft: 0 }),
      el({ id: 'w2', kind: 'wall', position: 1, confidence: 'Medium', x1_ft: 3, z1_ft: 0, x2_ft: 6, z2_ft: 0 }),
      el({ id: 'w3', kind: 'wall', position: 2, confidence: 'high', x1_ft: 6, z1_ft: 0, x2_ft: 9, z2_ft: 0 }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.walls.map((w) => w.conf)).toEqual(['low', 'medium', 'high']);
  });

  it('defaults an unrecognised confidence to high (does not fabricate low) and warns', () => {
    const elements = [el({ id: 'w1', kind: 'wall', position: 0, confidence: 'weird', x1_ft: 0, z1_ft: 0, x2_ft: 3, z2_ft: 0 })];
    const { geometry, warnings } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.walls[0].conf).toBe('high');
    expect(warnings.some((w) => w.includes('weird'))).toBe(true);
  });

  it('maps door swing/inward when present and null when absent', () => {
    const elements = [
      el({ id: 'wall-A', kind: 'wall', position: 0, x1_ft: 0, z1_ft: 0, x2_ft: 10, z2_ft: 0 }),
      el({ id: 'd-swing', kind: 'door', wall_element_id: 'wall-A', from_ft: 1, to_ft: 4, head_ft: 7, swing: 'Left', swing_inward: false }),
      el({ id: 'd-plain', kind: 'door', wall_element_id: 'wall-A', from_ft: 5, to_ft: 8, head_ft: 7 }),
    ];
    const { geometry } = roomGeometryFromRows(geoRow(), elements);
    expect(geometry.doors[0]).toMatchObject({ swing: 'left', swingInward: false });
    expect(geometry.doors[1]).toMatchObject({ swing: null, swingInward: null });
  });
});

describe('roomGeometryFromRows — floor polygon + dims fallback', () => {
  it('maps the floor polygon pairs to {x,z}', () => {
    const { geometry } = roomGeometryFromRows(
      geoRow({ floor_polygon: [[0, 0], [10, 0], [10, 8], [0, 8]] }),
      [],
    );
    expect(geometry.floor).toEqual([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 8 },
      { x: 0, z: 8 },
    ]);
  });

  it('derives width/depth from bounds when the geometry row omits them', () => {
    const { geometry, warnings } = roomGeometryFromRows(
      geoRow({ width_ft: null, depth_ft: null, floor_polygon: [[0, 0], [12, 0], [12, 9], [0, 9]] }),
      [],
    );
    expect(geometry.width).toBe(12);
    expect(geometry.depth).toBe(9);
    expect(warnings.some((w) => w.includes('width_ft/depth_ft'))).toBe(true);
  });
});
