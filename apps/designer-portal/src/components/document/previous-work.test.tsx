import { act, fireEvent, render, screen } from '@testing-library/react';
import { PreviousWork } from './previous-work';
import { __setDensityForTest } from '@/hooks/use-lens-density';
import { regionBoxSignature } from './region/region-box-signature';

// W4 — the lens is a page-level observer; in jsdom it never runs, so the store
// is mocked per suite. `'full'` is the reading these W2/W3 claims were written
// against (the reader is AT the record); the quiet cases below drive `null`,
// which is the lens being silent — the state every unpromoted stop starts in.
// W4-C9 — the real `useLensDensityStore` runs here, driven through the store's
// own test setter. A `jest.mock` of the module replaced a two-slot hook with a
// zero-slot arrow, so a conditional call could never be detected from this
// suite; C-8 asks for exactly that guard.

describe('PreviousWork', () => {
  beforeEach(() => {
    act(() => {
      __setDensityForTest('full');
    });
  });

  it('is closed by default and exposes an accessible disclosure', () => {
    render(<PreviousWork count={3}><div>Brief recap</div></PreviousWork>);
    const button = screen.getByRole('button', { name: 'Open the record' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // An `aria-expanded` with nothing named is a state with no subject.
    expect(
      document.getElementById(button.getAttribute('aria-controls')!),
    ).toBeInTheDocument();
    expect(screen.getByText('The record')).toBeInTheDocument();
    expect(screen.getByText('3 complete')).toBeInTheDocument();
    expect(screen.queryByText('Brief recap')).not.toBeInTheDocument();
    fireEvent.click(button);
    const folded = screen.getByRole('button', { name: 'Fold ↑' });
    expect(folded).toHaveAttribute('aria-expanded', 'true');
    expect(
      document.getElementById(folded.getAttribute('aria-controls')!),
    ).toBeVisible();
    expect(screen.getByText('Brief recap')).toBeInTheDocument();
  });

  it('leaves the line alone when no approval is awaiting publish', () => {
    render(
      <PreviousWork count={3} approvalsAwaitingPublish={0} onOpenApprovals={jest.fn()}>
        <div>Brief recap</div>
      </PreviousWork>,
    );
    expect(screen.getByText('3 complete')).toBeInTheDocument();
    expect(screen.queryByText(/Client approvals/)).not.toBeInTheDocument();
  });

  it('says nothing about approvals until the read has answered', () => {
    render(
      <PreviousWork count={3} approvalsAwaitingPublish={null} onOpenApprovals={jest.fn()}>
        <div>Brief recap</div>
      </PreviousWork>,
    );
    expect(screen.queryByText(/Client approvals/)).not.toBeInTheDocument();
  });

  it('carries the drafted approvals as a door, not as content of the disclosure', () => {
    const openApprovals = jest.fn();
    render(
      <PreviousWork count={4} approvalsAwaitingPublish={1} onOpenApprovals={openApprovals}>
        <div>Brief recap</div>
      </PreviousWork>,
    );

    // The disclosure toggle promises only what its body holds.
    const disclosure = screen.getByRole('button', { name: 'Open the record' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    const door = screen.getByRole('button', {
      name: 'Client approvals · 1 awaiting publish →',
    });
    fireEvent.click(door);
    expect(openApprovals).toHaveBeenCalledTimes(1);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  });

  // W2 (C-2) — `record` root must ALWAYS be emitted, empty body when
  // `count === 0` (this used to return null).
  describe('the record root (W2 C-2)', () => {
    it('always emits the region root, even with nothing settled', () => {
      const { container } = render(<PreviousWork count={0}>{null}</PreviousWork>);

      const root = container.querySelector('[data-index-region="record"]');
      expect(root).not.toBeNull();
      expect(root).toHaveAttribute('aria-label', 'The record');
      // W3-L4 — one region-spacing token, owned by the root, no mb-*.
      expect(root).toHaveClass('mt-[var(--doc-region-gap)]');
      expect(
      root!.className.split(/\s+/).filter((cls) => /^mt-/.test(cls)),
    ).toEqual(['mt-[var(--doc-region-gap)]']);
      expect(root!.className).not.toMatch(/\bmb-/);
    });

    it('does not trip the RegionHead no-acts dev guard at count 0 — a ratified state, not an oversight', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(<PreviousWork count={0}>{null}</PreviousWork>);

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('prints the empty status line and is not a press target at count 0', () => {
      render(<PreviousWork count={0}>{null}</PreviousWork>);

      expect(screen.getByText('The record')).toBeInTheDocument();
      // Reconciliation §"Quiet regions" ratifies `Nothing yet` for the empty
      // read; F-07 caught the paraphrase.
      expect(screen.getByText('Nothing yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /open the record/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /fold/i })).not.toBeInTheDocument();
    });

    it('marks the root and prints the count line with N settled bars', () => {
      const { container } = render(
        <PreviousWork count={2}>
          <div>Brief recap</div>
        </PreviousWork>,
      );

      const root = container.querySelector('[data-index-region="record"]');
      expect(root).not.toBeNull();
      expect(root).toHaveAttribute('aria-label', 'The record');
      expect(screen.getByText('2 complete')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open the record' })).toBeInTheDocument();
    });
  });

  // W4 (L-4, OD-12, OD-13) — the quiet body: the same head, one count line, one
  // leader that presses the region open, and the sr-only state line. The cards
  // are not on the paper until the lens reaches this root.
  describe('the quiet body (W4)', () => {
    const renderQuiet = (count = 2) => {
      act(() => {
        __setDensityForTest(null);
      });
      return render(
        <PreviousWork count={count}>
          <div>Brief recap</div>
        </PreviousWork>,
      );
    };

    it('prints head, count line, leader and the sr-only state line — and no cards', () => {
      const { container } = renderQuiet();

      const root = container.querySelector('[data-index-region="record"]');
      expect(root).toHaveAttribute('data-density', 'quiet');
      expect(root).toHaveStyle({
        '--doc-quiet-reserve': 'var(--doc-quiet-reserve-min)',
      });

      expect(screen.getByRole('heading', { name: 'The record' })).toBeInTheDocument();
      // W4-R1: the count line IS the head's status line, at either density.
      const head = container.querySelector('[data-region-head="record"]')!;
      expect(head).toHaveTextContent('2 complete');
      expect(
        container.querySelectorAll('[data-region-count-line]'),
      ).toHaveLength(0);
      // The quiet body grows NO act of its own: the mockup's condensed head
      // prints the head's own leader and nothing beside it, so a second inked
      // word would put two leaders on one region.
      expect(
        container.querySelectorAll('[data-action-variant="inked"]'),
      ).toHaveLength(1);
      expect(
        screen.getByText(
          '2 complete · not yet on the paper · press The record on the index to open',
        ),
      ).toHaveClass('sr-only');

      // The disclosure's own CONTENT is not on the paper at all while quiet —
      // but the wrapper carrying its id is (W4-C7): both the head's Fold
      // button and the `toggle-record` act name it through `aria-controls`,
      // and the record is the last stop, so a dangling reference would be the
      // state on every load until the reader reached the foot.
      expect(screen.queryByText('Brief recap')).not.toBeInTheDocument();
      const quietBody = container.querySelector('div[id^="previous-work-"]');
      expect(quietBody).not.toBeNull();
      expect(quietBody).toContainElement(
        screen.getByText(/not yet on the paper/),
      );
    });

    it('leaves no aria-controls pointing at nothing while quiet (W4-C7)', () => {
      const { container } = renderQuiet();

      const referring = Array.from(
        container.querySelectorAll<HTMLElement>('[aria-controls]'),
      );
      expect(referring.length).toBeGreaterThan(0);
      for (const el of referring) {
        for (const id of el.getAttribute('aria-controls')!.split(/\s+/)) {
          expect(document.getElementById(id)).not.toBeNull();
        }
      }
    });

    it('keeps the SAME head element across quiet → full', () => {
      act(() => {
        __setDensityForTest(null);
      });
      const { container, rerender } = render(
        <PreviousWork count={2}>
          <div>Brief recap</div>
        </PreviousWork>,
      );
      const quietHead = container.querySelector('[data-region-head="record"]');
      // H5 — the root's OUTER box may not depend on its density.
      const quietBox = regionBoxSignature(
        container.querySelector('[data-index-region="record"]'),
      );
      const quietHeading = document.getElementById('previous-work-heading');
      expect(quietHead).not.toBeNull();

      act(() => {
        __setDensityForTest('full');
      });
      rerender(
        <PreviousWork count={2}>
          <div>Brief recap</div>
        </PreviousWork>,
      );

      expect(container.querySelector('[data-region-head="record"]')).toBe(quietHead);
      expect(document.getElementById('previous-work-heading')).toBe(quietHeading);
      expect(screen.queryByText('2 COMPLETE')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Quiet — opens as you read'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('2 complete')).toBeInTheDocument();
      // The same outer box on the other side of the promotion: same
      // margins, same border, same reserve, same rules. A stop that grew a
      // top margin on promotion would move every root below it.
      expect(
        regionBoxSignature(
          container.querySelector('[data-index-region="record"]'),
        ),
      ).toBe(quietBox);
    });

    it('prints the same Nothing yet head at count 0, quiet or full, and is never a press target', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      act(() => {
        __setDensityForTest(null);
      });
      const { container, rerender } = render(<PreviousWork count={0}>{null}</PreviousWork>);

      // W4-C16: a root whose printed form cannot change with the lens must not
      // claim a density it does not hold. A zero-record paper prints exactly
      // its `Nothing yet` head at either density, so it states `full`.
      expect(container.querySelector('[data-index-region="record"]')).toHaveAttribute(
        'data-density',
        'full',
      );
      expect(screen.getByText('Nothing yet')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByText('Quiet — opens as you read')).not.toBeInTheDocument();

      act(() => {
        __setDensityForTest('full');
      });
      rerender(<PreviousWork count={0}>{null}</PreviousWork>);

      expect(screen.getByText('Nothing yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();
      // `allowNoActs` still stands the guard down in both densities.
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
