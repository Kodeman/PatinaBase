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

import { extensionEvents, getPostHog, identifyUser } from '../../lib/analytics';

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

  // CL W3-E10 — product.captured gains domain/destination/captureTimeMs.
  it('carries domain, destination, and captureTimeMs on product.captured', () => {
    extensionEvents.productCapture({
      hasImages: true,
      hasPrice: true,
      confidence: 'high',
      captureMethod: 'new',
      domain: 'shop.example',
      destination: 'fill_slot',
      captureTimeMs: 4200,
    });
    expect(posthog.client.capture).toHaveBeenCalledWith('product.captured', {
      source: 'chrome_extension',
      hasImages: true,
      hasPrice: true,
      confidence: 'high',
      captureMethod: 'new',
      domain: 'shop.example',
      destination: 'fill_slot',
      captureTimeMs: 4200,
    });
  });

  // CL-R8 — identify sends only {platform, role}, dropping the legacy
  // address-derived property entirely (no address, no property derived
  // from one).
  it('identifies with user.id + {platform, role} only', () => {
    identifyUser('user-1');
    expect(posthog.client.identify).toHaveBeenCalledWith('user-1', {
      platform: 'extension',
      role: 'designer',
    });
    const [, properties] = posthog.client.identify.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.keys(properties)).toEqual(['platform', 'role']);
  });
});
