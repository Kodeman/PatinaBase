import { render, screen } from '@testing-library/react';

import {
  PieceSilhouette,
  silhouetteCategory,
  type SilhouetteCategory,
} from '../piece-silhouette';

/* R142 — a piece with no photograph is DRAWN. Never a hash block, never a
   blank fill, never the browser's broken-image glyph. */

describe('silhouetteCategory', () => {
  it.each([
    ['Brass library sconces', null, 'light'],
    ['Reading lamp', null, 'light'],
    ['Kilim runner', null, 'textile'],
    ['Wool rug, hand-knotted', null, 'textile'],
    ['Reading chair, oiled oak', null, 'chair'],
    ['Walnut bench', null, 'chair'],
    ['Dining table, ash', null, 'table'],
    ['Entry console', null, 'table'],
    ['Built-in shelving, north wall', null, 'case'],
    ['Walnut credenza', null, 'case'],
  ])('reads %s as a %s', (name, itemType, expected) => {
    expect(silhouetteCategory(name, itemType)).toBe(expected);
  });

  it('reads the loose itemType word when the name says nothing', () => {
    expect(silhouetteCategory('No. 14', 'lighting')).toBe('light');
  });

  it('falls to the most neutral of the five rather than guessing a shape', () => {
    expect(silhouetteCategory('No. 14', null)).toBe('case');
    expect(silhouetteCategory('No. 14', 'product')).toBe('case');
  });
});

describe('PieceSilhouette', () => {
  const CATEGORIES: SilhouetteCategory[] = ['chair', 'table', 'case', 'light', 'textile'];

  it.each(CATEGORIES)('draws the %s in line work with one detail and one hatch', (category) => {
    const { container } = render(<PieceSilhouette category={category} name="Reading chair" />);

    const svg = screen.getByTestId('piece-silhouette');
    expect(svg).toHaveAttribute('data-silhouette', category);
    expect(svg).toHaveAttribute('viewBox', '0 0 96 96');
    expect(svg).toHaveAccessibleName('A drawing of Reading chair');

    // Line work only: no fill anywhere, and the ink is the sheet's drawing ink.
    expect(svg.getAttribute('style')).toContain('fill: none');
    expect(svg.getAttribute('style')).toContain('stroke: var(--ink-faint)');

    expect(screen.getByTestId('piece-silhouette-detail')).toBeInTheDocument();
    // The secondary hatch is the one stroke allowed to drop to half opacity.
    expect(screen.getByTestId('piece-silhouette-hatch')).toHaveAttribute(
      'stroke-opacity',
      '0.5',
    );
    expect(container.querySelectorAll('image')).toHaveLength(0);
    expect(container.innerHTML).not.toContain('url(#');
    expect(container.innerHTML).not.toContain('Gradient');
  });

  it('stands on a floor line so the outline reads as a thing in a room', () => {
    const { container } = render(<PieceSilhouette category="chair" name="Reading chair" />);
    expect(container.querySelectorAll('line')).toHaveLength(1);
  });
});
