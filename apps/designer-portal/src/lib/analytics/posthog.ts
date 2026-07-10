import posthog from 'posthog-js';

declare global {
  interface Window {
    posthog?: typeof posthog;
  }
}

let initialized = false;

export function initPostHog(): void {
  if (initialized || typeof window === 'undefined') return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  // Skip in dev unless explicitly opted in — PostHog network failures pollute
  // the Next.js dev error overlay and mask real application errors.
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV !== 'true'
  ) {
    return;
  }

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

  // @patina/help-system captures its help.* analytics via `window.posthog`
  // (it has no posthog-js import of its own) — expose the initialized
  // instance or those captures silently no-op.
  window.posthog = posthog;

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
