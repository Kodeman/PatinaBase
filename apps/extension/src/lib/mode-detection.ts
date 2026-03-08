/**
 * Pure scoring logic for page mode detection.
 * Separated from DOM extraction so it can be tested without a browser environment.
 */

import type { PageMode, PageModeSignals } from '@patina/shared';

export interface ModeScore {
  product: number;
  vendor: number;
  mode: PageMode;
}

/**
 * Score page mode signals and return the detected mode.
 *
 * Scoring weights:
 *   Product: JSON-LD Product (3), Add to Cart button (3), Price element (2)
 *   Vendor:  About-style URL (3), JSON-LD Organization (2)
 *
 * Thresholds: product >= 4 wins, vendor >= 3 wins.
 * If both exceed thresholds, the higher score wins.
 * If neither meets threshold but signals exist, returns 'ambiguous'.
 */
export function scorePageMode(signals: PageModeSignals): ModeScore {
  const product =
    (signals.hasProductSchema ? 3 : 0) +
    (signals.hasAddToCart ? 3 : 0) +
    (signals.hasPrice ? 2 : 0);

  const vendor =
    (signals.isAboutPage ? 3 : 0) +
    (signals.hasOrganizationSchema ? 2 : 0);

  let mode: PageMode;

  if (product >= 4 && product > vendor) {
    mode = 'product';
  } else if (vendor >= 3 && vendor > product) {
    mode = 'vendor';
  } else if (product > 0 && vendor > 0) {
    mode = 'ambiguous';
  } else if (product > 0) {
    mode = 'product';
  } else {
    mode = 'ambiguous';
  }

  return { product, vendor, mode };
}

/**
 * URL-only fallback for mode detection when the content script
 * is not available (e.g. chrome:// pages, restricted tabs).
 */
export function detectModeFromUrl(url: string): { mode: PageMode; autoDetected: boolean } {
  try {
    const pathname = new URL(url).pathname.toLowerCase();

    const vendorPatterns = [
      '/about', '/about-us', '/our-story', '/company',
      '/who-we-are', '/meet-the-team', '/our-mission',
      '/sustainability', '/craftsmanship', '/heritage',
      '/brand', '/our-brand', '/history',
    ];

    const productPatterns = [
      '/product/', '/products/', '/p/', '/item/', '/dp/',
      '/shop/', '/buy/', '/pdp/', '/catalog/',
    ];

    if (vendorPatterns.some(p => pathname.includes(p))) {
      return { mode: 'vendor', autoDetected: true };
    }

    if (productPatterns.some(p => pathname.includes(p))) {
      return { mode: 'product', autoDetected: true };
    }

    return { mode: 'product', autoDetected: false };
  } catch {
    return { mode: 'product', autoDetected: false };
  }
}
