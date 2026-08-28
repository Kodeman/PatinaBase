/**
 * R126 — fold motion. The seam still hard-swaps with the region body (fold
 * STATE is untouched); what is new is that the seam settles in on mount and
 * its arrow flips over, and that every one of those classes is motion-safe
 * gated so reduced motion gets a still seam.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { FoldSeam } from '../fold-seam';

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
  it('carries the FROM state on its first paint, then settles', async () => {
    renderSeam();
    const seam = screen.getByRole('button');
    expect(seam).toHaveAttribute('data-fold-settled', 'false');
    expect(seam).toHaveClass(
      'motion-safe:-translate-y-[4px]',
      'motion-safe:opacity-0',
      'motion-safe:transition-[opacity,transform]',
      'motion-safe:duration-300',
      'motion-safe:ease-[var(--ease-editorial)]',
    );

    await waitFor(() =>
      expect(seam).toHaveAttribute('data-fold-settled', 'true'),
    );
    expect(seam).not.toHaveClass('motion-safe:opacity-0');
    expect(seam).not.toHaveClass('motion-safe:-translate-y-[4px]');
    // The transition itself stays on: the seam is animating, not jumping.
    expect(seam).toHaveClass('motion-safe:transition-[opacity,transform]');
  });

  it('flips the toggle arrow over as it settles', async () => {
    const { container } = renderSeam();
    const arrow = container.querySelector('[data-fold-arrow]')!;
    expect(arrow).toHaveClass(
      'motion-safe:rotate-180',
      'motion-safe:transition-transform',
      'motion-safe:duration-300',
    );
    await waitFor(() => expect(arrow).not.toHaveClass('motion-safe:rotate-180'));
  });

  it('gates every motion class behind motion-safe', async () => {
    const { container } = renderSeam();
    await act(async () => {});
    container.querySelectorAll('*').forEach((el) => {
      el.className
        .toString()
        .split(' ')
        .filter((c) => /transition|duration|ease-\[|translate-y|rotate|opacity-0/.test(c))
        .forEach((c) => expect(c.startsWith('motion-safe:')).toBe(true));
    });
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
