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
import { FoldSeam } from '../fold-seam';

const GLOBALS_CSS = join(__dirname, '../../../../app/globals.css');

function renderSeam() {
  return render(
    <FoldSeam
      headingId="region-ffe-heading"
      bodyId="region-ffe-body"
      name="Pieces"
      summary="36 lines · 2 unspecified"
      onUnfold={jest.fn()}
      surfaceKey="document"
      regionKey="ffe"
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

  it('still says the word, and still unmounts rather than collapsing', () => {
    renderSeam();
    const seam = screen.getByRole('button');
    expect(seam).toHaveAttribute('aria-expanded', 'false');
    expect(seam).not.toHaveAttribute('aria-controls');
    expect(seam).toHaveTextContent('unfold ↓');
    expect(seam.className).not.toMatch(/grid-rows-\[0fr\]|max-h-/);
  });
});
