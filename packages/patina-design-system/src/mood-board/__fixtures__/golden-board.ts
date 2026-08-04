import type { MoodBoardSnapshot } from '@patina/types'

/**
 * One deliberately awkward board shared by geometry, DOM and painter tests.
 * It covers explicit, measured and fallback heights; rotation; sections;
 * optional snapshot ids; every supported pin family; and both image identities.
 */
export const MOOD_BOARD_GOLDEN_FIXTURE: MoodBoardSnapshot = {
  id: 'board-golden',
  name: 'Golden Living Room',
  canvasWidth: 1200,
  canvasHeight: 800,
  backgroundColor: '#faf8f5',
  sections: [
    { id: 'living', name: 'Living', color: '#a66d4f' },
    { id: 'materials', name: 'Materials', color: '#718573' },
    { id: 'empty', name: 'Empty section', color: '#999999' },
  ],
  items: [
    {
      id: 'chair',
      type: 'product',
      x: 40,
      y: 80,
      width: 240,
      height: 276,
      zIndex: 2,
      imageUrl: 'https://images.example/chair.jpg',
      data: {
        section_id: 'living',
        name: 'Halyard chair',
        vendor_name: 'Patina Workshop',
        price_cents: 120000,
      },
    },
    {
      // Frozen activation snapshots can omit ids; the geometry key remains stable.
      type: 'image',
      x: 320,
      y: 100,
      width: 250,
      height: null,
      zIndex: 1,
      rotation: 30,
      imageUrl: 'https://images.example/room.jpg',
      imageKey: 'cache/room-v2',
      data: {
        section_id: 'living',
        resolved_height: 180,
        name: 'Room reference',
      },
    },
    {
      id: 'note',
      type: 'note',
      x: 680,
      y: 100,
      width: 200,
      height: null,
      zIndex: 4,
      rotation: -10,
      content: 'Quiet, collected, and warm.',
      data: {},
    },
    {
      id: 'palette',
      type: 'palette',
      x: 80,
      y: 500,
      width: 400,
      height: 96,
      zIndex: 0,
      data: {
        section_id: 'materials',
        name: 'Clay and moss',
        swatches: [
          { hex: '#b56f52', name: 'Clay' },
          { hex: '#718573', name: 'Moss' },
          { hex: '#e7ded0', name: 'Plaster' },
        ],
      },
    },
    {
      id: 'scan',
      type: 'room_scan',
      x: 520,
      y: 480,
      width: 300,
      height: null,
      zIndex: 3,
      imageUrl: 'https://images.example/scan.jpg',
      data: { section_id: 'materials', name: 'Existing room' },
    },
    {
      id: 'sofa',
      type: 'capture',
      x: 900,
      y: 460,
      width: 220,
      height: null,
      zIndex: 5,
      imageUrl: 'https://images.example/sofa.jpg',
      data: { name: 'Linen sofa', source_url: 'https://maker.example/sofa' },
    },
  ],
}

/** Version-pinned projection. Update intentionally with geometry version bumps. */
export const MOOD_BOARD_GOLDEN_GEOMETRY = {
  version: 1,
  itemOrder: ['palette', 'snapshot:1', 'chair', 'scan', 'note', 'sofa'],
  heights: {
    chair: 276,
    'snapshot:1': 180,
    note: 230,
    palette: 96,
    scan: 216,
    sofa: 253,
  },
  sectionIds: ['living', 'materials'],
} as const
