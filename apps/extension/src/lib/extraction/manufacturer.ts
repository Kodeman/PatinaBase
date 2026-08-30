/**
 * Manufacturer extraction from product data
 * Extracts the brand/manufacturer distinct from the retailer
 */

import type { VendorMatchConfidence } from '@patina/shared';
import { getKnownRetailerName } from './retailer';

export interface ExtractedManufacturer {
  name: string;
  confidence: VendorMatchConfidence;
  source: 'json-ld' | 'meta-tag' | 'dom-element' | 'inline-script';
}

/** JSON-LD `@type` is a string or an array of strings. */
function schemaTypes(obj: Record<string, unknown>): string[] {
  const type = obj['@type'];
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string');
  return [];
}

/** A brand/manufacturer value: a string, a {name}, or an array of either. */
function brandValueToName(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const name = brandValueToName(entry);
      if (name) return name;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return null;
}

/**
 * Find brand/manufacturer in JSON-LD structured data
 */
function findBrandInJsonLd(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;
  const types = schemaTypes(obj);

  // A configurator publishes its brand on the ProductGroup, not the variants.
  if (types.includes('Product') || types.includes('ProductGroup')) {
    const brand = brandValueToName(obj.brand);
    if (brand) return brand;

    const manufacturer = brandValueToName(obj.manufacturer);
    if (manufacturer) return manufacturer;
  }

  // Recurse into arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findBrandInJsonLd(item);
      if (result) return result;
    }
  } else {
    // Recurse into nested objects (e.g., @graph)
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const result = findBrandInJsonLd(value);
        if (result) return result;
      }
    }
  }

  return null;
}

/**
 * Extract manufacturer from JSON-LD structured data
 */
function extractFromJsonLd(): ExtractedManufacturer | null {
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const brand = findBrandInJsonLd(data);
      if (brand) {
        return {
          name: brand,
          confidence: 'high',
          source: 'json-ld',
        };
      }
    } catch {
      // Invalid JSON, continue
    }
  }

  return null;
}

/**
 * Extract manufacturer from meta tags
 */
function extractFromMetaTags(): ExtractedManufacturer | null {
  // Check for og:brand meta tag
  const ogBrand = document.querySelector('meta[property="og:brand"]');
  if (ogBrand) {
    const content = ogBrand.getAttribute('content');
    if (content && content.length > 0) {
      return {
        name: content,
        confidence: 'high',
        source: 'meta-tag',
      };
    }
  }

  // Check for product:brand meta tag
  const productBrand = document.querySelector('meta[property="product:brand"]');
  if (productBrand) {
    const content = productBrand.getAttribute('content');
    if (content && content.length > 0) {
      return {
        name: content,
        confidence: 'high',
        source: 'meta-tag',
      };
    }
  }

  // Check for itemprop brand
  const itempropBrand = document.querySelector('meta[itemprop="brand"]');
  if (itempropBrand) {
    const content = itempropBrand.getAttribute('content');
    if (content && content.length > 0) {
      return {
        name: content,
        confidence: 'high',
        source: 'meta-tag',
      };
    }
  }

  return null;
}

/**
 * Extract manufacturer from a microdata brand element
 */
function extractFromItemprop(): ExtractedManufacturer | null {
  const el = document.querySelector('[itemprop="brand"]');
  if (!el) return null;

  const nested = el.querySelector('[itemprop="name"]');
  const candidates = [
    el.getAttribute('content'),
    el.getAttribute('data-brand'),
    nested?.getAttribute('content') ?? nested?.textContent,
    el.textContent,
  ];

  for (const candidate of candidates) {
    const text = candidate?.trim();
    if (text && text.length > 1 && text.length <= 50) {
      return { name: text, confidence: 'medium', source: 'dom-element' };
    }
  }

  return null;
}

/**
 * Some storefronts (DWR) publish the brand only as a catalog slug inside an
 * inline bootstrap script: {"brand":"brands-herman-miller"}. Only the
 * `brands-` prefixed form is accepted — bare `"brand":"…"` values on other
 * sites are opaque internal ids (1stDibs emits `"brand":"f_8350"`).
 */
const BRAND_SLUG_PATTERN = /"brand"\s*:\s*"brands-([a-z0-9]+(?:-[a-z0-9]+)*)"/;

/** Slugs whose real name title-casing would mangle. */
const BRAND_SLUG_NAMES: Record<string, string> = {
  'b-b-italia': 'B&B Italia',
  'rh-modern': 'RH Modern',
  cb2: 'CB2',
  hay: 'HAY',
  dwr: 'Design Within Reach',
};

function brandNameFromSlug(slug: string): string {
  const known = BRAND_SLUG_NAMES[slug];
  if (known) return known;
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractFromInlineScript(): ExtractedManufacturer | null {
  for (const script of document.querySelectorAll('script')) {
    const text = script.textContent;
    if (!text || !text.includes('"brand"')) continue;
    const match = text.match(BRAND_SLUG_PATTERN);
    if (match) {
      return {
        name: brandNameFromSlug(match[1]),
        confidence: 'medium',
        source: 'inline-script',
      };
    }
  }
  return null;
}

/**
 * Extract the brand the page itself declares, in source-precedence order.
 *
 * CL-R12: this never falls back to the domain, so a multi-brand retailer with
 * no brand markup yields null rather than reporting itself as the maker. On a
 * direct-to-consumer maker site the brand legitimately equals the retailer —
 * that case is kept here (only extractManufacturerFromPage nulls it out).
 */
export function extractPageBrand(): ExtractedManufacturer | null {
  const extractors = [
    extractFromJsonLd,
    extractFromMetaTags,
    extractFromItemprop,
    extractFromInlineScript,
  ];

  for (const extractor of extractors) {
    const result = extractor();
    if (result) return result;
  }

  return null;
}

/**
 * Extract manufacturer from product page
 * Returns null if manufacturer is same as retailer (direct brand site)
 */
export function extractManufacturerFromPage(pageUrl: string): ExtractedManufacturer | null {
  const result = extractPageBrand();
  if (!result) return null;

  // Same as retailer - this is a direct brand site, no separate manufacturer
  const retailerName = getKnownRetailerName(pageUrl);
  if (retailerName && result.name.toLowerCase() === retailerName.toLowerCase()) {
    return null;
  }

  return result;
}

/**
 * Check if the current page is a direct brand site (not a multi-brand retailer)
 * Direct brand sites sell only their own products
 */
export function isDirectBrandSite(pageUrl: string): boolean {
  const manufacturer = extractManufacturerFromPage(pageUrl);
  // If we found no manufacturer, it might be a direct brand site
  // Or if manufacturer matches retailer
  return manufacturer === null;
}
