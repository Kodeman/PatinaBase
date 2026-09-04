import {
  fitLeaderText,
  MAX_LEADER_CHARS,
  planKeyGeometry,
  PLAN_MARK_STROKE,
  type KeyMark,
  type KeyRoom,
} from '../plan-key';

function room(id: string, name: string, sortOrder = 0, floorAreaSqft: number | null = null): KeyRoom {
  return { id, name, sortOrder, floorAreaSqft };
}

const ROOMS: KeyRoom[] = [
  room('r-bed', 'Bedroom', 2),
  room('r-lib', 'Library', 1),
  room('r-ent', 'Entry', 0),
];

describe('planKeyGeometry — order', () => {
  it('draws the rooms in sort order', () => {
    const geometry = planKeyGeometry(ROOMS, []);
    expect(geometry.rects.map((rect) => rect.roomId)).toEqual(['r-ent', 'r-lib', 'r-bed']);
  });

  it('breaks a tie on name, then id, so equal sort orders are deterministic', () => {
    const flat: KeyRoom[] = [
      room('r-2', 'Stair hall'),
      room('r-1', 'Stair hall'),
      room('r-3', 'Entry'),
    ];
    const first = planKeyGeometry(flat, []);
    const second = planKeyGeometry([...flat].reverse(), []);
    expect(first.rects.map((rect) => rect.roomId)).toEqual(['r-3', 'r-1', 'r-2']);
    expect(second).toEqual(first);
  });

  it('labels each room under its own rect', () => {
    const geometry = planKeyGeometry(ROOMS, []);
    expect(geometry.labels.map((label) => label.text)).toEqual(['Entry', 'Library', 'Bedroom']);
    geometry.labels.forEach((label, index) => {
      const rect = geometry.rects[index];
      expect(label.roomId).toBe(rect.roomId);
      expect(label.x).toBeGreaterThanOrEqual(rect.x);
      expect(label.y).toBeGreaterThan(rect.y + rect.h);
    });
  });

  it('anchors every rect and label on the room', () => {
    const geometry = planKeyGeometry(ROOMS, []);
    expect(geometry.rects.map((rect) => rect.anchor)).toEqual([
      'room-r-ent',
      'room-r-lib',
      'room-r-bed',
    ]);
  });
});

describe('planKeyGeometry — widths', () => {
  it('gives every room the same width when no room carries a floor area', () => {
    const geometry = planKeyGeometry(ROOMS, []);
    const widths = geometry.rects.map((rect) => rect.w);
    expect(new Set(widths).size).toBe(1);
  });

  it('gives every room the same width when only some rooms carry a floor area', () => {
    const partial: KeyRoom[] = [
      room('r-ent', 'Entry', 0, 90),
      room('r-lib', 'Library', 1, null),
      room('r-bed', 'Bedroom', 2, 400),
    ];
    const widths = planKeyGeometry(partial, []).rects.map((rect) => rect.w);
    expect(new Set(widths).size).toBe(1);
  });

  it('scales the widths to floor area when every room carries one', () => {
    const measured: KeyRoom[] = [
      room('r-ent', 'Entry', 0, 100),
      room('r-lib', 'Library', 1, 200),
      room('r-bed', 'Bedroom', 2, 300),
    ];
    const widths = planKeyGeometry(measured, []).rects.map((rect) => rect.w);
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
  });

  it('never draws a room narrower than 84 units', () => {
    const lopsided: KeyRoom[] = [
      room('r-closet', 'Closet', 0, 4),
      room('r-great', 'Great room', 1, 2000),
    ];
    const widths = planKeyGeometry(lopsided, []).rects.map((rect) => rect.w);
    widths.forEach((width) => expect(width).toBeGreaterThanOrEqual(84));
  });

  it('lays the rooms out abutting in a 62-tall band', () => {
    const geometry = planKeyGeometry(ROOMS, []);
    geometry.rects.forEach((rect, index) => {
      expect(rect.h).toBe(62);
      expect(rect.y).toBe(geometry.rects[0].y);
      if (index > 0) {
        const previous = geometry.rects[index - 1];
        expect(rect.x).toBe(previous.x + previous.w);
      }
    });
  });
});

describe('planKeyGeometry — the road', () => {
  it('runs the road to the right of the last room', () => {
    const geometry = planKeyGeometry(ROOMS, []);
    const last = geometry.rects[geometry.rects.length - 1];
    expect(geometry.road.x1).toBeGreaterThan(last.x + last.w);
    expect(geometry.road.x2).toBeGreaterThan(geometry.road.x1);
    expect(geometry.road.anchor).toBe('road');
  });

  it('keeps the road when there are no rooms at all', () => {
    const geometry = planKeyGeometry([], []);
    expect(geometry.rects).toEqual([]);
    expect(geometry.labels).toEqual([]);
    expect(geometry.doorMarks).toEqual([]);
    expect(geometry.leaders).toEqual([]);
    expect(geometry.road.x2).toBeGreaterThan(geometry.road.x1);
  });

  it('sizes the viewBox to hold the road', () => {
    const geometry = planKeyGeometry(ROOMS, []);
    const [, , width, height] = geometry.viewBox.split(' ').map(Number);
    expect(width).toBeGreaterThan(geometry.road.x2);
    expect(height).toBe(152);
  });
});

describe('planKeyGeometry — marks', () => {
  const doorMark: KeyMark = {
    kind: 'door',
    roomId: 'r-lib',
    label: 'The library door',
    anchor: 'door',
  };
  const wallMark: KeyMark = {
    kind: 'wall',
    roomId: 'r-ent',
    label: 'The painted wall',
    anchor: 'wall',
  };

  it('puts a 3-unit door mark on the room carrying the open ask', () => {
    const geometry = planKeyGeometry(ROOMS, [doorMark]);
    expect(geometry.doorMarks).toHaveLength(1);
    const [mark] = geometry.doorMarks;
    const library = geometry.rects.find((rect) => rect.roomId === 'r-lib')!;
    expect(mark.roomId).toBe('r-lib');
    expect(mark.kind).toBe('door');
    expect(mark.anchor).toBe('door');
    expect(mark.x).toBe(library.x);
    expect(PLAN_MARK_STROKE).toBe(3);
    expect(mark.y1).toBeGreaterThan(library.y);
    expect(mark.y2).toBeLessThan(library.y + library.h);
  });

  it('marks a trade acceptance as a wall, not a door', () => {
    const geometry = planKeyGeometry(ROOMS, [wallMark]);
    expect(geometry.doorMarks.map((mark) => mark.kind)).toEqual(['wall']);
  });

  it('leaves the rooms unmarked when nothing is asked of the client', () => {
    expect(planKeyGeometry(ROOMS, []).doorMarks).toEqual([]);
  });

  it('drops a mark whose room is not on this drawing', () => {
    const stray: KeyMark = { kind: 'door', roomId: 'r-gone', label: 'Elsewhere', anchor: 'door' };
    expect(planKeyGeometry(ROOMS, [stray]).doorMarks).toEqual([]);
  });

  it('drops an unscoped mark — it stands on the doorstep, not on the drawing', () => {
    const doorstep: KeyMark = {
      kind: 'door',
      roomId: null,
      label: 'Design services agreement',
      anchor: 'doorstep',
    };
    expect(planKeyGeometry(ROOMS, [doorstep]).doorMarks).toEqual([]);
  });

  it('leaders every mark out to its own label', () => {
    const geometry = planKeyGeometry(ROOMS, [doorMark, wallMark]);
    expect(geometry.leaders.map((leader) => leader.text)).toEqual([
      'The library door',
      'The painted wall',
    ]);
    const [door, wall] = geometry.leaders;
    // A door reads out below the band; a wall reads out above it.
    expect(door.toY).toBeGreaterThan(door.fromY);
    expect(wall.toY).toBeLessThan(wall.fromY);
    expect(door.toX).toBeGreaterThan(door.fromX);
    expect(wall.toX).toBeGreaterThan(wall.fromX);
  });

  it('is deterministic for the same rooms and marks', () => {
    const once = planKeyGeometry(ROOMS, [doorMark, wallMark]);
    const twice = planKeyGeometry(ROOMS, [doorMark, wallMark]);
    expect(twice).toEqual(once);
  });
});

describe('planKeyGeometry — the sheet fits its own lettering', () => {
  const longMark: KeyMark = {
    kind: 'wall',
    roomId: 'r-bed',
    label: 'Paintwork and plaster to the whole upper floor',
    anchor: 'wall',
  };

  it('cuts a label past the drawing’s budget, and marks the cut', () => {
    expect(fitLeaderText('The painted wall')).toBe('The painted wall');
    const cut = fitLeaderText(longMark.label);
    expect(cut).toHaveLength(MAX_LEADER_CHARS);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('carries the cut label onto the leader itself', () => {
    const geometry = planKeyGeometry(ROOMS, [longMark]);
    expect(geometry.leaders[0].text).toBe(fitLeaderText(longMark.label));
  });

  it('widens the viewBox until the last letter is inside it', () => {
    const bare = planKeyGeometry(ROOMS, []);
    const lettered = planKeyGeometry(ROOMS, [longMark]);
    const width = (viewBox: string) => Number(viewBox.split(/\s+/)[2]);

    const leader = lettered.leaders[0];
    // 22 mono characters at 13 units apiece run past the road's right edge.
    expect(width(lettered.viewBox)).toBeGreaterThan(width(bare.viewBox));
    expect(width(lettered.viewBox)).toBeGreaterThanOrEqual(
      leader.toX + leader.text.length * 8,
    );
  });

  it('sets the road’s own name on the room labels’ baseline, under the dash', () => {
    const geometry = planKeyGeometry(ROOMS, []);
    expect(geometry.roadLabelY).toBe(geometry.labels[0].y);
    expect(geometry.roadLabelY).toBeGreaterThan(geometry.road.y);
  });
});
