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
 * CL-R14: social feeds and pinboards. They render product-shaped markup
 * (og:title, an image, money-shaped tokens in their script payloads) but carry
 * no product record, so extraction produces a confident-looking wrong capture.
 * Capture refuses them outright.
 */
const KNOWN_BAD_DOMAINS = [
  'pinterest.com',
  'pin.it',
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
];

export const KNOWN_BAD_DOMAIN_MESSAGE =
  "This page doesn't carry product details. Snapshot it, or add the piece by hand.";

/**
 * True when the URL is on a known-bad domain (or one of its subdomains).
 *
 * Pinterest runs a per-country TLD (pinterest.co.uk, pinterest.de, …), so any
 * host that starts `pinterest.` counts too.
 */
export function isKnownBadDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (hostname.startsWith('pinterest.')) return true;
    return KNOWN_BAD_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
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
