/**
 * US-14 §4c — `deskLineDecided` when PostHog cannot answer. The Desk's person's-words line
 * (`hire-handoff`) is pending while its flag (`onboarding-teammate-persona`) loads, and the Desk's
 * arrival waits on the pick. The real useFeatureFlag runs here against a stubbed SDK: no key
 * settles at once; a blocked flags request fails fast (posthog-js fires its flag callbacks with
 * errorsLoading); a hanging one fires them only at posthog-js's own 3 s request timeout
 * (feature_flag_request_timeout_ms, posthog-js 1.359.1), so the pick is bounded at 800 ms with the
 * flag's fail-closed default and the late answer never changes the printed line.
 */
import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DESK_LINE_BOUND_MS, resetDeskVisit, useDeskLineState } from './desk-arbiter';

const mockIsAnalyticsEnabled = jest.fn();
const mockIsAnalyticsPossible = jest.fn();
const mockIsFeatureEnabled = jest.fn();
let flagCallbacks: Array<() => void> = [];

jest.mock('@/lib/analytics/posthog', () => ({
  isAnalyticsEnabled: () => mockIsAnalyticsEnabled(),
  isAnalyticsPossible: () => mockIsAnalyticsPossible(),
  onAnalyticsInit: () => () => {},
  posthog: {
    isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args),
    onFeatureFlags: (callback: () => void) => {
      flagCallbacks.push(callback);
      return () => {
        flagCallbacks = flagCallbacks.filter((c) => c !== callback);
      };
    },
  },
}));
jest.mock('@/components/document/help/desk-walkthrough', () => ({
  useSuppressDeskFirstTouch: () => false,
}));
jest.mock('@/components/document/margin-note', () => ({
  hasMarginNoteBeenSeen: () => false,
  MarginNote: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));
// Teaching settles at the first ready render (R-RT7) and has nothing to say here.
jest.mock('@/hooks/use-teaching-note', () => ({
  useReturnNote: (opts: { ready: boolean }) => ({
    note: null,
    bind: null,
    sinceLine: null,
    decided: opts.ready,
    yielded: false,
    unsolicitedShown: null,
  }),
}));

/** The Desk page's own wiring of the line (desk/page.tsx), with a handoff note on file. */
function Desk() {
  const { value: enabled, isLoading } = useFeatureFlag('onboarding-teammate-persona');
  const { node, decided } = useDeskLineState({
    ready: true,
    pinnedProjectIds: [],
    lines: {
      'hire-handoff': {
        when: isLoading ? 'pending' : enabled,
        node: <p data-testid="line">From Leah: welcome aboard.</p>,
      },
      'desk-first-touch': { when: false, node: null },
      'desk-walkthrough-offer': { when: false, node: null },
      'setup-whisper': { when: true, node: <p data-testid="line">Finish setting up the studio.</p> },
    },
  });
  return (
    <div data-testid="desk" data-decided={decided ? '' : undefined}>
      {node}
    </div>
  );
}

const decided = () => screen.getByTestId('desk').hasAttribute('data-decided');
const line = () => screen.queryByTestId('line')?.textContent ?? null;

/** posthog-js answering: `value` is what isFeatureEnabled reads once its flag callbacks fire. */
function answer(value: boolean | undefined) {
  mockIsFeatureEnabled.mockReturnValue(value);
  act(() => {
    for (const callback of flagCallbacks) callback();
  });
}

const ENV_KEY = 'NEXT_PUBLIC_FLAG_OVERRIDES';
const overrides = process.env[ENV_KEY];

beforeEach(() => {
  jest.useFakeTimers();
  delete process.env[ENV_KEY];
  resetDeskVisit();
  flagCallbacks = [];
  mockIsFeatureEnabled.mockReturnValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  if (overrides === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = overrides;
});

it('no NEXT_PUBLIC_POSTHOG_KEY: the flag settles fail-closed at once and the line is decided', () => {
  mockIsAnalyticsEnabled.mockReturnValue(false);
  mockIsAnalyticsPossible.mockReturnValue(false);
  render(<Desk />);
  expect(decided()).toBe(true);
  expect(line()).toBe('Finish setting up the studio.');
});

it('the flags endpoint blocked: the SDK fails fast, the line is decided well inside the bound', () => {
  mockIsAnalyticsEnabled.mockReturnValue(true);
  render(<Desk />);
  expect(decided()).toBe(false);
  act(() => {
    jest.advanceTimersByTime(50);
  });
  answer(undefined); // errorsLoading: the callbacks fire with no flag values
  expect(decided()).toBe(true);
  expect(line()).toBe('Finish setting up the studio.');
});

it('the flags endpoint hanging: decided at the 800 ms bound with the fail-closed default; a late answer changes nothing', () => {
  mockIsAnalyticsEnabled.mockReturnValue(true);
  render(<Desk />);
  act(() => {
    jest.advanceTimersByTime(DESK_LINE_BOUND_MS - 1);
  });
  expect(decided()).toBe(false);
  expect(line()).toBeNull();
  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(DESK_LINE_BOUND_MS).toBe(800);
  expect(decided()).toBe(true);
  expect(line()).toBe('Finish setting up the studio.');

  act(() => {
    jest.advanceTimersByTime(3_000 - DESK_LINE_BOUND_MS);
  });
  answer(true); // the SDK's own request timeout, and the flag turns out on
  expect(decided()).toBe(true);
  expect(line()).toBe('Finish setting up the studio.');
});
