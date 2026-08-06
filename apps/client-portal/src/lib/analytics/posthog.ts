import posthog, { type CaptureResult } from 'posthog-js';

declare global {
  interface Window {
    posthog?: typeof posthog;
  }
}

let initialized = false;

/**
 * Subscribers waiting for `initPostHog()` to run.
 *
 * `initPostHog()` is called from an effect at the top of the React tree
 * (`PostHogAnalyticsProvider`), and React runs *child* effects before *parent*
 * effects — so every consumer mounted underneath it (the feature-flag hook in
 * a page, the pageview and identify trackers) runs its first effect while
 * `initialized` is still false. Consumers that treat "not enabled" as a
 * terminal state settle permanently wrong. This queue is how they wait for
 * init instead. Ported from the designer portal, where the same race left a
 * layout-mounted flag dead for a whole session on every cold load.
 */
const initSubscribers = new Set<() => void>();

/**
 * Runs `callback` once analytics is live: immediately if `initPostHog()` has
 * already run, otherwise when it does. Returns an unsubscribe function
 * (idempotent, safe to call after the callback has already fired).
 *
 * If init never happens in this environment the callback never runs — check
 * `isAnalyticsPossible()` first if you need a terminal answer.
 */
export function onAnalyticsInit(callback: () => void): () => void {
  if (isAnalyticsEnabled()) {
    callback();
    return () => {};
  }

  initSubscribers.add(callback);
  return () => {
    initSubscribers.delete(callback);
  };
}

/**
 * True when `initPostHog()` will eventually succeed in this environment —
 * i.e. "analytics is not enabled *yet*" rather than "analytics will never be
 * enabled here". Mirrors initPostHog's own guards exactly; keep the two in
 * sync.
 *
 * Consumers use this to distinguish the init race (wait via
 * `onAnalyticsInit`) from a genuinely analytics-free environment (no key, or
 * dev without the explicit opt-in), where waiting would hang forever.
 */
export function isAnalyticsPossible(): boolean {
  if (typeof window === 'undefined') return false;

  // Must stay a static `process.env.NEXT_PUBLIC_*` member expression so
  // Next.js inlines it into the client bundle.
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return false;

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV !== 'true'
  ) {
    return false;
  }

  return true;
}

// /field tokens are either a 64-hex field_link_tokens value OR an
// `sr_`-prefixed site-request token (see field/[token]/site-request-types.ts)
// — a broader URL-safe alphabet than plain hex, so it stays its own pattern
// rather than folding into the generic hex one below.
const FIELD_BEARER_IN_URL = /\/field\/[A-Za-z0-9_-]{32,256}(?![A-Za-z0-9_-])/g;

// /share, /rfq, /evidence, and /plans all mint the same 64-char lowercase-hex
// bearer (sha256/gen_random_bytes idiom — document_shares, trade_rfq_tokens,
// fulfillment_mint_evidence_token, plan_transmittal_tokens) — one generic
// pattern covers all four while preserving which prefix gets redacted back
// into the URL.
const HEX_BEARER_IN_URL = /\/(share|rfq|evidence|plans)\/[0-9a-f]{64}(?![0-9a-f])/gi;

function redactBearerPaths(value: string): string {
  return value
    .replace(FIELD_BEARER_IN_URL, '/field/[redacted]')
    .replace(HEX_BEARER_IN_URL, (_match, prefix: string) => `/${prefix}/[redacted]`);
}

function sanitizeAnalyticsValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') {
    return redactBearerPaths(value);
  }
  if (!value || typeof value !== 'object') return value;

  if (typeof URL !== 'undefined' && value instanceof URL) {
    return redactBearerPaths(value.toString());
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
    const sanitizedKey = redactBearerPaths(key);
    sanitized[sanitizedKey] = sanitizeAnalyticsValue(entry, seen);
  }
  return sanitized;
}

/**
 * Last-mile privacy boundary for every PostHog event, including SDK-generated
 * autocapture properties and URLs added after an SPA navigation. Field and
 * document-share bearer credentials are valid path segments, so no event may
 * leave the browser with one embedded in a URL, referrer, element href, key,
 * or nested value.
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

  // Release everyone who mounted before us. Drain first so a subscriber that
  // re-subscribes during its own callback takes the immediate path instead of
  // being re-queued, and isolate throws so one bad subscriber can't strand the
  // rest mid-flush.
  const waiting = Array.from(initSubscribers);
  initSubscribers.clear();
  for (const callback of waiting) {
    try {
      callback();
    } catch (error) {
      console.error('[analytics] init subscriber threw', error);
    }
  }
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
