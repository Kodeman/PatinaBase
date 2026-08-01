import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => {
  const client = {
    capture: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    reset: vi.fn(),
  };

  return {
    client,
    init: vi.fn(() => client),
  };
});

vi.mock('posthog-js/dist/module.no-external', () => ({
  default: { init: posthog.init },
}));

import { extensionEvents, getPostHog } from '../../lib/analytics';

describe('extension analytics', () => {
  beforeEach(() => {
    process.env.PLASMO_PUBLIC_POSTHOG_KEY = 'test-posthog-key';
    Object.assign(chrome.runtime, {
      getManifest: vi.fn(() => ({ version: '0.1.1' })),
    });
  });

  it('registers the installed extension version for every PostHog event', () => {
    expect(getPostHog()).toBe(posthog.client);
    expect(posthog.client.register).toHaveBeenCalledWith({
      surface: 'extension',
      app_version: '0.1.1',
    });

    extensionEvents.open({ domain: 'example.com' });
    expect(posthog.client.capture).toHaveBeenCalledWith('capture.extension.opened', {
      domain: 'example.com',
    });
  });
});
