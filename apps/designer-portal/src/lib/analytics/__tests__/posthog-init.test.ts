/**
 * The init seam: `onAnalyticsInit` + `isAnalyticsPossible`.
 *
 * `initPostHog()` runs from an effect at the top of the React tree, and React
 * runs child effects first — so consumers routinely ask "is analytics on?"
 * before it is. These lock in the contract they rely on to tell "not yet"
 * apart from "never here".
 */
jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    register: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    debug: jest.fn(),
  },
}));

type AnalyticsModule = typeof import('../posthog');

const ENV_KEYS = [
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV',
  'NODE_ENV',
] as const;

const originalEnv = ENV_KEYS.map((key) => [key, process.env[key]] as const);
const mutableEnv = process.env as Record<string, string | undefined>;

/**
 * Loads a pristine copy of the module (its `initialized` flag and subscriber
 * queue are module-level state) under the given env.
 */
function loadAnalytics(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): AnalyticsModule {
  for (const key of ENV_KEYS) delete mutableEnv[key];
  mutableEnv.NODE_ENV = 'test';
  for (const [key, value] of Object.entries(env)) mutableEnv[key] = value;

  let mod!: AnalyticsModule;
  jest.isolateModules(() => {
    mod = require('../posthog') as AnalyticsModule;
  });
  return mod;
}

afterEach(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
});

describe('isAnalyticsPossible', () => {
  it('is false without a PostHog key', () => {
    expect(loadAnalytics({}).isAnalyticsPossible()).toBe(false);
  });

  it('is true when a key is configured', () => {
    expect(loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' }).isAnalyticsPossible()).toBe(true);
  });

  it('is false in development without the explicit opt-in', () => {
    const analytics = loadAnalytics({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
      NODE_ENV: 'development',
    });
    expect(analytics.isAnalyticsPossible()).toBe(false);
  });

  it('is true in development with NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true', () => {
    const analytics = loadAnalytics({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
      NODE_ENV: 'development',
      NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV: 'true',
    });
    expect(analytics.isAnalyticsPossible()).toBe(true);
  });

  it('agrees with initPostHog: where it says false, init is a no-op', () => {
    const analytics = loadAnalytics({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
      NODE_ENV: 'development',
    });

    expect(analytics.isAnalyticsPossible()).toBe(false);
    analytics.initPostHog();
    expect(analytics.isAnalyticsEnabled()).toBe(false);
  });

  it('agrees with initPostHog: where it says true, init enables analytics', () => {
    const analytics = loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });

    expect(analytics.isAnalyticsEnabled()).toBe(false);
    analytics.initPostHog();
    expect(analytics.isAnalyticsEnabled()).toBe(true);
  });
});

describe('onAnalyticsInit', () => {
  it('queues subscribers and releases them when init lands', () => {
    const analytics = loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const first = jest.fn();
    const second = jest.fn();

    analytics.onAnalyticsInit(first);
    analytics.onAnalyticsInit(second);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    analytics.initPostHog();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('sees analytics as already enabled from inside the callback', () => {
    const analytics = loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    let enabledDuringCallback: boolean | undefined;

    analytics.onAnalyticsInit(() => {
      enabledDuringCallback = analytics.isAnalyticsEnabled();
    });
    analytics.initPostHog();

    expect(enabledDuringCallback).toBe(true);
  });

  it('runs the callback immediately when init already happened', () => {
    const analytics = loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    analytics.initPostHog();

    const callback = jest.fn();
    analytics.onAnalyticsInit(callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not re-run subscribers if initPostHog is called again', () => {
    const analytics = loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const callback = jest.fn();

    analytics.onAnalyticsInit(callback);
    analytics.initPostHog();
    analytics.initPostHog();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing before init prevents the callback', () => {
    const analytics = loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const stays = jest.fn();
    const leaves = jest.fn();

    analytics.onAnalyticsInit(stays);
    const unsubscribe = analytics.onAnalyticsInit(leaves);
    unsubscribe();
    analytics.initPostHog();

    expect(stays).toHaveBeenCalledTimes(1);
    expect(leaves).not.toHaveBeenCalled();
  });

  it('returns a no-op unsubscribe that is safe to call after the callback fired', () => {
    const analytics = loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const callback = jest.fn();
    const unsubscribe = analytics.onAnalyticsInit(callback);

    analytics.initPostHog();
    expect(() => unsubscribe()).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('one throwing subscriber does not strand the others', () => {
    const analytics = loadAnalytics({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test' });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const later = jest.fn();

    analytics.onAnalyticsInit(() => {
      throw new Error('subscriber blew up');
    });
    analytics.onAnalyticsInit(later);

    expect(() => analytics.initPostHog()).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('never fires when init cannot happen in this environment', () => {
    const analytics = loadAnalytics({});
    const callback = jest.fn();

    analytics.onAnalyticsInit(callback);
    analytics.initPostHog();

    expect(analytics.isAnalyticsPossible()).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });
});
