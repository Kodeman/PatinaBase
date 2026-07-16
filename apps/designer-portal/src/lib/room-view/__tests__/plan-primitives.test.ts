import { rectCorners } from '../geometry';
import { planPrimitives, type PlanPrimitive } from '../plan-primitives';
import { prototypeRoom } from '../__fixtures__/room-fixture';

function countByKind(prims: PlanPrimitive[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of prims) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  return counts;
}

function boundsOf(pts: Array<{ x: number; z: number }>) {
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minZ: Math.min(...pts.map((p) => p.z)),
    maxZ: Math.max(...pts.map((p) => p.z)),
  };
}

describe('planPrimitives — counts per kind on the prototype room', () => {
  const prims = planPrimitives(prototypeRoom());
  const counts = countByKind(prims);

  it('emits one floor', () => {
    expect(counts.floor).toBe(1);
  });

  it('emits 5 wall strips', () => {
    expect(counts.wallStrip).toBe(5);
  });

  it('emits a clear + triple-lines pair per window (2 each)', () => {
    expect(counts.windowClear).toBe(2);
    expect(counts.windowLines).toBe(2);
  });

  it('emits a clear + leaf for the one door, and NO swing arc when swing is null (I73b)', () => {
    expect(counts.doorClear).toBe(1);
    expect(counts.doorLeaf).toBe(1);
    expect(counts.doorSwingArc ?? 0).toBe(0);
  });

  it('emits one clear for the pass-through opening (no leaf/arc/lines)', () => {
    expect(counts.openingClear).toBe(1);
  });

  it('emits 5 furniture ghosts', () => {
    expect(counts.ghostObject).toBe(5);
  });

  it('emits the 2 quiet overall dimension labels', () => {
    expect(counts.dimLabel).toBe(2);
  });

  it('emits 20 primitives total in a fixed order', () => {
    expect(prims).toHaveLength(20);
    expect(prims.map((p) => p.kind)).toEqual([
      'floor',
      'wallStrip',
      'wallStrip',
      'wallStrip',
      'wallStrip',
      'wallStrip',
      'windowClear',
      'windowLines',
      'windowClear',
      'windowLines',
      'doorClear',
      'doorLeaf',
      'openingClear',
      'ghostObject',
      'ghostObject',
      'ghostObject',
      'ghostObject',
      'ghostObject',
      'dimLabel',
      'dimLabel',
    ]);
  });
});

describe('planPrimitives — pass-through openings render as a plain wall gap', () => {
  const prims = planPrimitives(prototypeRoom());

  it('emits exactly one openingClear, on the opening’s wall (index 2)', () => {
    const clears = prims.filter((p) => p.kind === 'openingClear');
    expect(clears).toHaveLength(1);
    if (clears[0].kind === 'openingClear') {
      expect(clears[0].wallIndex).toBe(2);
      expect(clears[0].openingIndex).toBe(0);
    }
  });

  it('tips the opening with its width via ftIn', () => {
    const clear = prims.find((p) => p.kind === 'openingClear');
    if (clear?.kind === 'openingClear') {
      expect(clear.tip).toBe('opening — 3′ 0″ wide');
    }
  });

  it('draws NO leaf, NO swing arc, and NO glass lines for the opening (wall 2)', () => {
    // the door (wall 3) and windows (wall 4) own the only leaf/lines; wall 2 stays a bare gap
    const onOpeningWall = (p: PlanPrimitive): boolean =>
      (p.kind === 'doorLeaf' || p.kind === 'doorSwingArc' || p.kind === 'windowLines') &&
      p.wallIndex === 2;
    expect(prims.some(onOpeningWall)).toBe(false);
    // and no leaf/arc/lines kinds gained a count from the opening at all
    const counts = countByKind(prims);
    expect(counts.doorLeaf).toBe(1); // door only
    expect(counts.doorSwingArc ?? 0).toBe(0);
    expect(counts.windowLines).toBe(2); // windows only
  });

  it('clears the east wall strip zone at 4–7 ft along the wall (centre z = 5.5)', () => {
    const clear = prims.find((p) => p.kind === 'openingClear');
    if (clear?.kind === 'openingClear') {
      // east wall runs (19,0)→(19,14); opening 4–7 ft → z-midpoint 5.5, width 3
      expect(clear.rect.cz).toBeCloseTo(5.5, 6);
      expect(clear.rect.w).toBeCloseTo(3, 6);
    }
  });
});

describe('planPrimitives — low-confidence flag is set ONLY on the low wall (I73a)', () => {
  const walls = planPrimitives(prototypeRoom()).filter((p) => p.kind === 'wallStrip');

  it('flags exactly one wall strip as low confidence', () => {
    const low = walls.filter((w) => w.kind === 'wallStrip' && w.lowConf);
    expect(low).toHaveLength(1);
  });

  it('flags wall index 1 (the "east run") and no other', () => {
    for (const w of walls) {
      if (w.kind !== 'wallStrip') continue;
      expect(w.lowConf).toBe(w.wallIndex === 1);
    }
  });
});

describe('planPrimitives — exact tip strings (built via ftIn)', () => {
  const prims = planPrimitives(prototypeRoom());

  it('high-confidence wall: "<name> — <len>"', () => {
    const w0 = prims.find((p) => p.kind === 'wallStrip' && p.wallIndex === 0);
    expect(w0).toBeDefined();
    if (w0?.kind === 'wallStrip') {
      expect(w0.tip).toBe('North wall (west run) — 13′ 0″');
    }
  });

  it('low-confidence wall appends the verify note', () => {
    const w1 = prims.find((p) => p.kind === 'wallStrip' && p.wallIndex === 1);
    if (w1?.kind === 'wallStrip') {
      expect(w1.tip).toBe('North wall (east run) — 6′ 0″ · low confidence — verify on site');
    }
  });

  it('window: "window — <width> wide · sill <sill>"', () => {
    const win = prims.find((p) => p.kind === 'windowClear');
    if (win?.kind === 'windowClear') {
      expect(win.tip).toBe('window — 4′ 0″ wide · sill 2′ 6″');
    }
  });

  it('door: "door — <width> wide"', () => {
    const door = prims.find((p) => p.kind === 'doorClear');
    if (door?.kind === 'doorClear') {
      expect(door.tip).toBe('door — 3′ 0″ wide');
    }
  });

  it('object: the object label verbatim', () => {
    const ghost = prims.find((p) => p.kind === 'ghostObject');
    if (ghost?.kind === 'ghostObject') {
      expect(ghost.tip).toBe('sofa · 84″ × 36″');
      expect(ghost.cat).toBe('sofa');
    }
  });
});

describe('planPrimitives — door swing arc appears ONLY when swing is present (I73b)', () => {
  it('adds exactly one arc when the door carries a swing', () => {
    const g = prototypeRoom();
    g.doors[0].swing = 'left';
    const prims = planPrimitives(g);
    const arcs = prims.filter((p) => p.kind === 'doorSwingArc');
    expect(arcs).toHaveLength(1);
    // arc is centred at the hinge jamb, radius = door width (3 ft)
    if (arcs[0].kind === 'doorSwingArc') {
      expect(arcs[0].radius).toBeCloseTo(3, 6);
      expect(arcs[0].cx).toBeCloseTo(15.5, 6);
      expect(arcs[0].cz).toBeCloseTo(14, 6);
    }
  });

  it('never adds an arc when swing is null/undefined', () => {
    const prims = planPrimitives(prototypeRoom());
    expect(prims.some((p) => p.kind === 'doorSwingArc')).toBe(false);
  });
});

describe('planPrimitives — geometry matches the prototype drawing', () => {
  const prims = planPrimitives(prototypeRoom());

  it('draws the west wall strip on the exterior at x ∈ [-0.45, 0] (matches the prototype)', () => {
    const w4 = prims.find((p) => p.kind === 'wallStrip' && p.wallIndex === 4);
    expect(w4?.kind).toBe('wallStrip');
    if (w4?.kind === 'wallStrip') {
      const b = boundsOf(rectCorners(w4.rect));
      expect(b.minX).toBeCloseTo(-0.45, 6);
      expect(b.maxX).toBeCloseTo(0, 6);
      expect(b.minZ).toBeCloseTo(-0.45, 6);
      expect(b.maxZ).toBeCloseTo(14.45, 6);
    }
  });

  it('draws the door leaf from the hinge jamb into the room (15.5,14) → (15.5,11)', () => {
    const leaf = prims.find((p) => p.kind === 'doorLeaf');
    if (leaf?.kind === 'doorLeaf') {
      expect(leaf.line.x1).toBeCloseTo(15.5, 6);
      expect(leaf.line.z1).toBeCloseTo(14, 6);
      expect(leaf.line.x2).toBeCloseTo(15.5, 6);
      expect(leaf.line.z2).toBeCloseTo(11, 6);
    }
  });

  it('draws three parallel glass lines per window, inner line on the wall centreline', () => {
    const lines = prims.find((p) => p.kind === 'windowLines');
    if (lines?.kind === 'windowLines') {
      expect(lines.lines).toHaveLength(3);
      // west wall runs along z at x=0; inner line (offset 0) sits on the centreline
      const inner = lines.lines[0];
      expect(inner.x1).toBeCloseTo(0, 6);
      expect(inner.z1).toBeCloseTo(2.5, 6);
      expect(inner.x2).toBeCloseTo(0, 6);
      expect(inner.z2).toBeCloseTo(6.5, 6);
      // outer line pushed a full thickness onto the exterior (−x)
      const outer = lines.lines[2];
      expect(outer.x1).toBeCloseTo(-0.45, 6);
    }
  });

  it('places the sofa ghost centre at (17.1, 7) with its label anchored there', () => {
    const ghost = prims.find((p) => p.kind === 'ghostObject');
    if (ghost?.kind === 'ghostObject') {
      expect(ghost.rect.cx).toBeCloseTo(17.1, 6);
      expect(ghost.rect.cz).toBeCloseTo(7, 6);
      expect(ghost.labelAnchor).toEqual({ x: ghost.rect.cx, z: ghost.rect.cz });
    }
  });

  it('labels the overall dimensions via ftIn', () => {
    const dims = prims.filter((p) => p.kind === 'dimLabel');
    const width = dims.find((p) => p.kind === 'dimLabel' && p.axis === 'width');
    const depth = dims.find((p) => p.kind === 'dimLabel' && p.axis === 'depth');
    if (width?.kind === 'dimLabel') expect(width.text).toBe('19′ 0″');
    if (depth?.kind === 'dimLabel') expect(depth.text).toBe('14′ 0″');
  });
});

describe('planPrimitives — options', () => {
  it('hideObjects suppresses all furniture ghosts', () => {
    const prims = planPrimitives(prototypeRoom(), { hideObjects: true });
    expect(prims.some((p) => p.kind === 'ghostObject')).toBe(false);
    // everything else remains
    expect(prims.filter((p) => p.kind === 'wallStrip')).toHaveLength(5);
  });
});

describe('planPrimitives — deterministic / stable output (regression)', () => {
  it('produces identical output across repeated calls (no randomness)', () => {
    const a = planPrimitives(prototypeRoom());
    const b = planPrimitives(prototypeRoom());
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is a stable snapshot of the prototype room', () => {
    expect(planPrimitives(prototypeRoom())).toMatchSnapshot();
  });
});
