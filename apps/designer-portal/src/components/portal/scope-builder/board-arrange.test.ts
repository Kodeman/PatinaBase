import type { BoardSection } from '@patina/supabase';
import {
  addSection,
  arrangeBoardItems,
  deleteSection,
  itemSectionId,
  moveSection,
  renameSection,
  sectionBounds,
  sortItemsInReadingOrder,
  type ArrangeItem,
} from './board-arrange';

// ─── Section array CRUD ──────────────────────────────────────────────────────

describe('section CRUD', () => {
  const base: BoardSection[] = [
    { id: 's1', name: 'Seating' },
    { id: 's2', name: 'Lighting' },
    { id: 's3', name: 'Textiles' },
  ];

  it('addSection appends with a fresh id and a default name when blank', () => {
    const next = addSection(base, '');
    expect(next).toHaveLength(4);
    expect(next[3].name).toBe('Section 4');
    expect(next[3].id).toBeTruthy();
    // Original array is not mutated.
    expect(base).toHaveLength(3);
    // A trimmed name is used when given.
    expect(addSection(base, '  Rugs  ')[3].name).toBe('Rugs');
  });

  it('renameSection renames the match and keeps others; blank keeps the old name', () => {
    expect(renameSection(base, 's2', 'Lamps')).toEqual([
      { id: 's1', name: 'Seating' },
      { id: 's2', name: 'Lamps' },
      { id: 's3', name: 'Textiles' },
    ]);
    expect(renameSection(base, 's2', '   ')[1].name).toBe('Lighting');
  });

  it('deleteSection removes only the match', () => {
    expect(deleteSection(base, 's2').map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('moveSection reorders within bounds and no-ops at the edges', () => {
    expect(moveSection(base, 's2', -1).map((s) => s.id)).toEqual(['s2', 's1', 's3']);
    expect(moveSection(base, 's2', 1).map((s) => s.id)).toEqual(['s1', 's3', 's2']);
    // Edges: first up / last down are no-ops.
    expect(moveSection(base, 's1', -1)).toEqual(base);
    expect(moveSection(base, 's3', 1)).toEqual(base);
    // Unknown id is a no-op.
    expect(moveSection(base, 'nope', 1)).toEqual(base);
  });
});

// ─── itemSectionId ───────────────────────────────────────────────────────────

describe('itemSectionId', () => {
  const item = (data: ArrangeItem['data']): ArrangeItem => ({
    id: 'i',
    type: 'product',
    width: 200,
    height: 100,
    data,
  });
  it('reads a non-empty section_id, else null', () => {
    expect(itemSectionId(item({ section_id: 'sec-a' }))).toBe('sec-a');
    expect(itemSectionId(item({ section_id: '' }))).toBeNull();
    expect(itemSectionId(item({ section_id: null }))).toBeNull();
    expect(itemSectionId(item(null))).toBeNull();
  });
});

// ─── arrangeBoardItems ───────────────────────────────────────────────────────

describe('arrangeBoardItems', () => {
  const mk = (id: string, sectionId: string | null, width = 200): ArrangeItem => ({
    id,
    type: 'product',
    width,
    height: 100,
    data: sectionId ? { section_id: sectionId } : {},
  });

  it('flows every item in a single grid when there are no sections', () => {
    const items = [mk('a', null), mk('b', null), mk('c', null)];
    const out = arrangeBoardItems(items, [], { canvasWidth: 1200 });
    expect(out.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
    // Wide canvas → one row, all at the same y, left-to-right.
    expect(new Set(out.map((p) => p.y)).size).toBe(1);
    expect(out[0].x).toBeLessThan(out[1].x);
  });

  it('wraps to a new row when the canvas is too narrow', () => {
    const items = [mk('a', null), mk('b', null)];
    const out = arrangeBoardItems(items, [], { canvasWidth: 300 });
    const a = out.find((p) => p.id === 'a')!;
    const b = out.find((p) => p.id === 'b')!;
    expect(b.y).toBeGreaterThan(a.y); // b dropped to the next row
    expect(b.x).toBe(a.x); // and reset to the left pad
  });

  it('groups by section order, then trailing unassigned, stacked vertically', () => {
    const sections: BoardSection[] = [
      { id: 'A', name: 'A' },
      { id: 'B', name: 'B' },
    ];
    const items = [mk('u', null), mk('b1', 'B'), mk('a1', 'A')];
    const out = arrangeBoardItems(items, sections, { canvasWidth: 1200 });
    const y = (id: string) => out.find((p) => p.id === id)!.y;
    // Section A band sits above B, and the unassigned item trails last.
    expect(y('a1')).toBeLessThan(y('b1'));
    expect(y('b1')).toBeLessThan(y('u'));
  });

  it('treats an orphaned section_id as unassigned (no matching section)', () => {
    const sections: BoardSection[] = [{ id: 'A', name: 'A' }];
    const items = [mk('a1', 'A'), mk('ghost', 'DELETED')];
    const out = arrangeBoardItems(items, sections, { canvasWidth: 1200 });
    const y = (id: string) => out.find((p) => p.id === id)!.y;
    // The orphan trails after the real section's band.
    expect(y('ghost')).toBeGreaterThan(y('a1'));
  });

  it('tidies only an explicit selection at its supplied bbox origin', () => {
    const items: ArrangeItem[] = [
      { ...mk('outside', null), x: 10, y: 10 },
      { ...mk('late', null), x: 520, y: 320 },
      { ...mk('first', null), x: 280, y: 200 },
      { ...mk('second', null), x: 510, y: 205 },
      { ...mk('third', null), x: 285, y: 330 },
    ];
    const out = arrangeBoardItems(items, [], {
      canvasWidth: 1200,
      itemIds: ['late', 'first', 'second', 'third'],
      origin: { x: 280, y: 200 },
    });

    expect(out.map((position) => position.id)).toEqual(['first', 'second', 'third', 'late']);
    expect(out).toHaveLength(4);
    expect(out.find((position) => position.id === 'outside')).toBeUndefined();
    expect(out[0]).toMatchObject({ x: 280, y: 200 });
  });

  it('uses half the median item height as the visual row tolerance', () => {
    const items: ArrangeItem[] = [
      { ...mk('row-1-right', null), x: 400, y: 100 },
      { ...mk('row-2', null), x: 10, y: 170 },
      { ...mk('row-1-left', null), x: 10, y: 145 },
    ];
    expect(sortItemsInReadingOrder(items).map((item) => item.id)).toEqual([
      'row-1-left',
      'row-1-right',
      'row-2',
    ]);
  });
});

// ─── sectionBounds ───────────────────────────────────────────────────────────

describe('sectionBounds', () => {
  type Positioned = ArrangeItem & { x: number; y: number };
  const mk = (id: string, sectionId: string | null, x: number, y: number): Positioned => ({
    id,
    type: 'product',
    width: 200,
    height: 100,
    x,
    y,
    data: sectionId ? { section_id: sectionId } : {},
  });

  it('returns a padded box around a section members and null when empty', () => {
    const items = [mk('a', 'S', 100, 100), mk('b', 'S', 400, 300), mk('c', null, 0, 0)];
    const box = sectionBounds(items, 'S');
    expect(box).not.toBeNull();
    // minX 100 − sidePad 16 = 84 ; minY 100 − topPad 24 = 76.
    expect(box!.x).toBe(84);
    expect(box!.y).toBe(76);
    // maxX (400+200)=600 +16 − 84 = 532 ; maxY (300+100)=400 +16 − 76 = 340.
    expect(box!.width).toBe(532);
    expect(box!.height).toBe(340);

    expect(sectionBounds(items, 'EMPTY')).toBeNull();
  });

  it('clamps negative origins to zero', () => {
    const box = sectionBounds([mk('a', 'S', 4, 2)], 'S');
    expect(box!.x).toBe(0);
    expect(box!.y).toBe(0);
  });
});
