import { act, render } from '@testing-library/react';

/* ── The route hop ──────────────────────────────────────────────────────────
   A solo-project client on one of the eight old destinations should land on
   the matching anchor of their one project page, not the old standalone
   route. That only holds once the flag has resolved true and the client has
   exactly one project — every other combination (loading, flag off, two-or-
   more projects, an unmapped path) must leave the client exactly where they
   are, same as SinglePaneSoloRedirect. There is deliberately no once-only
   guard: the redirect must fire again for a second old destination visited
   later in the session (e.g. via the header nav before it itself collapses
   away), and it self-terminates the same way SinglePaneSoloRedirect does —
   the destination pathname is unmapped, so nothing fires on it. ──────────── */

let mockPathname = '/invoices';

const replace = jest.fn();
// One router object for the whole suite — see single-pane-solo-redirect's
// test for why a fresh object per render would misreport the hop count.
const router = { replace };

jest.mock('next/navigation', () => ({
  __esModule: true,
  usePathname: () => mockPathname,
  useRouter: () => router,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  __esModule: true,
  useFeatureFlag: jest.fn(),
}));

import { useFeatureFlag } from '@/hooks/use-feature-flag';

import { ThresholdRouteCollapse } from '../threshold-route-collapse';

const flagMock = useFeatureFlag as jest.Mock;

beforeEach(() => {
  replace.mockClear();
  mockPathname = '/invoices';
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ThresholdRouteCollapse', () => {
  it('does nothing while the flag is loading', () => {
    flagMock.mockReturnValue({ value: true, isLoading: true });
    render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing with two projects, even once the flag resolves true', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<ThresholdRouteCollapse projectIds={['p1', 'p2']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing on an unmapped path', () => {
    mockPathname = '/account';
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing when the flag is off', () => {
    flagMock.mockReturnValue({ value: false, isLoading: false });
    render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces exactly once with the collapsed href for a solo project on a mapped path', () => {
    mockPathname = '/invoices';
    flagMock.mockReturnValue({ value: true, isLoading: false });
    const { rerender } = render(<ThresholdRouteCollapse projectIds={['p1']} />);
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/projects/p1#letterbox');
  });

  it('hops once the flag resolves, not while it is still loading', () => {
    mockPathname = '/invoices';
    flagMock.mockReturnValue({ value: false, isLoading: true });
    const { rerender } = render(<ThresholdRouteCollapse projectIds={['p1']} />);
    expect(replace).not.toHaveBeenCalled();

    flagMock.mockReturnValue({ value: true, isLoading: false });
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('collapses again for a second old destination after landing on the project page', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    mockPathname = '/invoices';
    const { rerender } = render(<ThresholdRouteCollapse projectIds={['p1']} />);
    expect(replace).toHaveBeenNthCalledWith(1, '/projects/p1#letterbox');

    // Arrives at the destination — a bare project route, which is unmapped,
    // so nothing fires again yet.
    mockPathname = '/projects/p1';
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);
    expect(replace).toHaveBeenCalledTimes(1);

    // Client visits a second old destination later in the session (e.g. a
    // stale header link before that header itself collapses away).
    mockPathname = '/budget';
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenNthCalledWith(2, '/projects/p1#ledger');
  });

  it('carries a solo client off the sign-in landing route to their Threshold', () => {
    mockPathname = '/projects';
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/projects/p1#doorstep');
  });

  it('leaves a two-project client on the sign-in landing route', () => {
    mockPathname = '/projects';
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<ThresholdRouteCollapse projectIds={['p1', 'p2']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('does not re-fire once the sign-in hop has landed on the project page', () => {
    mockPathname = '/projects';
    flagMock.mockReturnValue({ value: true, isLoading: false });
    const { rerender } = render(<ThresholdRouteCollapse projectIds={['p1']} />);
    expect(replace).toHaveBeenCalledTimes(1);

    mockPathname = '/projects/p1';
    rerender(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('renders nothing of its own', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    const { container } = render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe('anchor scroll', () => {
    it('scrolls the destination anchor into view once it appears in the DOM', () => {
      jest.useFakeTimers();
      mockPathname = '/invoices';
      flagMock.mockReturnValue({ value: true, isLoading: false });

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
      flagMock.mockReturnValue({ value: true, isLoading: false });

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
