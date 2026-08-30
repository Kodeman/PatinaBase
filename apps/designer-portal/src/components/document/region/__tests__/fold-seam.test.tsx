/**
 * R126 — fold motion. The seam still hard-swaps with the region body (fold
 * STATE is untouched); what is new is that the seam settles in on mount and
 * its arrow flips over.
 *
 * C1 — the settle is a CSS keyframe, so the assertions here are about what the
 * FIRST paint carries: a seam that is visible immediately, with no JS-gated
 * opacity and no hydration-window blank band. The reduced-motion gating moved
 * with it, from `motion-safe:` class prefixes to a no-preference media block in
 * globals.css, so that is asserted on the stylesheet.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { FoldSeam, type FoldSeamProps } from '../fold-seam';

const GLOBALS_CSS = join(__dirname, '../../../../app/globals.css');

function renderSeam(props: Partial<FoldSeamProps> = {}) {
  return render(
    <FoldSeam
      headingId="region-ffe-heading"
      bodyId="region-ffe-body"
      name="Pieces"
      summary="36 lines · 2 unspecified"
      onUnfold={jest.fn()}
      surfaceKey="document"
      regionKey="ffe"
      {...props}
    />,
  );
}

describe('FoldSeam', () => {
  it('paints VISIBLE on its first render, and animates from a keyframe', () => {
    // The defect this pins: `opacity-0` until a post-hydration rAF flipped a
    // state flag meant a folded region's only control was a blank 44px band for
    // the whole hydration window — and for good on a hydration error.
    renderSeam();
    const seam = screen.getByRole('button');
    expect(seam).toHaveClass('fold-settle');
    expect(seam.className).not.toMatch(/opacity-0|translate-y/);
    expect(seam).not.toHaveAttribute('data-fold-settled');
  });

  it('flips the toggle arrow over on its own keyframe', () => {
    const { container } = renderSeam();
    const arrow = container.querySelector('[data-fold-arrow]')!;
    expect(arrow).toHaveClass('fold-arrow-settle');
    expect(arrow.className.toString()).not.toMatch(/rotate-180/);
  });

  it('declares both keyframes behind prefers-reduced-motion: no-preference', () => {
    const css = readFileSync(GLOBALS_CSS, 'utf8');
    const block = /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/.exec(
      css,
    );
    expect(block).not.toBeNull();
    expect(block![1]).toContain('.fold-settle');
    expect(block![1]).toContain(
      'animation: fold-in 300ms var(--ease-editorial) both',
    );
    expect(block![1]).toContain('.fold-arrow-settle');
    expect(block![1]).toContain(
      'animation: fold-arrow-flip 300ms var(--ease-editorial) both',
    );
    // `both` is what lets the from-state exist for exactly one frame without
    // ever being the server-rendered state.
    expect(css).toMatch(/@keyframes fold-in \{[\s\S]*?opacity: 0;[\s\S]*?\}/);
  });

  it('is a pure render — no state, so nothing to hydrate and nothing to mismatch', () => {
    const source = readFileSync(join(__dirname, '../fold-seam.tsx'), 'utf8');
    expect(source).not.toMatch(/useState|useEffect|requestAnimationFrame/);
  });

  it('prints CLOSED BY YOU when the fold was a choice — on the summary\u2019s own line', () => {
    // L-7: the seam gains the printed words. It is a second stamp beside the
    // summary, not a second row: the seam is a one-line 44px control and the
    // cause must not cost it a line.
    const { container } = renderSeam({ cause: 'CLOSED BY YOU' });

    const seam = screen.getByRole('button');
    const cause = container.querySelector('[data-fold-cause]')!;
    expect(cause).not.toBeNull();
    expect(cause).toHaveTextContent('CLOSED BY YOU');
    expect(seam).toHaveClass('min-h-11');
    // One cell, three grid children: a fourth column would open an implicit
    // row and the band would grow.
    expect(seam.className).toContain('grid-cols-[auto_1fr_auto]');
    expect(seam.children).toHaveLength(3);
    expect(cause.closest('[data-fold-seam]')).toBe(seam);
    // The summary is still there, and still the thing that truncates.
    expect(seam).toHaveTextContent('36 lines · 2 unspecified');
    expect(container.querySelector('.truncate')).toHaveTextContent(
      '36 lines · 2 unspecified',
    );
  });

  it('prints no cause at all when there was no choice to print', () => {
    // DL-09: a derived-default fold (schedule-rule, money-table, boards) has no
    // cause, so the seam states none — an unexplained fold says nothing rather
    // than claiming the designer shut it.
    for (const props of [{}, { cause: null }] as const) {
      const { container, unmount } = renderSeam(props);
      const seam = screen.getByRole('button');
      expect(container.querySelector('[data-fold-cause]')).toBeNull();
      expect(seam).not.toHaveTextContent('CLOSED BY YOU');
      expect(seam).toHaveClass('min-h-11');
      expect(seam.className).toContain('grid-cols-[auto_1fr_auto]');
      expect(seam.children).toHaveLength(3);
      unmount();
    }
  });

  it('still says the word, and still unmounts rather than collapsing', () => {
    renderSeam();
    const seam = screen.getByRole('button');
    expect(seam).toHaveAttribute('aria-expanded', 'false');
    expect(seam).not.toHaveAttribute('aria-controls');
    expect(seam).toHaveTextContent('unfold ↓');
    expect(seam.className).not.toMatch(/grid-rows-\[0fr\]|max-h-/);
  });
});
