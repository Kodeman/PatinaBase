import { renderHook, waitFor } from '@testing-library/react';

// Mock the analytics module so the suite never touches posthog-js. Individual
// tests flip mockIsAnalyticsEnabled / mockIsFeatureEnabled to exercise the
// PostHog paths.
const mockIsAnalyticsEnabled = jest.fn();
const mockIsFeatureEnabled = jest.fn();
const mockOnFeatureFlags = jest.fn();
jest.mock('@/lib/analytics/posthog', () => ({
  isAnalyticsEnabled: () => mockIsAnalyticsEnabled(),
  posthog: {
    isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args),
    onFeatureFlags: (...args: unknown[]) => mockOnFeatureFlags(...args),
  },
}));

import { useFeatureFlag, parseFlagOverride } from '../use-feature-flag';

// The hook reads process.env.NEXT_PUBLIC_FLAG_OVERRIDES at render time (Next
// inlines it in real builds; in jest nothing inlines it, so mutating
// process.env per-test works without module re-isolation).
const ENV_KEY = 'NEXT_PUBLIC_FLAG_OVERRIDES';
const originalValue = process.env[ENV_KEY];

afterEach(() => {
  if (originalValue === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalValue;
});

describe('parseFlagOverride', () => {
  it('returns undefined when the env var is unset', () => {
    delete process.env[ENV_KEY];
    expect(parseFlagOverride('procurement-workspace-pilot')).toBeUndefined();
  });

  it('parses a single flag:true entry', () => {
    process.env[ENV_KEY] = 'procurement-workspace-pilot:true';
    expect(parseFlagOverride('procurement-workspace-pilot')).toBe(true);
  });

  it('parses comma-separated entries with whitespace, true and false', () => {
    process.env[ENV_KEY] = ' flag-a : true , flag-b:false ,procurement-workspace-pilot:true';
    expect(parseFlagOverride('flag-a')).toBe(true);
    expect(parseFlagOverride('flag-b')).toBe(false);
    expect(parseFlagOverride('procurement-workspace-pilot')).toBe(true);
  });

  it('returns undefined for flags not in the list', () => {
    process.env[ENV_KEY] = 'flag-a:true';
    expect(parseFlagOverride('flag-b')).toBeUndefined();
  });

  it('treats any non-"true" value as false', () => {
    process.env[ENV_KEY] = 'flag-a:TRUE,flag-b:1,flag-c:yes';
    expect(parseFlagOverride('flag-a')).toBe(false);
    expect(parseFlagOverride('flag-b')).toBe(false);
    expect(parseFlagOverride('flag-c')).toBe(false);
  });
});

describe('useFeatureFlag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves immediately from the env override without consulting PostHog', () => {
    process.env[ENV_KEY] = 'procurement-workspace-pilot:true';

    const { result } = renderHook(() => useFeatureFlag('procurement-workspace-pilot'));

    expect(result.current).toEqual({ value: true, isLoading: false });
    expect(mockIsAnalyticsEnabled).not.toHaveBeenCalled();
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
    expect(mockOnFeatureFlags).not.toHaveBeenCalled();
  });

  it('resolves an explicit false override immediately (still fail-closed)', () => {
    process.env[ENV_KEY] = 'procurement-workspace-pilot:false';

    const { result } = renderHook(() => useFeatureFlag('procurement-workspace-pilot'));

    expect(result.current).toEqual({ value: false, isLoading: false });
    expect(mockOnFeatureFlags).not.toHaveBeenCalled();
  });

  it('falls through to the fail-closed default when the flag is not overridden and analytics is disabled', async () => {
    process.env[ENV_KEY] = 'some-other-flag:true';
    mockIsAnalyticsEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useFeatureFlag('procurement-workspace-pilot'));

    await waitFor(() => {
      expect(result.current).toEqual({ value: false, isLoading: false });
    });
    expect(mockIsAnalyticsEnabled).toHaveBeenCalled();
  });

  it('uses the PostHog path when no override exists', async () => {
    delete process.env[ENV_KEY];
    mockIsAnalyticsEnabled.mockReturnValue(true);
    mockIsFeatureEnabled.mockReturnValue(true);
    mockOnFeatureFlags.mockReturnValue(() => {});

    const { result } = renderHook(() => useFeatureFlag('procurement-workspace-pilot'));

    await waitFor(() => {
      expect(result.current).toEqual({ value: true, isLoading: false });
    });
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('procurement-workspace-pilot');
  });
});
