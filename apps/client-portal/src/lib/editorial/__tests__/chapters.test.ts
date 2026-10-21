import { chapterOrder, roomHeadline, roomMaterials } from '../chapters';
import type { EditorialItem, EditorialProject, EditorialRoom } from '../types';

function item(name: string, status: string | null = null): EditorialItem {
  return {
    id: name,
    nameAsSigned: name,
    category: null,
    status,
    material: null,
    finish: null,
    dimensions: null,
    descriptionAsSigned: null,
    assetIds: [],
    silhouetteKind: null,
  };
}

function room(id: string, name: string, items: EditorialItem[]): EditorialRoom {
  return { id, name, anchor: `room-${id}`, conceptAssetId: null, scanAssetIds: [], items };
}

const project: EditorialProject = {
  id: 'p-1',
  name: 'Elm Street House',
  phase: 'procurement',
  targetDate: '2027-01-22',
  showMakers: false,
  studio: { name: 'Birchwood Studio', town: 'Madison' },
};

const rooms = [
  room('living', 'Living room', [item('Walnut sideboard', 'in_production'), item('Oatmeal linen sofa'), item('Wool rug')]),
  room('study', 'Study', [item('Oak desk'), item('Brass task lamp'), item('Lime plaster finish')]),
  room('entry', 'Entry', [item('Coat hooks')]),
];

describe('chapters', () => {
  it('keeps the PLAN order with every existing anchor, rooms between the house and progress', () => {
    const chapters = chapterOrder(project, rooms);
    expect(chapters.map((c) => [c.number, c.key, c.anchor])).toEqual([
      ['01', 'cover', null],
      ['02', 'invoices', 'doorstep'],
      ['03', 'approvals', 'approvals'],
      ['04', 'house', 'key'],
      ['05', 'room', 'room-living'],
      ['06', 'room', 'room-study'],
      ['07', 'room', 'room-entry'],
      ['08', 'progress', 'road'],
      ['09', 'updates', 'note'],
      ['10', 'earlier', 'previously'],
      ['11', 'documents', 'mat'],
    ]);
  });

  it('writes the cover eyebrow from the house and its phase, and room eyebrows from room names', () => {
    const chapters = chapterOrder(project, rooms);
    expect(chapters[0].eyebrow).toBe('01 · Elm Street House · Procurement');
    expect(chapters[4]).toMatchObject({ eyebrow: '05 · Living room', label: 'Living room', roomId: 'living' });
  });

  it('heads the cover with the room that is on its way', () => {
    expect(chapterOrder(project, rooms)[0].headline).toBe('The living room is on its way');
    expect(chapterOrder({ ...project, phase: 'concept_development' }, rooms)[0].headline).toBe('The rooms, as drawn');
  });

  it('says how many rooms in words, never as a figure', () => {
    expect(chapterOrder(project, rooms)[3].headline).toBe('Three rooms, read from the front door');
    expect(chapterOrder(project, rooms.slice(0, 1))[3].headline).toBe('One room, read from the front door');
  });

  it('heads a room with only the material words in its item names, at most three', () => {
    expect(roomMaterials(rooms[0])).toEqual(['walnut', 'linen', 'wool']);
    expect(roomHeadline(rooms[0])).toBe('Walnut, linen and wool');
    expect(roomHeadline(rooms[1])).toBe('Oak, brass and plaster');
    expect(roomHeadline(room('x', 'Den', [item('Bouclé chair')]))).toBe('Bouclé');
  });

  it('falls back to the room name when no item names a material', () => {
    expect(roomHeadline(rooms[2])).toBe('Entry');
  });

  it('is deterministic', () => {
    expect(chapterOrder(project, rooms)).toEqual(chapterOrder(project, rooms));
  });

  it('keeps every headline within eight words', () => {
    for (const c of chapterOrder(project, rooms)) {
      expect(c.headline.split(/\s+/).length).toBeLessThanOrEqual(8);
    }
  });
});
