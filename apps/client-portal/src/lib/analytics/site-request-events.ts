import { track } from './events';
import { initPostHog } from './posthog';

export type SiteRequestGuestKit = 'K-01' | 'K-02';
export type SiteRequestGuestErrorClass =
  | 'access-ended'
  | 'capture-invalid'
  | 'request-changed'
  | 'transient';

const base = { platform: 'client', surface_detail: 'site-request-guest-web' } as const;

function siteRequestTrack(event: string, properties: Record<string, unknown>): void {
  // The guest component may mount before the provider's parent effect runs.
  // Lazy initialization keeps the first bootstrap milestone from disappearing.
  initPostHog();
  track(event, properties);
}

/**
 * Privacy-safe Site Request funnel. Request/item ids and the bearer token are
 * deliberately absent; URL redaction is enforced separately at before_send.
 */
export const siteRequestGuestEvents = {
  bootstrap: (itemCount: number) =>
    siteRequestTrack('site_request_guest_bootstrap', { ...base, item_count: itemCount }),
  captureQueued: (p: { kitCode: SiteRequestGuestKit; assetCount: number }) =>
    siteRequestTrack('site_request_capture_queued', {
      ...base,
      kit_code: p.kitCode,
      asset_count: p.assetCount,
    }),
  serverReceipt: (p: { kitCode: SiteRequestGuestKit; retryCount: number }) =>
    siteRequestTrack('site_request_server_receipt', {
      ...base,
      kit_code: p.kitCode,
      retry_count: p.retryCount,
    }),
  delivered: (p: { kitCode: SiteRequestGuestKit; retryCount: number }) =>
    siteRequestTrack('site_request_delivered', {
      ...base,
      kit_code: p.kitCode,
      retry_count: p.retryCount,
    }),
  error: (p: {
    kitCode: SiteRequestGuestKit;
    errorClass: SiteRequestGuestErrorClass;
    retryable: boolean;
  }) =>
    siteRequestTrack('site_request_error', {
      ...base,
      kit_code: p.kitCode,
      error_class: p.errorClass,
      retryable: p.retryable,
    }),
};
