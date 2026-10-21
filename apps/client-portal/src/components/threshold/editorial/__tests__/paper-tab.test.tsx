import { render, screen } from '@testing-library/react';

import { PaperTab, TAB_ZONE, focalInCrop, paperTabMode } from '../paper-tab';

describe('paperTabMode', () => {
  it('cuts the tab into a plate whose edge reads against the paper', () => {
    expect(paperTabMode({ dominantHex: '#8C7356' })).toBe('notch');
  });

  it('adds the hairline where the plate would melt into the paper', () => {
    expect(paperTabMode({ dominantHex: '#F2EEE6' })).toBe('hairline');
  });

  it('sets the tab below when caption ink would fall under 4.5:1 on its ground', () => {
    expect(paperTabMode({ dominantHex: '#8C7356', paperHex: '#8C7356' })).toBe('below');
    expect(paperTabMode({ dominantHex: '#8C7356', inkHex: '#B8ADA0' })).toBe('below');
  });

  it('sets the tab below at 200 percent zoom, by visual viewport scale', () => {
    expect(paperTabMode({ dominantHex: '#8C7356', zoomScale: 2 })).toBe('below');
    expect(paperTabMode({ dominantHex: '#8C7356', zoomScale: 1.5 })).toBe('notch');
  });

  it('sets the tab below in a container narrower than 320', () => {
    expect(paperTabMode({ dominantHex: '#8C7356', containerWidth: 288 })).toBe('below');
    expect(paperTabMode({ dominantHex: '#8C7356', containerWidth: 358 })).toBe('notch');
  });

  it('sets the tab below when it would cover the focal point', () => {
    expect(paperTabMode({ dominantHex: '#8C7356', focal: [0.3, 0.95] })).toBe('below');
    expect(paperTabMode({ dominantHex: '#8C7356', focal: [0.3, TAB_ZONE.y - 0.1] })).toBe('notch');
    expect(paperTabMode({ dominantHex: '#8C7356', focal: [0.9, 0.95] })).toBe('notch');
  });

  it('moves the focal point into the phone crop before testing the zone', () => {
    expect(
      focalInCrop({ focal: [0.5, 0.5], width: 4000, height: 3000, crops: { cover_phone: { rect: [0.25, 0, 0.5, 1], widths: [] } } }),
    ).toEqual([0.5, 0.5]);
    const moved = focalInCrop({
      focal: [0.3, 0.9],
      width: 4000,
      height: 3000,
      crops: { cover_phone: { rect: [1000, 0, 2000, 3000], widths: [] } },
    })!;
    expect(moved[0]).toBeCloseTo(0.1, 6);
    expect(moved[1]).toBeCloseTo(0.9, 6);
    expect(focalInCrop({ focal: null, width: 1, height: 1, crops: {} })).toBeNull();
  });
});

describe('PaperTab', () => {
  it('carries the eyebrow and the cover headline in its mode', () => {
    const { container } = render(<PaperTab mode="below" eyebrow="01 · Elm Street House · Procurement" headline="The living room is on its way" headingId="cover-h" />);
    expect(container.firstChild).toHaveAttribute('data-tab-mode', 'below');
    expect(screen.getByRole('heading', { level: 2, name: 'The living room is on its way' })).toHaveAttribute('id', 'cover-h');
    expect(screen.getByText('01 · Elm Street House · Procurement')).toHaveClass('ed-eyebrow');
  });
});
