import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

// Mock the analytics module so the suite never touches posthog-js. Individual
// tests flip mockIsAnalyticsEnabled / mockIsAnalyticsPossible /
// mockIsFeatureEnabled to exercise the PostHog paths.
//
// Everything inside the jest.mock factory must stay a thunk — the factory is
// hoisted above these declarations and runs at import time, so it may only
// *reference* them, never evaluate them.
const mockIsAnalyticsEnabled = jest.fn();
const mockIsAnalyticsPossible = jest.fn();
const mockIsFeatureEnabled = jest.fn();
const mockOnFeatureFlags = jest.fn();

// Stand-in for posthog.ts's init queue, so tests can hold the hook in the
// "analytics is coming but hasn't initialized yet" state and then release it.
let initSubscribers: Array<() => void> = [];
const mockOnAnalyticsInit = jest.fn((callback: () => void) => {
  if (mockIsAnalyticsEnabled()) {
    callback();
    return () => {};
  }
  initSubscribers.push(callback);
  return () => {
    initSubscribers = initSubscribers.filter((s) => s !== callback);
  };
});

/** Simulate initPostHog() finishing after consumers have already mounted. */
function fireAnalyticsInit() {
  mockIsAnalyticsEnabled.mockReturnValue(true);
  const waiting = initSubscribers;
  initSubscribers = [];
  act(() => {
    waiting.forEach((callback) => callback());
  });
}

jest.mock('@/lib/analytics/posthog', () => ({
  isAnalyticsEnabled: () => mockIsAnalyticsEnabled(),
  isAnalyticsPossible: () => mockIsAnalyticsPossible(),
  onAnalyticsInit: (callback: () => void) => mockOnAnalyticsInit(callback),
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

  it('preserves colons in the value for multi-colon entries (e.g. flag:true:extra → value "true:extra" → false)', () => {
    process.env[ENV_KEY] = 'flag-a:true:extra';
    // value is 'true:extra', which !== 'true', so resolves false
    expect(parseFlagOverride('flag-a')).toBe(false);
  });

  it('skips bare entries without a colon and returns undefined (falls through to PostHog)', () => {
    process.env[ENV_KEY] = 'flag-a';
    expect(parseFlagOverride('flag-a')).toBeUndefined();
  });
});

describe('useFeatureFlag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initSubscribers = [];
    mockIsAnalyticsEnabled.mockReturnValue(false);
    mockIsAnalyticsPossible.mockReturnValue(false);
    mockIsFeatureEnabled.mockReturnValue(undefined);
    mockOnFeatureFlags.mockReturnValue(() => {});
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
    expect(mockIsAnalyticsEnabled).not.toHaveBeenCalled();
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
    expect(mockOnFeatureFlags).not.toHaveBeenCalled();
  });

  it('settles fail-closed when analytics can never initialize in this environment', async () => {
    process.env[ENV_KEY] = 'some-other-flag:true';
    mockIsAnalyticsEnabled.mockReturnValue(false);
    mockIsAnalyticsPossible.mockReturnValue(false);

    const { result } = renderHook(() => useFeatureFlag('procurement-workspace-pilot'));

    await waitFor(() => {
      expect(result.current).toEqual({ value: false, isLoading: false });
    });
    expect(mockIsAnalyticsEnabled).toHaveBeenCalled();
    // No key / dev without the opt-in: waiting for init would hang forever.
    expect(mockOnAnalyticsInit).not.toHaveBeenCalled();
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
    // Already initialized — no need to wait on the init queue.
    expect(mockOnAnalyticsInit).not.toHaveBeenCalled();
  });
});

/**
 * The provider calls initPostHog() from an effect at the top of the tree, and
 * React runs child effects first — so layout-mounted consumers always resolve
 * this hook *before* analytics exists. These lock in that they recover.
 */
describe('useFeatureFlag — the provider init race', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initSubscribers = [];
    delete process.env[ENV_KEY];
    // Prod cold-load shape: a key is configured (init is coming) but the
    // provider's effect hasn't run yet.
    mockIsAnalyticsEnabled.mockReturnValue(false);
    mockIsAnalyticsPossible.mockReturnValue(true);
    mockIsFeatureEnabled.mockReturnValue(undefined);
    mockOnFeatureFlags.mockReturnValue(() => {});
  });

  it('stays loading (not settled false) while init is still pending', () => {
    const { result } = renderHook(() => useFeatureFlag('studio-workspaces'));

    expect(result.current).toEqual({ value: false, isLoading: true });
    expect(mockOnAnalyticsInit).toHaveBeenCalledTimes(1);
    // Crucially it did NOT give up — the old code settled isLoading:false here
    // with no subscription and never looked again.
    expect(mockOnFeatureFlags).not.toHaveBeenCalled();
  });

  it('picks up a cached flag value the moment init lands', () => {
    const { result } = renderHook(() => useFeatureFlag('studio-workspaces'));
    expect(result.current).toEqual({ value: false, isLoading: true });

    mockIsFeatureEnabled.mockReturnValue(true);
    fireAnalyticsInit();

    expect(result.current).toEqual({ value: true, isLoading: false });
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('studio-workspaces');
  });

  it('subscribes to onFeatureFlags after late init and updates when flags arrive', () => {
    let flagsCallback: (() => void) | undefined;
    mockOnFeatureFlags.mockImplementation((cb: () => void) => {
      flagsCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useFeatureFlag('studio-workspaces'));

    // Init lands, but PostHog has no cached answer yet.
    fireAnalyticsInit();
    expect(result.current).toEqual({ value: false, isLoading: true });
    expect(mockOnFeatureFlags).toHaveBeenCalledTimes(1);

    // Flags resolve from the network.
    mockIsFeatureEnabled.mockReturnValue(true);
    act(() => flagsCallback?.());

    expect(result.current).toEqual({ value: true, isLoading: false });
  });

  it('unsubscribes from both the init queue and onFeatureFlags on unmount', () => {
    const unsubscribeFlags = jest.fn();
    mockOnFeatureFlags.mockReturnValue(unsubscribeFlags);

    const { unmount } = renderHook(() => useFeatureFlag('studio-workspaces'));
    expect(initSubscribers).toHaveLength(1);

    unmount();

    // Left the queue, so a later init cannot setState on an unmounted hook.
    expect(initSubscribers).toHaveLength(0);
    expect(() => fireAnalyticsInit()).not.toThrow();
    expect(mockOnFeatureFlags).not.toHaveBeenCalled();
  });

  it('unsubscribes from onFeatureFlags when unmounted after a late init', () => {
    const unsubscribeFlags = jest.fn();
    mockOnFeatureFlags.mockReturnValue(unsubscribeFlags);

    const { unmount } = renderHook(() => useFeatureFlag('studio-workspaces'));
    fireAnalyticsInit();
    expect(mockOnFeatureFlags).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribeFlags).toHaveBeenCalledTimes(1);
  });

  it('never consults the init queue when an env override is present', () => {
    process.env[ENV_KEY] = 'studio-workspaces:true';

    const { result } = renderHook(() => useFeatureFlag('studio-workspaces'));

    expect(result.current).toEqual({ value: true, isLoading: false });
    expect(mockOnAnalyticsInit).not.toHaveBeenCalled();
    expect(mockIsAnalyticsEnabled).not.toHaveBeenCalled();
  });

  /**
   * The prod symptom, at component level: the account sheet's Studio tab is
   * rendered by a layout-mounted component that never remounts. It went dead
   * on every cold load because the flag settled false before init.
   */
  it('reveals a gated tab in a layout-mounted component after late init', () => {
    function AccountTabs() {
      const { value: studioEnabled } = useFeatureFlag('studio-workspaces');
      return (
        <nav>
          <span>Profile</span>
          {studioEnabled ? <span>Studio</span> : null}
        </nav>
      );
    }

    render(<AccountTabs />);
    expect(screen.queryByText('Studio')).not.toBeInTheDocument();

    mockIsFeatureEnabled.mockReturnValue(true);
    fireAnalyticsInit();

    expect(screen.getByText('Studio')).toBeInTheDocument();
  });
});
