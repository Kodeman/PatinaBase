import { render } from '@testing-library/react';

/* ── The solo hop ───────────────────────────────────────────────────────────
   "One job, no list" only applies to a client who has exactly one project,
   and only once the flag has actually resolved true. Every other combination
   must leave `/projects` exactly as it is today — the list is the fail-closed
   state, so a redirect that fires while the flag is loading is a bug, not an
   optimisation. ───────────────────────────────────────────────────────────── */

const replace = jest.fn();
// One router object for the whole suite, because that is what the app router
// hands back — it reads a context value, so it is stable across renders. A
// fresh `{ replace }` per render would re-fire the redirect effect on every
// commit and make this suite lie about how often the hop happens.
const router = { replace };

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => router,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  __esModule: true,
  useFeatureFlag: jest.fn(),
}));

import { useFeatureFlag } from '@/hooks/use-feature-flag';

import { SinglePaneSoloRedirect } from '../single-pane-solo-redirect';

const flagMock = useFeatureFlag as jest.Mock;

beforeEach(() => {
  replace.mockClear();
});

describe('SinglePaneSoloRedirect', () => {
  it('moves a solo project only once the flag has resolved true', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<SinglePaneSoloRedirect projectIds={['proj-vale']} />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/projects/proj-vale');
  });

  it('does nothing while the flag is loading', () => {
    flagMock.mockReturnValue({ value: true, isLoading: true });
    render(<SinglePaneSoloRedirect projectIds={['proj-vale']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing when the flag is off', () => {
    flagMock.mockReturnValue({ value: false, isLoading: false });
    render(<SinglePaneSoloRedirect projectIds={['proj-vale']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('leaves a client with two or more projects on the list', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<SinglePaneSoloRedirect projectIds={['proj-vale', 'proj-oak']} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('leaves a client with no projects alone', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<SinglePaneSoloRedirect projectIds={[]} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it('hops once the flag resolves, not on every render after', () => {
    flagMock.mockReturnValue({ value: false, isLoading: true });
    const { rerender } = render(<SinglePaneSoloRedirect projectIds={['proj-vale']} />);
    expect(replace).not.toHaveBeenCalled();

    flagMock.mockReturnValue({ value: true, isLoading: false });
    rerender(<SinglePaneSoloRedirect projectIds={['proj-vale']} />);
    rerender(<SinglePaneSoloRedirect projectIds={['proj-vale']} />);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('renders nothing of its own', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    const { container } = render(<SinglePaneSoloRedirect projectIds={['proj-vale']} />);

    expect(container).toBeEmptyDOMElement();
  });
});
