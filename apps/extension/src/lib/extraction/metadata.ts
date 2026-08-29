/**
 * Metadata extraction (product name, manufacturer) from web pages
 */

import { RETAILER_MAP } from './retailer';

/**
 * Extract the site operator's display name from a URL.
 *
 * CL-R12: this is a *retailer* name, not a brand — extraction/index.ts no
 * longer uses it for ExtractedProductData.manufacturer.
 */
export function extractManufacturer(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');

    // Check known retailers
    for (const [domain, name] of Object.entries(RETAILER_MAP)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return name;
      }
    }

    // Try to extract from subdomain or domain
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // Get the main domain name (e.g., "westelm" from "www.westelm.com")
      const mainPart = parts[parts.length - 2];
      // Capitalize and return
      return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
    }
  } catch {
    // Invalid URL
  }

  return null;
}

/**
 * Clean product name by removing common suffixes
 */
function cleanProductName(name: string): string {
  return name
    // Remove site name suffixes
    .replace(/\s*[-|–—]\s*(Room & Board|West Elm|CB2|Crate & Barrel|Article|Wayfair).*$/i, '')
    .replace(/\s*[-|–—]\s*\w+\.com.*$/i, '')
    // Remove common suffixes
    .replace(/\s*[-|]\s*Shop\s*$/i, '')
    .replace(/\s*[-|]\s*Buy\s*$/i, '')
    .replace(/\s*[-|]\s*Free Shipping\s*$/i, '')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract product name from DOM
 */
export function extractProductName(): string | null {
  // Priority order for product name sources

  // 1. OpenGraph title
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    const content = ogTitle.getAttribute('content');
    if (content && content.length > 3) {
      return cleanProductName(content);
    }
  }

  // 2. Twitter card title
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) {
    const content = twitterTitle.getAttribute('content');
    if (content && content.length > 3) {
      return cleanProductName(content);
    }
  }

  // 3. Product-specific H1
  const productH1Selectors = [
    'h1[itemprop="name"]',
    '.product-title h1',
    '.product-name h1',
    '[class*="product"] h1',
    '[data-product-name]',
    '.pdp-title',
    '.product-detail h1',
  ];

  for (const selector of productH1Selectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 3 && text.length < 200) {
          return cleanProductName(text);
        }
      }
    } catch {
      // Invalid selector
    }
  }

  // 4. First H1 on page
  const h1 = document.querySelector('h1');
  if (h1) {
    const text = h1.textContent?.trim();
    if (text && text.length > 3 && text.length < 200) {
      return cleanProductName(text);
    }
  }

  // 5. JSON-LD Product name
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const name = findNameInJsonLd(data);
      if (name) return cleanProductName(name);
    } catch {
      // Invalid JSON
    }
  }

  // 6. Document title (last resort)
  const title = document.title;
  if (title && title.length > 3) {
    return cleanProductName(title);
  }

  return null;
}

/**
 * Find product name in JSON-LD data
 */
function findNameInJsonLd(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Check for Product type
  if (obj['@type'] === 'Product' && typeof obj.name === 'string') {
    return obj.name;
  }

  // Recurse into arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      const name = findNameInJsonLd(item);
      if (name) return name;
    }
  } else {
    // Recurse into nested objects (e.g., @graph)
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const name = findNameInJsonLd(value);
        if (name) return name;
      }
    }
  }

  return null;
}

/**
 * Extract product description from page
 */
export function extractDescription(): string | null {
  // Priority 1: JSON-LD Product description
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const desc = findDescriptionInJsonLd(data);
      if (desc) return desc.slice(0, 1000);
    } catch {
      // Invalid JSON
    }
  }

  // Priority 2: OG description
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) {
    const content = ogDesc.getAttribute('content');
    if (content && content.length > 10) {
      return content.slice(0, 1000);
    }
  }

  // Priority 3: Meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    const content = metaDesc.getAttribute('content');
    if (content && content.length > 10) {
      return content.slice(0, 1000);
    }
  }

  // Priority 4: itemprop="description"
  const itemPropDesc = document.querySelector('[itemprop="description"]');
  if (itemPropDesc) {
    const text = itemPropDesc.textContent?.trim();
    if (text && text.length > 10) {
      return text.slice(0, 1000);
    }
  }

  return null;
}

/**
 * Find description in JSON-LD data
 */
function findDescriptionInJsonLd(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  if (obj['@type'] === 'Product' && typeof obj.description === 'string') {
    return obj.description;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const desc = findDescriptionInJsonLd(item);
      if (desc) return desc;
    }
  } else {
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const desc = findDescriptionInJsonLd(value);
        if (desc) return desc;
      }
    }
  }

  return null;
}

/**
 * Extract brand from page (distinct from retailer)
 */
export function extractBrand(): string | null {
  // Check meta tags
  const brandMeta = document.querySelector('meta[property="product:brand"], meta[itemprop="brand"]');
  if (brandMeta) {
    const content = brandMeta.getAttribute('content');
    if (content) return content;
  }

  // Check JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const brand = findBrandInJsonLd(data);
      if (brand) return brand;
    } catch {
      // Invalid JSON
    }
  }

  // Check for brand in DOM
  const brandSelectors = [
    '[itemprop="brand"]',
    '.product-brand',
    '[class*="brand"]',
    '[data-brand]',
  ];

  for (const selector of brandSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 1 && text.length < 50) {
          return text;
        }
      }
    } catch {
      // Invalid selector
    }
  }

  return null;
}

// ─── SKU / model number (CL-R1) ────────────────────────────────────────────

const MAX_SKU_LENGTH = 64;

/**
 * A usable SKU string, or null. Anything longer than 64 characters is a
 * description or a serialized blob, not a part number.
 */
function cleanSku(value: unknown, stripSkuPrefix = false): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let text = String(value).trim();
  if (stripSkuPrefix) text = text.replace(/^sku:\s*/i, '').trim();
  if (!text || text.length > MAX_SKU_LENGTH) return null;
  return text;
}

/** sku → mpn → productID, on one schema.org node. */
function skuFromKeys(node: Record<string, unknown>): string | null {
  return (
    cleanSku(node.sku) ??
    cleanSku(node.mpn) ??
    cleanSku(node.productID, true)
  );
}

/** JSON-LD `@type` is a string or an array of strings (mirrors price.ts). */
function skuSchemaTypes(obj: Record<string, unknown>): string[] {
  const type = obj['@type'];
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string');
  return [];
}

/** Every URL a variant advertises: its own, plus any on its offers (mirrors price.ts). */
function variantUrls(variant: Record<string, unknown>): string[] {
  const urls: string[] = [];
  if (typeof variant.url === 'string') urls.push(variant.url);
  const offers = variant.offers;
  const offerList = Array.isArray(offers) ? offers : [offers];
  for (const offer of offerList) {
    if (offer && typeof offer === 'object') {
      const url = (offer as Record<string, unknown>).url;
      if (typeof url === 'string') urls.push(url);
    }
  }
  return urls;
}

/**
 * Mirrors price.ts's ProductGroup variant rule (its helpers are module-private):
 * a variant addresses this page when its URL shares the pathname and either
 * carries no query of its own or repeats the page's — variants are usually
 * distinguished by a `?sku=` the address bar carries once one is selected.
 */
function addressesPage(url: string, here: string): boolean {
  try {
    const candidate = new URL(url, here);
    const current = new URL(here);
    if (candidate.pathname !== current.pathname) return false;
    return candidate.search === '' || candidate.search === current.search;
  } catch {
    return false;
  }
}

function skuFromProductNode(node: Record<string, unknown>, here: string): string | null {
  if (skuSchemaTypes(node).includes('ProductGroup') && Array.isArray(node.hasVariant)) {
    for (const entry of node.hasVariant) {
      if (!entry || typeof entry !== 'object') continue;
      const variant = entry as Record<string, unknown>;
      if (!variantUrls(variant).some((url) => addressesPage(url, here))) continue;
      const sku = skuFromKeys(variant);
      if (sku) return sku;
    }
  }
  return skuFromKeys(node);
}

function findSkuInJsonLd(data: unknown, here: string): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;
  const types = skuSchemaTypes(obj);

  if (types.includes('Product') || types.includes('ProductGroup')) {
    const sku = skuFromProductNode(obj, here);
    if (sku) return sku;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const sku = findSkuInJsonLd(item, here);
      if (sku) return sku;
    }
    return null;
  }

  // Recurse into nested objects (e.g. @graph) but never into hasVariant: an
  // unselected variant's SKU belongs to a size or colour the page isn't showing.
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'hasVariant') continue;
    if (typeof value === 'object' && value !== null) {
      const sku = findSkuInJsonLd(value, here);
      if (sku) return sku;
    }
  }

  return null;
}

/**
 * Extract the product's SKU / model number (CL-R1).
 *
 * JSON-LD Product/ProductGroup first (sku → mpn → productID), then the
 * OpenGraph product tag, then microdata.
 */
export function extractSku(doc: Document): string | null {
  const here = doc.defaultView?.location?.href ?? doc.baseURI;

  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const sku = findSkuInJsonLd(JSON.parse(script.textContent || ''), here);
      if (sku) return sku;
    } catch {
      // Invalid JSON
    }
  }

  const metaSku = cleanSku(
    doc.querySelector('meta[property="product:retailer_item_id"]')?.getAttribute('content')
  );
  if (metaSku) return metaSku;

  const itemprop = doc.querySelector('[itemprop="sku"]');
  if (itemprop) {
    return cleanSku(itemprop.getAttribute('content')) ?? cleanSku(itemprop.textContent);
  }

  return null;
}

/**
 * Find brand in JSON-LD data
 */
function findBrandInJsonLd(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  if (obj['@type'] === 'Product') {
    const brand = obj.brand;
    if (typeof brand === 'string') return brand;
    if (typeof brand === 'object' && brand !== null) {
      const brandObj = brand as Record<string, unknown>;
      if (typeof brandObj.name === 'string') return brandObj.name;
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const brand = findBrandInJsonLd(item);
      if (brand) return brand;
    }
  } else {
    // Recurse into nested objects (e.g., @graph)
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const brand = findBrandInJsonLd(value);
        if (brand) return brand;
      }
    }
  }

  return null;
}
