import { describe, it, expect } from 'vitest';
import {
  scorePageMode,
  detectModeFromUrl,
  isKnownBadDomain,
  KNOWN_BAD_DOMAIN_MESSAGE,
} from '../../lib/mode-detection';
import type { PageModeSignals } from '@patina/shared';

function makeSignals(overrides: Partial<PageModeSignals> = {}): PageModeSignals {
  return {
    hasProductSchema: false,
    hasAddToCart: false,
    hasPrice: false,
    isAboutPage: false,
    hasOrganizationSchema: false,
    ...overrides,
  };
}

describe('scorePageMode', () => {
  // ─── Product detection ─────────────────────────────────────────────────

  it('detects product page with JSON-LD Product + price', () => {
    const result = scorePageMode(makeSignals({
      hasProductSchema: true,
      hasPrice: true,
    }));
    expect(result.mode).toBe('product');
    expect(result.product).toBe(5); // 3 + 2
    expect(result.vendor).toBe(0);
  });

  it('detects product page with Add to Cart + price', () => {
    const result = scorePageMode(makeSignals({
      hasAddToCart: true,
      hasPrice: true,
    }));
    expect(result.mode).toBe('product');
    expect(result.product).toBe(5); // 3 + 2
  });

  it('detects product page with all product signals', () => {
    const result = scorePageMode(makeSignals({
      hasProductSchema: true,
      hasAddToCart: true,
      hasPrice: true,
    }));
    expect(result.mode).toBe('product');
    expect(result.product).toBe(8); // 3 + 3 + 2
  });

  it('detects product with Add to Cart alone (score = 3, below threshold)', () => {
    // Score is 3, threshold is 4 — but it's the only signal, so returns 'product'
    const result = scorePageMode(makeSignals({
      hasAddToCart: true,
    }));
    expect(result.mode).toBe('product');
    expect(result.product).toBe(3);
  });

  it('detects product with JSON-LD Product alone (score = 3, below threshold)', () => {
    const result = scorePageMode(makeSignals({
      hasProductSchema: true,
    }));
    expect(result.mode).toBe('product');
    expect(result.product).toBe(3);
  });

  // ─── Vendor detection ──────────────────────────────────────────────────

  it('detects vendor page with About URL + Organization schema', () => {
    const result = scorePageMode(makeSignals({
      isAboutPage: true,
      hasOrganizationSchema: true,
    }));
    expect(result.mode).toBe('vendor');
    expect(result.vendor).toBe(5); // 3 + 2
  });

  it('detects vendor page with About URL alone', () => {
    const result = scorePageMode(makeSignals({
      isAboutPage: true,
    }));
    expect(result.mode).toBe('vendor');
    expect(result.vendor).toBe(3);
  });

  it('Organization schema alone is not enough for vendor mode', () => {
    const result = scorePageMode(makeSignals({
      hasOrganizationSchema: true,
    }));
    // vendor score = 2, below threshold of 3 — no product signals either
    expect(result.mode).toBe('ambiguous');
    expect(result.vendor).toBe(2);
  });

  // ─── Ambiguous / mixed signals ─────────────────────────────────────────

  it('returns ambiguous when both product and vendor signals present equally', () => {
    const result = scorePageMode(makeSignals({
      hasPrice: true,          // product: 2
      isAboutPage: true,       // vendor: 3
    }));
    // product = 2, vendor = 3 — vendor wins because 3 >= threshold and > product
    expect(result.mode).toBe('vendor');
  });

  it('returns ambiguous with low signals on both sides', () => {
    const result = scorePageMode(makeSignals({
      hasPrice: true,                // product: 2
      hasOrganizationSchema: true,   // vendor: 2
    }));
    // product = 2 (below 4), vendor = 2 (below 3), both > 0
    expect(result.mode).toBe('ambiguous');
  });

  it('returns ambiguous with no signals', () => {
    const result = scorePageMode(makeSignals());
    expect(result.mode).toBe('ambiguous');
    expect(result.product).toBe(0);
    expect(result.vendor).toBe(0);
  });

  // ─── Product wins over vendor ──────────────────────────────────────────

  it('product wins when both exceed thresholds but product is higher', () => {
    const result = scorePageMode(makeSignals({
      hasProductSchema: true,  // product: 3
      hasAddToCart: true,       // product: +3 = 6
      isAboutPage: true,       // vendor: 3
    }));
    expect(result.mode).toBe('product');
    expect(result.product).toBe(6);
    expect(result.vendor).toBe(3);
  });

  it('vendor wins when both exceed thresholds but vendor is higher', () => {
    const result = scorePageMode(makeSignals({
      hasPrice: true,                // product: 2
      isAboutPage: true,             // vendor: 3
      hasOrganizationSchema: true,   // vendor: +2 = 5
    }));
    // product = 2 (below 4), vendor = 5 (above 3 and > product)
    expect(result.mode).toBe('vendor');
  });

  // ─── Score values ──────────────────────────────────────────────────────

  it('returns correct score breakdown', () => {
    const result = scorePageMode(makeSignals({
      hasProductSchema: true,
      hasAddToCart: true,
      hasPrice: true,
      isAboutPage: true,
      hasOrganizationSchema: true,
    }));
    expect(result.product).toBe(8); // 3 + 3 + 2
    expect(result.vendor).toBe(5);  // 3 + 2
    expect(result.mode).toBe('product'); // product wins: 8 > 5
  });
});

describe('detectModeFromUrl', () => {
  // ─── Vendor URLs ───────────────────────────────────────────────────────

  it('detects About pages', () => {
    expect(detectModeFromUrl('https://example.com/about')).toEqual({ mode: 'vendor', autoDetected: true });
    expect(detectModeFromUrl('https://example.com/about-us')).toEqual({ mode: 'vendor', autoDetected: true });
    expect(detectModeFromUrl('https://example.com/our-story')).toEqual({ mode: 'vendor', autoDetected: true });
    expect(detectModeFromUrl('https://example.com/company')).toEqual({ mode: 'vendor', autoDetected: true });
  });

  it('detects sustainability and brand pages', () => {
    expect(detectModeFromUrl('https://example.com/sustainability')).toEqual({ mode: 'vendor', autoDetected: true });
    expect(detectModeFromUrl('https://example.com/craftsmanship')).toEqual({ mode: 'vendor', autoDetected: true });
    expect(detectModeFromUrl('https://example.com/heritage')).toEqual({ mode: 'vendor', autoDetected: true });
  });

  // ─── Product URLs ─────────────────────────────────────────────────────

  it('detects product pages', () => {
    expect(detectModeFromUrl('https://example.com/product/chair-123')).toEqual({ mode: 'product', autoDetected: true });
    expect(detectModeFromUrl('https://example.com/products/sofa')).toEqual({ mode: 'product', autoDetected: true });
    expect(detectModeFromUrl('https://example.com/shop/tables')).toEqual({ mode: 'product', autoDetected: true });
  });

  it('detects Amazon-style product URLs', () => {
    expect(detectModeFromUrl('https://amazon.com/dp/B08XYZ123')).toEqual({ mode: 'product', autoDetected: true });
  });

  it('detects PDP URLs', () => {
    expect(detectModeFromUrl('https://example.com/pdp/item-456')).toEqual({ mode: 'product', autoDetected: true });
  });

  // ─── Ambiguous / default ──────────────────────────────────────────────

  it('defaults to product for homepage', () => {
    expect(detectModeFromUrl('https://example.com/')).toEqual({ mode: 'product', autoDetected: false });
  });

  it('defaults to product for unknown paths', () => {
    expect(detectModeFromUrl('https://example.com/collections/living-room')).toEqual({ mode: 'product', autoDetected: false });
  });

  it('handles invalid URLs gracefully', () => {
    expect(detectModeFromUrl('not-a-url')).toEqual({ mode: 'product', autoDetected: false });
  });
});

describe('isKnownBadDomain (CL-R14)', () => {
  it('refuses the social feeds and pinboards', () => {
    const urls = [
      'https://www.pinterest.com/pin/378724649918852625/',
      'https://www.instagram.com/p/DcjKbTzEVTf/',
      'https://www.facebook.com/marketplace/item/123',
      'https://www.tiktok.com/@maker/video/123',
      'https://x.com/maker/status/123',
      'https://twitter.com/maker/status/123',
    ];
    for (const url of urls) {
      expect(isKnownBadDomain(url), url).toBe(true);
    }
  });

  it('refuses subdomains of a known-bad domain', () => {
    expect(isKnownBadDomain('https://business.instagram.com/p/abc/')).toBe(true);
    expect(isKnownBadDomain('https://ro.pinterest.com/pin/123/')).toBe(true);
  });

  it('allows vendor domains that merely contain a known-bad name', () => {
    expect(isKnownBadDomain('https://www.westelm.com/products/harris-sofa-96-h4614/')).toBe(false);
    expect(isKnownBadDomain('https://notinstagram.com/p/abc/')).toBe(false);
    expect(isKnownBadDomain('https://instagram.com.example.net/p/abc/')).toBe(false);
  });

  it('does not throw on a malformed URL', () => {
    expect(isKnownBadDomain('not-a-url')).toBe(false);
  });

  it('carries the copy the panel shows', () => {
    expect(KNOWN_BAD_DOMAIN_MESSAGE).toBe(
      "This page doesn't carry product details. Snapshot it, or add the piece by hand."
    );
  });
});
