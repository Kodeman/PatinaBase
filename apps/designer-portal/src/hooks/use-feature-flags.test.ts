import { act, renderHook } from '@testing-library/react';

// Same analytics mock shape as __tests__/use-feature-flag.test.tsx.
const mockIsAnalyticsEnabled = jest.fn();
const mockIsAnalyticsPossible = jest.fn();
const mockIsFeatureEnabled = jest.fn();
const mockOnFeatureFlags = jest.fn();

let initSubscribers: Array<() => void> = [];
const mockOnAnalyticsInit = jest.fn((callback: () => void) => {
  initSubscribers.push(callback);
  return () => {
    initSubscribers = initSubscribers.filter((s) => s !== callback);
  };
});

jest.mock('@/lib/analytics/posthog', () => ({
  isAnalyticsEnabled: () => mockIsAnalyticsEnabled(),
  isAnalyticsPossible: () => mockIsAnalyticsPossible(),
  onAnalyticsInit: (callback: () => void) => mockOnAnalyticsInit(callback),
  posthog: {
    isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args),
    onFeatureFlags: (...args: unknown[]) => mockOnFeatureFlags(...args),
  },
}));

import { useFeatureFlags } from './use-feature-flags';

const ENV_KEY = 'NEXT_PUBLIC_FLAG_OVERRIDES';
const originalOverrides = process.env[ENV_KEY];

beforeEach(() => {
  jest.clearAllMocks();
  initSubscribers = [];
  delete process.env[ENV_KEY];
  mockIsAnalyticsEnabled.mockReturnValue(false);
  mockIsAnalyticsPossible.mockReturnValue(true);
  mockIsFeatureEnabled.mockReturnValue(undefined);
  mockOnFeatureFlags.mockReturnValue(() => {});
});

afterAll(() => {
  if (originalOverrides === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalOverrides;
});

describe('useFeatureFlags', () => {
  it('settles every flag fail-closed when PostHog can never run here', () => {
    mockIsAnalyticsPossible.mockReturnValue(false);
    const { result } = renderHook(() => useFeatureFlags(['teaching-notes', 'agreement-parts']));
    expect(result.current).toEqual({
      'teaching-notes': { value: false, isLoading: false },
      'agreement-parts': { value: false, isLoading: false },
    });
  });

  it('stays loading and false while PostHog is still coming', () => {
    const { result } = renderHook(() => useFeatureFlags(['teaching-notes']));
    expect(result.current['teaching-notes']).toEqual({ value: false, isLoading: true });
  });

  it('resolves each flag from PostHog once analytics initializes', () => {
    const { result } = renderHook(() => useFeatureFlags(['teaching-notes', 'agreement-parts']));
    mockIsAnalyticsEnabled.mockReturnValue(true);
    mockIsFeatureEnabled.mockImplementation((name: string) => name === 'teaching-notes');
    act(() => initSubscribers.forEach((callback) => callback()));
    expect(result.current).toEqual({
      'teaching-notes': { value: true, isLoading: false },
      'agreement-parts': { value: false, isLoading: false },
    });
  });

  it('updates from onFeatureFlags when PostHog is already up', () => {
    mockIsAnalyticsEnabled.mockReturnValue(true);
    let fire: () => void = () => {};
    mockOnFeatureFlags.mockImplementation((cb: () => void) => {
      fire = cb;
      return () => {};
    });
    const { result } = renderHook(() => useFeatureFlags(['teaching-notes']));
    expect(result.current['teaching-notes']).toEqual({ value: false, isLoading: true });
    mockIsFeatureEnabled.mockReturnValue(true);
    act(() => fire());
    expect(result.current['teaching-notes']).toEqual({ value: true, isLoading: false });
  });

  it('resolves env overrides without PostHog', () => {
    process.env[ENV_KEY] = 'teaching-notes:true';
    mockIsAnalyticsPossible.mockReturnValue(false);
    const { result } = renderHook(() => useFeatureFlags(['teaching-notes', 'other']));
    expect(result.current).toEqual({
      'teaching-notes': { value: true, isLoading: false },
      other: { value: false, isLoading: false },
    });
  });

  it('keeps object identity for an equal names tuple across renders', () => {
    mockIsAnalyticsPossible.mockReturnValue(false);
    const { result, rerender } = renderHook(({ names }) => useFeatureFlags(names), {
      initialProps: { names: ['teaching-notes'] },
    });
    const first = result.current;
    rerender({ names: ['teaching-notes'] });
    expect(result.current).toBe(first);
    rerender({ names: ['teaching-notes', 'agreement-parts'] });
    expect(result.current).not.toBe(first);
    expect(result.current['agreement-parts']).toEqual({ value: false, isLoading: false });
  });
});
