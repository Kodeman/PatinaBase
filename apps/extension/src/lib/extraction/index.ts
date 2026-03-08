/**
 * Product extraction orchestrator
 */

import type {
  ExtractedProductData,
  ExtractionConfidence,
  PageMode,
  PageModeSignals,
  ExtendedExtractedProductData,
  ExtractedProductVendors,
  VendorDetectionResult,
} from '@patina/shared';
import { extractPriceFromDOM } from './price';
import { extractDimensionsFromDOM } from './dimensions';
import { extractMaterialsFromDOM } from './materials';
import { extractColorFinishFromDOM } from './color-finish';
import { extractImagesFromDOM } from './images';
import { extractProductName, extractDescription, extractManufacturer, extractBrand } from './metadata';
import { extractRetailer, isKnownRetailer, RETAILER_MAP } from './retailer';
import { extractManufacturerFromPage } from './manufacturer';
import { extractVendorData } from './vendor';

/**
 * Detect page mode signals from the current page
 */
export function detectPageModeSignals(): PageModeSignals {
  // Check for Product JSON-LD schema
  let hasProductSchema = false;
  let hasOrganizationSchema = false;

  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const types = findSchemaTypes(data);
      if (types.includes('Product')) hasProductSchema = true;
      if (types.includes('Organization') || types.includes('Corporation') || types.includes('LocalBusiness')) {
        hasOrganizationSchema = true;
      }
    } catch {
      // Invalid JSON
    }
  }

  // Check for Add to Cart button
  const addToCartSelectors = [
    'button[data-add-to-cart]',
    'button[class*="add-to-cart"]',
    'button[class*="addtocart"]',
    'button[id*="add-to-cart"]',
    '[class*="buy-now"]',
    '[class*="add-to-bag"]',
    'form[action*="cart"] button[type="submit"]',
    'input[value*="Add to Cart" i]',
    'button:not([disabled])',
  ];

  let hasAddToCart = false;
  for (const selector of addToCartSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent?.toLowerCase() || '';
        if (
          text.includes('add to cart') ||
          text.includes('add to bag') ||
          text.includes('buy now') ||
          text.includes('add to basket')
        ) {
          hasAddToCart = true;
          break;
        }
      }
      if (hasAddToCart) break;
    } catch {
      // Invalid selector
    }
  }

  // Check for price indicators
  const hasPrice = extractPriceFromDOM() !== null;

  // Check if this is an About page
  const pathname = window.location.pathname.toLowerCase();
  const isAboutPage =
    pathname.includes('/about') ||
    pathname.includes('/our-story') ||
    pathname.includes('/company') ||
    pathname.includes('/who-we-are');

  return {
    hasProductSchema,
    hasAddToCart,
    hasPrice,
    isAboutPage,
    hasOrganizationSchema,
  };
}

/**
 * Find all @type values in JSON-LD data
 */
function findSchemaTypes(data: unknown): string[] {
  const types: string[] = [];

  if (!data || typeof data !== 'object') return types;

  const obj = data as Record<string, unknown>;

  if (typeof obj['@type'] === 'string') {
    types.push(obj['@type']);
  } else if (Array.isArray(obj['@type'])) {
    types.push(...(obj['@type'] as string[]));
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      types.push(...findSchemaTypes(item));
    }
  }

  return types;
}

/**
 * Detect the page mode based on signals
 */
export function detectPageMode(): PageMode {
  const signals = detectPageModeSignals();

  // Strong product indicators
  const productScore =
    (signals.hasProductSchema ? 3 : 0) +
    (signals.hasAddToCart ? 3 : 0) +
    (signals.hasPrice ? 2 : 0);

  // Strong vendor/about indicators
  const vendorScore =
    (signals.isAboutPage ? 3 : 0) +
    (signals.hasOrganizationSchema ? 2 : 0);

  // Determine mode
  if (productScore >= 4 && productScore > vendorScore) {
    return 'product';
  }
  if (vendorScore >= 3 && vendorScore > productScore) {
    return 'vendor';
  }
  if (productScore > 0 && vendorScore > 0) {
    return 'ambiguous';
  }
  // Default to product if we have any product signals
  if (productScore > 0) {
    return 'product';
  }

  return 'ambiguous';
}

/**
 * Calculate confidence score based on extraction results
 */
function calculateConfidence(data: Partial<ExtractedProductData>): ExtractionConfidence {
  let score = 0;

  // Product name is essential
  if (data.productName) score += 25;

  // Price is important
  if (data.price) score += 25;

  // Images are critical
  if (data.images && data.images.length > 0) score += 20;
  if (data.images && data.images.length >= 3) score += 10;

  // Dimensions add value
  if (data.dimensions) score += 10;

  // Materials add value
  if (data.materials && data.materials.length > 0) score += 5;

  // Colors add value
  if (data.colors && data.colors.length > 0) score += 3;

  // Finish adds value
  if (data.finish) score += 2;

  // Manufacturer adds value
  if (data.manufacturer) score += 5;

  // Determine confidence level
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Extract vendor information for product context
 */
function extractProductVendors(url: string): ExtractedProductVendors {
  // Extract retailer (the site we're on)
  const retailer = extractRetailer(url);

  const retailerDetection: VendorDetectionResult = {
    confidence: retailer.confidence,
    matchedVendor: null, // Would be populated by matching against DB
    suggestions: [],
    extractedData: null,
  };

  // Extract manufacturer (if different from retailer)
  const manufacturer = extractManufacturerFromPage(url);

  let manufacturerResult: ExtractedProductVendors['manufacturer'] = null;

  if (manufacturer) {
    const manufacturerDetection: VendorDetectionResult = {
      confidence: manufacturer.confidence,
      matchedVendor: null, // Would be populated by matching against DB
      suggestions: [],
      extractedData: null,
    };

    manufacturerResult = {
      name: manufacturer.name,
      detection: manufacturerDetection,
    };
  }

  return {
    retailer: {
      name: retailer.name,
      website: retailer.website,
      detection: retailerDetection,
    },
    manufacturer: manufacturerResult,
  };
}

/**
 * Extract all product data from current page
 */
export async function extractProductData(url: string): Promise<ExtractedProductData> {
  // Run all extractions
  const [productName, description, price, dimensions, materials, colorFinish, images, brand] = await Promise.all([
    Promise.resolve(extractProductName()),
    Promise.resolve(extractDescription()),
    Promise.resolve(extractPriceFromDOM()),
    Promise.resolve(extractDimensionsFromDOM()),
    Promise.resolve(extractMaterialsFromDOM()),
    Promise.resolve(extractColorFinishFromDOM()),
    Promise.resolve(extractImagesFromDOM(url)),
    Promise.resolve(extractBrand()),
  ]);

  // Get manufacturer (from URL or brand)
  const manufacturer = extractManufacturer(url) || brand;

  // Get primary finish if available
  const primaryFinish = colorFinish.finishes.length > 0 ? colorFinish.finishes[0] : null;

  const data: ExtractedProductData = {
    productName,
    description,
    price,
    dimensions,
    materials,
    colors: colorFinish.colors.length > 0 ? colorFinish.colors : null,
    finish: primaryFinish,
    availableColors: colorFinish.availableColors.length > 0 ? colorFinish.availableColors : null,
    images,
    manufacturer,
    url,
    extractedAt: new Date().toISOString(),
    confidence: 'low', // Will be calculated
  };

  // Calculate confidence
  data.confidence = calculateConfidence(data);

  return data;
}

/**
 * Extract extended product data including vendor information
 */
export async function extractExtendedProductData(url: string): Promise<ExtendedExtractedProductData> {
  // Detect page mode
  const pageMode = detectPageMode();

  // Run base extraction
  const baseData = await extractProductData(url);

  // Extract vendor information
  const vendors = extractProductVendors(url);

  return {
    ...baseData,
    pageMode,
    vendors,
  };
}

/**
 * Quick extraction for preview (faster, less thorough)
 */
export function extractQuickPreview(url: string): Partial<ExtractedProductData> {
  return {
    productName: extractProductName(),
    description: extractDescription(),
    price: extractPriceFromDOM(),
    images: extractImagesFromDOM(url).slice(0, 5),
    manufacturer: extractManufacturer(url),
    url,
    extractedAt: new Date().toISOString(),
  };
}

// Re-export individual extractors for direct use
export { extractPriceFromDOM } from './price';
export { extractDimensionsFromDOM } from './dimensions';
export { extractMaterialsFromDOM, getMaterialCategory } from './materials';
export { extractColorFinishFromDOM } from './color-finish';
export { extractImagesFromDOM } from './images';
export { extractProductName, extractDescription, extractManufacturer, extractBrand } from './metadata';

// Export new vendor extractors
export { extractRetailer, isKnownRetailer, RETAILER_MAP } from './retailer';
export { extractManufacturerFromPage, isDirectBrandSite } from './manufacturer';
export { extractVendorData } from './vendor';
