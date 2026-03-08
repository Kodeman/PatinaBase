/**
 * Manufacturer extraction from product data
 * Extracts the brand/manufacturer distinct from the retailer
 */

import type { VendorMatchConfidence } from '@patina/shared';
import { getKnownRetailerName } from './retailer';

export interface ExtractedManufacturer {
  name: string;
  confidence: VendorMatchConfidence;
  source: 'json-ld' | 'meta-tag' | 'title-pattern' | 'dom-element';
}

/**
 * Find brand/manufacturer in JSON-LD structured data
 */
function findBrandInJsonLd(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Check for Product type with brand or manufacturer
  if (obj['@type'] === 'Product') {
    // Check brand field
    const brand = obj.brand;
    if (typeof brand === 'string' && brand.length > 0) {
      return brand;
    }
    if (typeof brand === 'object' && brand !== null) {
      const brandObj = brand as Record<string, unknown>;
      if (typeof brandObj.name === 'string') {
        return brandObj.name;
      }
    }

    // Check manufacturer field
    const manufacturer = obj.manufacturer;
    if (typeof manufacturer === 'string' && manufacturer.length > 0) {
      return manufacturer;
    }
    if (typeof manufacturer === 'object' && manufacturer !== null) {
      const mfgObj = manufacturer as Record<string, unknown>;
      if (typeof mfgObj.name === 'string') {
        return mfgObj.name;
      }
    }
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
 * Extract manufacturer from "by [Brand]" pattern in product title
 */
function extractFromTitlePattern(): ExtractedManufacturer | null {
  // Get product title from various sources
  const titleSources = [
    document.querySelector('h1')?.textContent,
    document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    document.querySelector('.product-title')?.textContent,
    document.querySelector('[itemprop="name"]')?.textContent,
  ];

  // Patterns for brand extraction from title
  const byPatterns = [
    /\bby\s+([A-Z][A-Za-z0-9\s&'-]+?)(?:\s*[-|–—]|\s*$)/i,  // "Chair by West Elm"
    /\bfrom\s+([A-Z][A-Za-z0-9\s&'-]+?)(?:\s*[-|–—]|\s*$)/i, // "Chair from West Elm"
    /^([A-Z][A-Za-z0-9\s&'-]+?)\s+[-|–—]\s+/,               // "West Elm - Chair Name"
  ];

  for (const title of titleSources) {
    if (!title) continue;

    for (const pattern of byPatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const brandName = match[1].trim();
        // Validate: not too short, not too long, not a generic word
        if (
          brandName.length >= 2 &&
          brandName.length <= 50 &&
          !/^(the|a|an|new|sale|shop|buy)$/i.test(brandName)
        ) {
          return {
            name: brandName,
            confidence: 'medium',
            source: 'title-pattern',
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extract manufacturer from DOM elements with brand-related classes/attributes
 */
function extractFromDomElements(): ExtractedManufacturer | null {
  const brandSelectors = [
    '[itemprop="brand"]',
    '.product-brand',
    '.brand-name',
    '[class*="brand"]',
    '[data-brand]',
    '.manufacturer',
    '[class*="manufacturer"]',
    '.vendor-name',
  ];

  for (const selector of brandSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        // Check data attribute first
        const dataBrand = el.getAttribute('data-brand');
        if (dataBrand && dataBrand.length > 0) {
          return {
            name: dataBrand,
            confidence: 'medium',
            source: 'dom-element',
          };
        }

        // Check text content
        const text = el.textContent?.trim();
        if (text && text.length > 1 && text.length < 50) {
          return {
            name: text,
            confidence: 'medium',
            source: 'dom-element',
          };
        }
      }
    } catch {
      // Invalid selector, continue
    }
  }

  return null;
}

/**
 * Extract manufacturer from product page
 * Returns null if manufacturer is same as retailer (direct brand site)
 */
export function extractManufacturerFromPage(pageUrl: string): ExtractedManufacturer | null {
  // Try extraction methods in priority order
  const extractors = [
    extractFromJsonLd,
    extractFromMetaTags,
    extractFromTitlePattern,
    extractFromDomElements,
  ];

  for (const extractor of extractors) {
    const result = extractor();
    if (result) {
      // Check if manufacturer is same as retailer (direct brand site)
      const retailerName = getKnownRetailerName(pageUrl);
      if (retailerName && result.name.toLowerCase() === retailerName.toLowerCase()) {
        // Same as retailer - this is a direct brand site, no separate manufacturer
        return null;
      }

      return result;
    }
  }

  return null;
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
