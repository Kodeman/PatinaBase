import { render, screen } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';

import { plateCaption, TrackingRow, type TrackingRowProps } from '../tracking-row';

/* PP-4 — the plate, the silhouette, the caption, and the stage word printed
   ONCE. The row's older behaviours (the six stops, the price, the dead-image
   fallback) are asserted in `open-chapter.test.tsx`, which owns this
   component's first suite. */

const CREDENZA: TrackingRowProps = {
  name: 'Walnut credenza',
  imageUrl: null,
  priceCents: 840_000,
  status: 'production' as FFEStageKey,
};

function row(over: Partial<TrackingRowProps> = {}) {
  return render(<TrackingRow {...CREDENZA} {...over} />);
}

describe('the plate', () => {
  it('takes 96px on a wide page when the piece is worth $2,000 or more', () => {
    row({ priceCents: 200_000 });
    const plate = screen.getByTestId('tracking-row-plate');
    expect(plate).toHaveAttribute('data-plate', '96');
    // 64px below 960px — and below 600px, which is below 960px.
    expect(plate.className).toContain('h-16 w-16');
    expect(plate.className).toContain('min-[960px]:h-24');
  });

  it('stays at 64px at every width for a piece under the threshold', () => {
    row({ priceCents: 199_999 });
    const plate = screen.getByTestId('tracking-row-plate');
    expect(plate).toHaveAttribute('data-plate', '64');
    expect(plate.className).not.toContain('min-[960px]:h-24');
  });

  it('stays at 64px for a line that carries no price at all', () => {
    row({ priceCents: null });
    expect(screen.getByTestId('tracking-row-plate')).toHaveAttribute('data-plate', '64');
  });

  // §A1's own stroke token (#E8E3DB), not the portal's --border-default
  // (#E5E2DD), and never --rail — §A10 keeps that for fills.
  it('strokes the plate in the sheet’s hairline', () => {
    row({ priceCents: 200_000 });
    const plate = screen.getByTestId('tracking-row-plate');
    expect(plate.className).toContain('border-[var(--hairline)]');
    expect(plate.className).not.toContain('border-[var(--border-default)]');
  });
});

describe('the silhouette in place of a photograph', () => {
  it('draws the piece rather than a hash block when there is no image', () => {
    const { container } = row({ name: 'Reading chair, oiled oak' });

    expect(screen.getByTestId('piece-silhouette')).toHaveAttribute(
      'data-silhouette',
      'chair',
    );
    expect(container.querySelector('[data-testid="tracking-row-thumb"]')).toBeNull();
  });

  it('reads the category off the name and the loose itemType together', () => {
    row({ name: 'No. 14', itemType: 'lighting' });
    expect(screen.getByTestId('piece-silhouette')).toHaveAttribute(
      'data-silhouette',
      'light',
    );
  });

  it('draws no silhouette when the piece has a photograph of its own', () => {
    row({ imageUrl: 'https://cdn.patina.test/credenza.jpg' });
    expect(screen.queryByTestId('piece-silhouette')).not.toBeInTheDocument();
    expect(screen.getByTestId('tracking-row-thumb')).toBeInTheDocument();
  });
});

describe('the caption under every plate', () => {
  it('says the drawing is a drawing, and whose', () => {
    row({ studioName: 'Quist Interiors' });
    expect(screen.getByTestId('tracking-row-caption')).toHaveTextContent(
      'Walnut credenza · drawing by Quist Interiors',
    );
  });

  it('adds the maker clause only where a maker is named', () => {
    expect(
      plateCaption({ name: 'Reading chair', drawn: true, studioName: 'Quist Interiors' }),
    ).toBe('Reading chair · drawing by Quist Interiors');

    expect(
      plateCaption({
        name: 'Reading chair',
        drawn: true,
        studioName: 'Quist Interiors',
        maker: 'Harmon Bench Works',
      }),
    ).toBe(
      'Reading chair · drawing by Quist Interiors · photograph from Harmon Bench Works to follow',
    );
  });

  it('still says what the plate is when no studio is named', () => {
    expect(plateCaption({ name: 'Reading chair', drawn: true })).toBe(
      'Reading chair · drawing',
    );
  });

  it('captions a photograph as a photograph', () => {
    row({ imageUrl: 'https://cdn.patina.test/credenza.jpg', maker: 'Harmon Bench Works' });
    expect(screen.getByTestId('tracking-row-caption')).toHaveTextContent(
      'Walnut credenza · photograph from Harmon Bench Works',
    );
  });

  it('takes the meta step, never a size of its own', () => {
    row();
    expect(screen.getByTestId('tracking-row-caption').className).toContain('t-meta');
  });
});

describe('the stage word', () => {
  it('prints exactly once on the row', () => {
    row();
    // The stamp carries the word; the spine announces it to a screen reader
    // and draws nothing but dots. The 9px duplicate at the end of the rule is
    // gone (PP-4).
    expect(screen.getAllByText('In production')).toHaveLength(1);
    expect(screen.getByTestId('tracking-row-stamp')).toHaveTextContent('In production');
    expect(screen.queryByTestId('tracking-row-stop-label')).not.toBeInTheDocument();
  });

  it('sets the stamp at the 11px register, not 9px', () => {
    row();
    const word = screen.getByTestId('tracking-row-stamp').querySelector('span.relative');
    expect(word?.className).toContain('text-[11px]');
  });

  it('keeps the stamp decorative and the spine sentence the only reading', () => {
    row();
    expect(screen.getByTestId('tracking-row-stamp')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('In production — stop 3 of 6')).toBeInTheDocument();
  });
});
