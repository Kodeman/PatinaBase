import { act, render } from '@testing-library/react';

/* ── The route hop ──────────────────────────────────────────────────────────
   A client on one of the nine old destinations should land on the matching
   anchor of the house, not the old standalone route. There is no flag left to
   wait on: the only thing that decides where the hop lands is how many houses
   the client keeps — one goes to her project page, several go to `/`, none
   goes nowhere at all.

   There is deliberately no once-only guard: the redirect must fire again for
   a second old destination visited later in the session, and it
   self-terminates because both destinations are unmapped. ────────────────── */

let mockPathname = '/invoices';

const replace = jest.fn();
// One router object for the whole suite — a fresh object per render would
// misreport the hop count.
const router = { replace };

jest.mock('next/navigation', () => ({
  __esModule: true,
  usePathname: () => mockPathname,
  useRouter: () => router,
}));

import { ThresholdRouteCollapse } from '../threshold-route-collapse';

beforeEach(() => {
  replace.mockClear();
  mockPathname = '/invoices';
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ThresholdRouteCollapse', () => {
  it('does nothing on an unmapped path', () => {
    mockPathname = '/account';
    render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing for a client with no project', () => {
    render(<ThresholdRouteCollapse projectIds={[]} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces exactly once with the collapsed href for a solo project on a mapped path', () => {
    mockPathname = '/invoices';
    const { rerender } = render(<ThresholdRouteCollapse projectIds={['p1']} />);
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/projects/p1#letterbox');
  });

  it('hops with no flag to wait on — the first render is the hop', () => {
    mockPathname = '/invoices';
    render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('sends a multi-project client to the front door, keeping the anchor', () => {
    mockPathname = '/invoices';
    render(<ThresholdRouteCollapse projectIds={['p1', 'p2']} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/#letterbox');
  });

  it('does not re-fire once a multi-project hop has landed on the front door', () => {
    mockPathname = '/invoices';
    const { rerender } = render(<ThresholdRouteCollapse projectIds={['p1', 'p2']} />);
    expect(replace).toHaveBeenCalledTimes(1);

    mockPathname = '/';
    rerender(<ThresholdRouteCollapse projectIds={['p1', 'p2']} />);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('collapses again for a second old destination after landing on the project page', () => {
    mockPathname = '/invoices';
    const { rerender } = render(<ThresholdRouteCollapse projectIds={['p1']} />);
    expect(replace).toHaveBeenNthCalledWith(1, '/projects/p1#letterbox');

    // Arrives at the destination — a bare project route, which is unmapped,
    // so nothing fires again yet.
    mockPathname = '/projects/p1';
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);
    expect(replace).toHaveBeenCalledTimes(1);

    // Client visits a second old destination later in the session (e.g. a
    // stale link from an old email).
    mockPathname = '/budget';
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenNthCalledWith(2, '/projects/p1#ledger');
  });

  it('carries a solo client off the sign-in landing route to their Threshold', () => {
    mockPathname = '/projects';
    render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/projects/p1#doorstep');
  });

  it('carries a two-project client off the sign-in landing route to the front door', () => {
    mockPathname = '/projects';
    render(<ThresholdRouteCollapse projectIds={['p1', 'p2']} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/#doorstep');
  });

  it('does not re-fire once the sign-in hop has landed on the project page', () => {
    mockPathname = '/projects';
    const { rerender } = render(<ThresholdRouteCollapse projectIds={['p1']} />);
    expect(replace).toHaveBeenCalledTimes(1);

    mockPathname = '/projects/p1';
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('renders nothing of its own', () => {
    const { container } = render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe('anchor scroll', () => {
    it('scrolls the destination anchor into view once it appears in the DOM', () => {
      jest.useFakeTimers();
      mockPathname = '/invoices';

      render(<ThresholdRouteCollapse projectIds={['p1']} />);
      expect(replace).toHaveBeenCalledWith('/projects/p1#letterbox');

      // The anchor doesn't exist yet — the Threshold hydrates it from
      // client-side data — so the first poll tick finds nothing.
      act(() => {
        jest.advanceTimersByTime(16);
      });

      const anchorEl = document.createElement('div');
      anchorEl.id = 'letterbox';
      anchorEl.scrollIntoView = jest.fn();
      document.body.appendChild(anchorEl);

      act(() => {
        jest.advanceTimersByTime(16);
      });

      expect(anchorEl.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });

      document.body.removeChild(anchorEl);
    });

    it('gives up polling after ~2s if the anchor never appears', () => {
      jest.useFakeTimers();
      mockPathname = '/invoices';

      render(<ThresholdRouteCollapse projectIds={['p1']} />);
      expect(replace).toHaveBeenCalledTimes(1);

      // Advance well past the cap — nothing to assert on scrollIntoView
      // (the element never appeared); this proves the poll stops rather
      // than looping or throwing forever.
      act(() => {
        jest.advanceTimersByTime(2500);
      });

      expect(replace).toHaveBeenCalledTimes(1);
    });
  });
});
