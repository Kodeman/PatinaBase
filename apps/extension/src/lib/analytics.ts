import PostHog from 'posthog-js/dist/module.no-external';

let posthogInstance: ReturnType<typeof PostHog.init> | null = null;

/**
 * Get or initialize the PostHog singleton for Chrome extension context.
 * Uses the CSP-safe build (no-external) and localStorage persistence.
 * Returns null when the API key is not configured.
 */
export function getPostHog() {
  if (posthogInstance) return posthogInstance;

  const key = process.env.PLASMO_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  posthogInstance = PostHog.init(key, {
    api_host: process.env.PLASMO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    persistence: 'localStorage',
    capture_pageview: false,
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_decide: true,
    respect_dnt: true,
    ip: false,
  });

  return posthogInstance;
}

/**
 * Identify the authenticated user for cross-platform identity linking.
 * Uses user.id as distinct_id, never sends full email.
 */
export function identifyUser(
  userId: string,
  properties?: { emailDomain?: string }
): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.identify(userId, {
    platform: 'extension',
    ...(properties?.emailDomain && { email_domain: properties.emailDomain }),
  });
}

/**
 * Reset analytics state on sign-out.
 */
export function resetAnalytics(): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.reset();
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION EVENT CATALOG
// ═══════════════════════════════════════════════════════════════════════════

function track(event: string, properties?: Record<string, unknown>): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.capture(event, properties);
}

export const extensionEvents = {
  /** Sidepanel opened */
  open: () => track('extension_opened'),

  /** Product successfully saved to Supabase */
  productCapture: (properties: {
    hasImages: boolean;
    hasPrice: boolean;
    confidence: string;
    captureMethod: string;
  }) => track('product_saved', properties),

  /** Vendor successfully saved */
  vendorCapture: (properties: {
    hasLogo: boolean;
    hasContactInfo: boolean;
  }) => track('vendor_saved', properties),

  /** Extraction started */
  extractionStart: (mode: string) =>
    track('extraction_started', { mode }),

  /** Extraction completed */
  extractionComplete: (mode: string, fieldCount?: number) =>
    track('extraction_completed', { mode, field_count: fieldCount }),

  /** Extraction failed */
  extractionError: (mode: string, errorType?: string) =>
    track('extraction_failed', { mode, error_type: errorType }),

  /** User toggled product/vendor mode */
  modeSwitch: (from: string, to: string, autoDetected: boolean) =>
    track('mode_switch', { from, to, auto_detected: autoDetected }),

  /** Existing product/vendor found during save */
  duplicateDetected: (type: 'product' | 'vendor') =>
    track('duplicate_detected', { type }),
};
