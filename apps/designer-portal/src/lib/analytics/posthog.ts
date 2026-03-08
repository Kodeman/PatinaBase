import posthog from 'posthog-js';

let initialized = false;

export function initPostHog(): void {
  if (initialized || typeof window === 'undefined') return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false, // We handle manually for SPA
    respect_dnt: true,
    ip: false,
    persistence: 'localStorage+cookie',
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') {
        ph.debug();
      }
    },
  });

  initialized = true;
}

export function identifyUser(
  userId: string,
  properties?: { emailDomain?: string; displayName?: string }
): void {
  if (!isAnalyticsEnabled()) return;
  posthog.identify(userId, {
    platform: 'portal',
    ...(properties?.emailDomain && { email_domain: properties.emailDomain }),
    ...(properties?.displayName && { display_name: properties.displayName }),
  });
}

export function resetAnalytics(): void {
  if (!isAnalyticsEnabled()) return;
  posthog.reset();
}

export function isAnalyticsEnabled(): boolean {
  return initialized && typeof window !== 'undefined';
}

export { posthog };
