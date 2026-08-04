import { replacePaletteSwatch } from './board-palette-inspector-actions';

describe('replacePaletteSwatch', () => {
  it('preserves unrelated item data and updates one swatch immutably', () => {
    const item = {
      id: 'palette-1',
      type: 'palette' as const,
      x: 0,
      y: 0,
      width: 200,
      data: {
        name: 'Earth',
        section_id: 'section-1',
        swatches: [
          { hex: '#112233', name: 'Ink' },
          { hex: '#aabbcc', name: 'Mist' },
        ],
      },
    };

    expect(replacePaletteSwatch(item, 1, { hex: '#ffffff' })).toEqual({
      name: 'Earth',
      section_id: 'section-1',
      swatches: [
        { hex: '#112233', name: 'Ink' },
        { hex: '#ffffff', name: 'Mist' },
      ],
    });
    expect(item.data.swatches[1].hex).toBe('#aabbcc');
  });
});
