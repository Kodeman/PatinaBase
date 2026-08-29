import { fireEvent, render, screen } from '@testing-library/react';
import { PreviousWork } from './previous-work';

// W4 — the lens is a page-level observer; in jsdom it never runs, so the store
// is mocked per suite. `'full'` is the reading these W2/W3 claims were written
// against (the reader is AT the record); the quiet cases below drive `null`,
// which is the lens being silent — the state every unpromoted stop starts in.
const mockLensDensity = jest.fn<'full' | null, [string]>(() => 'full');
jest.mock('@/hooks/use-lens-density', () => ({
  useLensDensityStore: (region: string) => mockLensDensity(region),
}));

describe('PreviousWork', () => {
  beforeEach(() => {
    mockLensDensity.mockReset();
    mockLensDensity.mockReturnValue('full');
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
      mockLensDensity.mockReturnValue(null);
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
      expect(screen.getByText('2 COMPLETE')).toBeInTheDocument();
      expect(screen.getByText('2 COMPLETE').textContent!.length).toBeLessThanOrEqual(40);
      // The quiet body grows NO act of its own: the mockup's condensed head
      // prints the head's own leader and nothing beside it, so a second inked
      // word would put two leaders on one region.
      expect(
        container.querySelectorAll('[data-action-variant="inked"]'),
      ).toHaveLength(1);
      expect(screen.getByText('Quiet — opens as you read')).toHaveClass('sr-only');

      // The disclosure's own body is not on the paper at all while quiet.
      expect(screen.queryByText('Brief recap')).not.toBeInTheDocument();
      expect(container.querySelector('div[id^="previous-work-"]')).toBeNull();
    });

    it('keeps the SAME head element across quiet → full', () => {
      mockLensDensity.mockReturnValue(null);
      const { container, rerender } = render(
        <PreviousWork count={2}>
          <div>Brief recap</div>
        </PreviousWork>,
      );
      const quietHead = container.querySelector('[data-region-head="record"]');
      const quietHeading = document.getElementById('previous-work-heading');
      expect(quietHead).not.toBeNull();

      mockLensDensity.mockReturnValue('full');
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
    });

    it('prints the same Nothing yet head at count 0, quiet or full, and is never a press target', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockLensDensity.mockReturnValue(null);
      const { container, rerender } = render(<PreviousWork count={0}>{null}</PreviousWork>);

      expect(container.querySelector('[data-index-region="record"]')).toHaveAttribute(
        'data-density',
        'quiet',
      );
      expect(screen.getByText('Nothing yet')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByText('Quiet — opens as you read')).not.toBeInTheDocument();

      mockLensDensity.mockReturnValue('full');
      rerender(<PreviousWork count={0}>{null}</PreviousWork>);

      expect(screen.getByText('Nothing yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();
      // `allowNoActs` still stands the guard down in both densities.
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
