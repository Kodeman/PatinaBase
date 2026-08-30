/**
 * The pre-work stop's root, at BOTH densities.
 *
 * W5-C1/F1: the quiet branch shipped a second uppercase count paragraph and the
 * stock `Quiet — opens as you read` string — the two forms W4-R1 deleted from
 * the six project stops by name. Nothing caught it because under jsdom every
 * `getBoundingClientRect()` is zero, so the density hook's layout-effect first
 * pass promotes every root on mount and `useLensDensityStore` answers `'full'`
 * for all of them: the quiet branch is simply never rendered by a test that
 * does not force it. These cases drive the real store through
 * `__setDensityForTest` so the branch under review is the branch that runs.
 */

import { act, render, screen } from '@testing-library/react';
import { __setDensityForTest } from '@/hooks/use-lens-density';
import { regionBoxSignature } from '../region/region-box-signature';
import { PreworkRegion } from './prework-region';

afterEach(() => {
  act(() => {
    __setDensityForTest(undefined);
  });
});

function renderAt(
  density: 'full' | null,
  props: Partial<React.ComponentProps<typeof PreworkRegion>> = {},
) {
  act(() => {
    __setDensityForTest(density);
  });
  return render(
    <PreworkRegion region="scope" status="4 rooms in scope" {...props}>
      <p>the scope body</p>
    </PreworkRegion>,
  );
}

describe('PreworkRegion', () => {
  describe('quiet (the lens has not reached this stop)', () => {
    it('prints the head, its own status line and ONE sr-only sentence — and no body', () => {
      const { container } = renderAt(null);

      expect(
        container.querySelector('[data-index-region="scope"]'),
      ).toHaveAttribute('data-density', 'quiet');
      expect(
        screen.getByRole('heading', { name: 'Scope & engagement' }),
      ).toBeInTheDocument();

      // W4-R1: the count line IS the head's status line. One printing.
      const head = container.querySelector('[data-region-head="scope"]')!;
      expect(head).toHaveTextContent('4 rooms in scope');
      expect(
        container.querySelectorAll('[data-region-count-line]'),
      ).toHaveLength(0);
      expect(container.textContent).not.toContain('4 ROOMS IN SCOPE');

      // The ruled sr-only sentence, not the stock string W4-R1 deleted.
      expect(
        screen.queryByText('Quiet — opens as you read'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          '4 rooms in scope · not yet on the paper · press Scope & engagement on the index to open',
        ),
      ).toHaveClass('sr-only');

      expect(screen.queryByText('the scope body')).not.toBeInTheDocument();
    });

    it('says the phrase alone when the stop carries no fact — no press target', () => {
      renderAt(null, { status: 'Nothing yet' });

      expect(
        screen.getByText('Nothing yet', { selector: '.sr-only' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/not yet on the paper/)).not.toBeInTheDocument();
    });

    it('takes the short reserve on its root (OD-12)', () => {
      const { container } = renderAt(null);
      const root = container.querySelector<HTMLElement>(
        '[data-index-region="scope"]',
      );
      expect(root!.style.getPropertyValue('--doc-quiet-reserve')).toBe(
        'var(--doc-quiet-reserve-min)',
      );
    });
  });

  describe('full (the lens has reached it)', () => {
    it('prints the body, keeps the one status line, and adds no sr-only sentence', () => {
      const { container } = renderAt('full');

      expect(
        container.querySelector('[data-index-region="scope"]'),
      ).toHaveAttribute('data-density', 'full');
      expect(screen.getByText('the scope body')).toBeInTheDocument();
      expect(
        container.querySelectorAll('[data-region-count-line]'),
      ).toHaveLength(0);
      expect(screen.queryByText(/not yet on the paper/)).not.toBeInTheDocument();
    });
  });

  it('keeps the SAME head element and the SAME outer box across quiet → full', () => {
    const { container, rerender } = renderAt(null);
    const quietHead = container.querySelector('[data-region-head="scope"]');
    // H5 — the root's OUTER box may not depend on its density.
    const quietBox = regionBoxSignature(
      container.querySelector('[data-index-region="scope"]'),
    );
    expect(quietHead).not.toBeNull();

    act(() => {
      __setDensityForTest('full');
    });
    rerender(
      <PreworkRegion region="scope" status="4 rooms in scope">
        <p>the scope body</p>
      </PreworkRegion>,
    );

    expect(container.querySelector('[data-region-head="scope"]')).toBe(
      quietHead,
    );
    expect(
      regionBoxSignature(container.querySelector('[data-index-region="scope"]')),
    ).toBe(quietBox);
  });

  it('prints the eyebrow above the name when the spread supplies one', () => {
    renderAt(null, { eyebrow: 'v3 · saved Aug 12' });
    expect(screen.getByText('v3 · saved Aug 12')).toBeInTheDocument();
  });
});
