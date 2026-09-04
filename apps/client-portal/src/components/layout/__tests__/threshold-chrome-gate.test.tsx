import { render, screen } from '@testing-library/react';

/* ── The header's one flag read ───────────────────────────────────────────
   The Threshold's whole premise is a chrome-less project page: no global
   header on /projects/[id] once the flag has resolved true — but only for a
   solo-project client. Everywhere else — while the flag is still loading, on
   any other route shape, on a nested route under a project, or for a client
   with two or more projects (who still needs the project switcher) — the
   header must stand exactly as it does today. Fail-closed means the loading
   state renders the header, never the gated (headerless) state. ────────── */

jest.mock('@/hooks/use-feature-flag', () => ({
  __esModule: true,
  useFeatureFlag: jest.fn(),
}));

import { useFeatureFlag } from '@/hooks/use-feature-flag';

import { ThresholdChromeGate } from '../threshold-chrome-gate';

const flagMock = useFeatureFlag as jest.Mock;

const header = <div data-testid="header">header</div>;

describe('ThresholdChromeGate', () => {
  it('renders the header while the flag is loading', () => {
    flagMock.mockReturnValue({ value: true, isLoading: true });
    render(
      <ThresholdChromeGate pathname="/projects/proj-1" projectCount={1}>
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('drops the header on a bare project route once the flag has resolved true for a solo project', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(
      <ThresholdChromeGate pathname="/projects/proj-1" projectCount={1}>
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
  });

  it('keeps the header on a nested project route (e.g. scope-change)', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(
      <ThresholdChromeGate pathname="/projects/proj-1/scope-change/req-1" projectCount={1}>
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('keeps the header on a non-project route (e.g. /invoices) even when the flag is true', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(
      <ThresholdChromeGate pathname="/invoices" projectCount={1}>
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('keeps the header on a bare project route when the flag is false', () => {
    flagMock.mockReturnValue({ value: false, isLoading: false });
    render(
      <ThresholdChromeGate pathname="/projects/proj-1" projectCount={1}>
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('keeps the header on a bare project route for a multi-project client even when the flag is true', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(
      <ThresholdChromeGate pathname="/projects/proj-1" projectCount={2}>
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('shows the header first, then drops it once the flag resolves true for a solo project — not before', () => {
    flagMock.mockReturnValue({ value: false, isLoading: true });
    const { rerender } = render(
      <ThresholdChromeGate pathname="/projects/proj-1" projectCount={1}>
        {header}
      </ThresholdChromeGate>,
    );
    expect(screen.getByTestId('header')).toBeInTheDocument();

    flagMock.mockReturnValue({ value: true, isLoading: false });
    rerender(
      <ThresholdChromeGate pathname="/projects/proj-1" projectCount={1}>
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
  });
});
