import { render } from '@testing-library/react';

/* ── The route hop ──────────────────────────────────────────────────────────
   A solo-project client on one of the seven old destinations should land on
   the matching anchor of their one project page, not the old standalone
   route. That only holds once the flag has resolved true and the client has
   exactly one project — every other combination (loading, flag off, two-or-
   more projects, an unmapped path) must leave the client exactly where they
   are, same as SinglePaneSoloRedirect. ─────────────────────────────────────── */

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

  it('renders nothing of its own', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    const { container } = render(<ThresholdRouteCollapse projectIds={['p1']} />);

    expect(container).toBeEmptyDOMElement();
  });
});
