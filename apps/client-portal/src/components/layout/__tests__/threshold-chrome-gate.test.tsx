import { render, screen } from '@testing-library/react';

/* ── The header's one flag read ───────────────────────────────────────────
   The Threshold's whole premise is a chrome-less project page: no global
   header on /projects/[id] once the flag has resolved true. Everywhere else
   — while the flag is still loading, on any other route shape, on a nested
   route under a project — the header must stand exactly as it does today.
   Fail-closed means the loading state renders the header, never the gated
   (headerless) state. ─────────────────────────────────────────────────── */

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
    render(<ThresholdChromeGate pathname="/projects/proj-1">{header}</ThresholdChromeGate>);

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('drops the header on a bare project route once the flag has resolved true', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<ThresholdChromeGate pathname="/projects/proj-1">{header}</ThresholdChromeGate>);

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
  });

  it('keeps the header on a nested project route (e.g. scope-change)', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(
      <ThresholdChromeGate pathname="/projects/proj-1/scope-change/req-1">
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('keeps the header on a non-project route (e.g. /invoices) even when the flag is true', () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    render(<ThresholdChromeGate pathname="/invoices">{header}</ThresholdChromeGate>);

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('keeps the header on a bare project route when the flag is false', () => {
    flagMock.mockReturnValue({ value: false, isLoading: false });
    render(<ThresholdChromeGate pathname="/projects/proj-1">{header}</ThresholdChromeGate>);

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });
});
