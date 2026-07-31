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
    respect_dnt: true,
    ip: false,
  });

  // `surface` super-property — every event carries it. Primary dashboard key
  // (designer = designer-web ∪ extension ∪ field-ios).
  posthogInstance.register({ surface: 'extension' });

  return posthogInstance;
}

/**
 * Identify the authenticated user for cross-platform identity linking.
 * Uses user.id as distinct_id, never sends full email.
 */
export function identifyUser(userId: string, properties?: { emailDomain?: string }): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.identify(userId, {
    platform: 'extension',
    role: 'designer',
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

/**
 * Capture-pipeline event catalog aligned with the PRD §10.1 taxonomy.
 *
 * Names follow the `capture.<source>.<action>` / `product.<action>` pattern
 * so PostHog queries can group by surface (extension vs mobile vs URL
 * paste vs manual) without parsing free-form properties. Old names
 * (`extension_opened`, `product_saved`, `vendor_saved`) are no longer
 * emitted from this build — update any saved PostHog dashboards that
 * referenced them.
 *
 * `mobilePhotoTaken`, `urlPasteAttempted`, and `manualCreated` are kept
 * in the catalog even though their callers don't exist yet — wiring them
 * here means the future surfaces emit the right name without re-naming
 * an ad-hoc capture event.
 */
export const extensionEvents = {
  /** Sidepanel opened. `domain` is the active tab's host when known. */
  open: (properties?: { domain?: string }) => track('capture.extension.opened', properties ?? {}),

  /** Sidepanel closed without a successful capture. */
  cancelled: (properties?: { domain?: string; openMs?: number }) =>
    track('capture.extension.cancelled', properties ?? {}),

  /** Product successfully saved to Supabase. */
  productCapture: (properties: {
    hasImages: boolean;
    hasPrice: boolean;
    confidence: string;
    captureMethod: string;
    source?: 'chrome_extension' | 'mobile_photo' | 'url_paste' | 'manual';
    destination?: 'personal' | 'project-room';
    captureTimeMs?: number;
    vendorIsNew?: boolean;
  }) =>
    track('product.captured', {
      // Extension is the default source when nothing more specific is supplied.
      source: 'chrome_extension',
      ...properties,
    }),

  /** Vendor successfully saved. Not in PRD §10.1 — internal-use event. */
  vendorCapture: (properties: { hasLogo: boolean; hasContactInfo: boolean }) =>
    track('vendor.captured', properties),

  /** Mobile capture surfaces — emit from the mobile flow when it lands. */
  mobilePhotoTaken: (properties: { hadNotes: boolean }) =>
    track('capture.mobile_photo.taken', properties),

  /** URL paste capture surface (designer portal). */
  urlPasteAttempted: (properties: { domain?: string; scrapeSuccess: boolean }) =>
    track('capture.url_paste.attempted', properties),

  /** Manual entry capture surface. */
  manualCreated: () => track('capture.manual.created', {}),

  /** Extraction telemetry — extension-internal, not in PRD §10.1. */
  extractionStart: (mode: string) => track('extraction_started', { mode }),
  extractionComplete: (mode: string, fieldCount?: number) =>
    track('extraction_completed', { mode, field_count: fieldCount }),
  extractionError: (mode: string, errorType?: string) =>
    track('extraction_failed', { mode, error_type: errorType }),

  /** User toggled product/vendor mode. */
  modeSwitch: (from: string, to: string, autoDetected: boolean) =>
    track('mode_switch', { from, to, auto_detected: autoDetected }),

  /** Existing product/vendor found during save. */
  duplicateDetected: (type: 'product' | 'vendor') => track('duplicate_detected', { type }),

  /** Spec-book project placement, namespaced for the cross-surface funnel. */
  specBookPlacementAttempted: (properties: { routeKind: string; reusedProduct: boolean }) =>
    track('spec_book.capture_routing.attempted', {
      route_kind: properties.routeKind,
      reused_product: properties.reusedProduct,
    }),
  specBookPlacementSucceeded: (properties: { routeKind: string; reusedProduct: boolean }) =>
    track('spec_book.capture_routing.succeeded', {
      route_kind: properties.routeKind,
      reused_product: properties.reusedProduct,
    }),
  specBookPlacementFailed: (properties: {
    routeKind: string;
    reusedProduct: boolean;
    retryable: boolean;
  }) =>
    track('spec_book.capture_routing.failed', {
      route_kind: properties.routeKind,
      reused_product: properties.reusedProduct,
      retryable: properties.retryable,
    }),
};
