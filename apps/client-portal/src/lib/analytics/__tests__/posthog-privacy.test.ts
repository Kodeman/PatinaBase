jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    register: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  },
}));

import posthog from 'posthog-js';
import { initPostHog, sanitizePostHogEvent } from '../posthog';

const token = 'opaque_site_request_token_1234567890abcd';
const shareToken = 'a'.repeat(64);
const rfqToken = 'b'.repeat(64);
const evidenceToken = 'c'.repeat(64);
const initMock = (posthog as unknown as { init: jest.Mock }).init;

describe('PostHog Field bearer privacy boundary', () => {
  it('redacts Field bearer paths from nested pageview, referrer, and autocapture properties', () => {
    const occurredAt = new Date('2026-07-18T12:00:00Z');
    const event = sanitizePostHogEvent({
      event: '$autocapture',
      properties: {
        $current_url: `https://client.patina.cloud/field/${token}?from=sms`,
        $referrer: `https://client.patina.cloud/field/${token}`,
        $elements: [
          {
            tag_name: 'a',
            attributes: {
              href: `/field/${token}/capture`,
              'data-source': JSON.stringify({ returnTo: `/field/${token}` }),
            },
          },
        ],
        unrelated_project_id: 'project-123',
        occurred_at: occurredAt,
      },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(token);
    expect(serialized).toContain('/field/[redacted]');
    expect(event.properties?.unrelated_project_id).toBe('project-123');
    expect(event.properties?.occurred_at).toBe(occurredAt);
  });

  it('installs the sanitizer at the send boundary for an already-initialized SPA', () => {
    const priorKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'ph_test';

    initPostHog();

    const config = initMock.mock.calls[0][1] as {
      before_send: typeof sanitizePostHogEvent;
      autocapture?: boolean;
    };
    const afterNavigation = config.before_send({
      event: '$pageview',
      properties: { $current_url: `/field/${token}` },
    });
    expect(afterNavigation?.properties?.$current_url).toBe('/field/[redacted]');
    expect(config.autocapture).not.toBe(false);

    if (priorKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = priorKey;
  });

  it('redacts share bearers from pageview, referrer, autocapture, and nested values', () => {
    const event = sanitizePostHogEvent({
      event: '$autocapture',
      properties: {
        $current_url: `https://client.patina.cloud/share/${shareToken}?from=email`,
        $referrer: `/share/${shareToken}`,
        $elements: [{
          tag_name: 'a',
          attributes: {
            href: `/share/${shareToken}/details`,
            'data-source': JSON.stringify({ returnTo: `/share/${shareToken}` }),
          },
        }],
        already_redacted: '/share/[redacted]',
      },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(shareToken);
    expect(serialized.match(/\/share\/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(5);
    expect(event.properties?.already_redacted).toBe('/share/[redacted]');
  });

  it('redacts trade RFQ bearers from pageview, referrer, autocapture, and nested values', () => {
    const event = sanitizePostHogEvent({
      event: '$autocapture',
      properties: {
        $current_url: `https://client.patina.cloud/rfq/${rfqToken}?from=sms`,
        $referrer: `/rfq/${rfqToken}`,
        $elements: [{
          tag_name: 'a',
          attributes: {
            href: `/rfq/${rfqToken}`,
            'data-source': JSON.stringify({ returnTo: `/rfq/${rfqToken}` }),
          },
        }],
        already_redacted: '/rfq/[redacted]',
      },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(rfqToken);
    expect(serialized.match(/\/rfq\/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(event.properties?.already_redacted).toBe('/rfq/[redacted]');
  });

  it('redacts evidence-upload bearers from pageview, referrer, autocapture, and nested values', () => {
    const event = sanitizePostHogEvent({
      event: '$autocapture',
      properties: {
        $current_url: `https://client.patina.cloud/evidence/${evidenceToken}?from=email`,
        $referrer: `/evidence/${evidenceToken}`,
        $elements: [{
          tag_name: 'a',
          attributes: {
            href: `/evidence/${evidenceToken}`,
            'data-source': JSON.stringify({ returnTo: `/evidence/${evidenceToken}` }),
          },
        }],
        already_redacted: '/evidence/[redacted]',
      },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(evidenceToken);
    expect(serialized.match(/\/evidence\/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(event.properties?.already_redacted).toBe('/evidence/[redacted]');
  });
});
