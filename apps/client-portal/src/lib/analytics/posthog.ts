import posthog, { type CaptureResult } from 'posthog-js';

declare global {
  interface Window {
    posthog?: typeof posthog;
  }
}

let initialized = false;

const FIELD_BEARER_IN_URL = /\/field\/[A-Za-z0-9_-]{32,256}(?![A-Za-z0-9_-])/g;

function sanitizeAnalyticsValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') {
    return value.replace(FIELD_BEARER_IN_URL, '/field/[redacted]');
  }
  if (!value || typeof value !== 'object') return value;

  if (typeof URL !== 'undefined' && value instanceof URL) {
    return value.toString().replace(FIELD_BEARER_IN_URL, '/field/[redacted]');
  }
  if (value instanceof Date || value instanceof RegExp) return value;

  const prior = seen.get(value);
  if (prior) return prior;

  if (Array.isArray(value)) {
    const sanitized: unknown[] = [];
    seen.set(value, sanitized);
    value.forEach((entry) => sanitized.push(sanitizeAnalyticsValue(entry, seen)));
    return sanitized;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const sanitized: Record<string, unknown> = {};
  seen.set(value, sanitized);
  for (const [key, entry] of Object.entries(value)) {
    const sanitizedKey = key.replace(FIELD_BEARER_IN_URL, '/field/[redacted]');
    sanitized[sanitizedKey] = sanitizeAnalyticsValue(entry, seen);
  }
  return sanitized;
}

/**
 * Last-mile privacy boundary for every PostHog event, including SDK-generated
 * autocapture properties and URLs added after an SPA navigation. Field guest
 * bearer credentials are valid path segments, so no event may leave the
 * browser with one embedded in a URL, referrer, element href, or nested value.
 */
export function sanitizePostHogEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  return sanitizeAnalyticsValue(event, new WeakMap()) as CaptureResult;
}

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
    before_send: sanitizePostHogEvent,
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

  // `surface` super-property — every event (incl. autocapture, help-system
  // via window.posthog, pageviews) carries it. Primary dashboard key
  // (client = client-web ∪ patina-ios).
  posthog.register({ surface: 'client-web' });

  initialized = true;
}

export function identifyUser(
  userId: string,
  properties?: { emailDomain?: string; displayName?: string; role?: string }
): void {
  if (!isAnalyticsEnabled()) return;
  posthog.identify(userId, {
    platform: 'client',
    ...(properties?.emailDomain && { email_domain: properties.emailDomain }),
    ...(properties?.displayName && { display_name: properties.displayName }),
    ...(properties?.role && { role: properties.role }),
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
