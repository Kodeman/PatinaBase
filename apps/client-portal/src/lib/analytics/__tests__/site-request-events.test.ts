jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('../posthog', () => ({
  isAnalyticsEnabled: () => true,
  initPostHog: jest.fn(),
}));

import posthog from 'posthog-js';
import { initPostHog } from '../posthog';
import { siteRequestGuestEvents } from '../site-request-events';

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;
const initPostHogMock = initPostHog as jest.Mock;

describe('site request guest funnel', () => {
  it('emits the complete funnel without request, item, or bearer identifiers', () => {
    siteRequestGuestEvents.bootstrap(2);
    siteRequestGuestEvents.captureQueued({ kitCode: 'K-02', assetCount: 3 });
    siteRequestGuestEvents.serverReceipt({ kitCode: 'K-02', retryCount: 1 });
    siteRequestGuestEvents.delivered({ kitCode: 'K-02', retryCount: 1 });
    siteRequestGuestEvents.error({
      kitCode: 'K-02',
      errorClass: 'transient',
      retryable: true,
    });

    expect(captureMock.mock.calls.map(([name]) => name)).toEqual([
      'site_request_guest_bootstrap',
      'site_request_capture_queued',
      'site_request_server_receipt',
      'site_request_delivered',
      'site_request_error',
    ]);
    expect(initPostHogMock).toHaveBeenCalledTimes(5);
    const serialized = JSON.stringify(captureMock.mock.calls);
    expect(serialized).not.toMatch(/request_id|item_id|token|\/field\//i);
    expect(captureMock).toHaveBeenCalledWith(
      'site_request_capture_queued',
      expect.objectContaining({ kit_code: 'K-02', asset_count: 3 }),
    );
  });
});
