/**
 * Price extraction from web pages
 */

import type { ExtractedPrice } from '@patina/shared';

// Currency symbols and their codes
const CURRENCY_MAP: Record<string, string> = {
  '$': 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '¥': 'JPY',
  'C$': 'CAD',
  'A$': 'AUD',
};

// Price patterns for different formats
const PRICE_PATTERNS = [
  // US Dollar formats: $1,234.56 or $1234.56 or $1,234
  /\$\s*([\d,]+(?:\.\d{2})?)/,
  // USD prefix/suffix: USD 1234.56 or 1234.56 USD
  /USD\s*([\d,]+(?:\.\d{2})?)/i,
  /([\d,]+(?:\.\d{2})?)\s*USD/i,
  // British Pound: £1,234.56
  /£\s*([\d,]+(?:\.\d{2})?)/,
  // Euro: €1.234,56 or €1234,56 or €1,234.56
  /€\s*([\d.]+,\d{2})/,
  /€\s*([\d,]+(?:\.\d{2})?)/,
  // Generic with decimal: 1,234.56 or 1234.56 (fallback)
  /(?:price|cost|total)[:\s]*\$?\s*([\d,]+\.\d{2})/i,
];

// Range price pattern: $1,200 - $1,800 or $1,200-$1,800 or From $1,200
const RANGE_PRICE_PATTERN = /\$\s*([\d,]+(?:\.\d{2})?)\s*[-–—]\s*\$\s*([\d,]+(?:\.\d{2})?)/;
const FROM_PRICE_PATTERN = /(?:from|starting\s+at)\s+\$\s*([\d,]+(?:\.\d{2})?)/i;

// Selectors that indicate original/struck-through prices (skip these)
const SKIP_PRICE_CLASSES = [
  'was', 'compare', 'original', 'regular', 'list-price', 'strikethrough',
  'crossed-out', 'old-price', 'msrp', 'retail-price',
];

// Body-text scanning is the weakest source, so it demands a well-formed money
// token: either comma-grouped thousands ($1,499.00) or an unseparated amount
// ($1499, $1499.00, $999999), each with an optional 2-decimal cents part and
// no trailing digit or comma. Half-grouped junk like `$1,23456` is rejected.
// This is a well-formedness guard, not the defence against Instagram's `$1$2s`
// backreference token — that lives in a <script>, and visibleBodyText() is
// what keeps script text out of the scan.
export const STRICT_DOLLAR_PATTERN =
  /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{1,7}(?:\.\d{2})?)(?![\d,])/;

// Selectors commonly used for prices (sale/current prices first for priority)
const PRICE_SELECTORS = [
  '[data-price]',
  '[itemprop="price"]',
  '[data-test-id*="price" i]',
  '[data-testid*="price" i]',
  '.sale-price',
  '.final-price',
  '.current-price',
  '[class*="sale-price"]',
  '[class*="special-price"]',
  '[class*="current-price"]',
  '[class*="offer-price"]',
  '[class*="price"]:not([class*="compare"]):not([class*="was"]):not([class*="original"]):not([class*="regular"]):not([class*="list-price"]):not([class*="strikethrough"])',
  '.product-price',
  '#price',
  '[data-product-price]',
];

/**
 * Extract price from a string
 */
function extractPriceFromString(text: string): ExtractedPrice | null {
  for (const pattern of PRICE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[0];
      let valueStr = match[1];

      // Determine currency
      let currency = 'USD';
      for (const [symbol, code] of Object.entries(CURRENCY_MAP)) {
        if (raw.includes(symbol)) {
          currency = code;
          break;
        }
      }

      // Parse the numeric value
      // Handle European format (1.234,56) vs US format (1,234.56)
      if (currency === 'EUR' && valueStr.includes(',')) {
        valueStr = valueStr.replace(/\./g, '').replace(',', '.');
      } else {
        valueStr = valueStr.replace(/,/g, '');
      }

      const value = parseFloat(valueStr);
      if (!isNaN(value) && value > 0) {
        return {
          value: Math.round(value * 100), // Convert to cents
          currency,
          raw,
        };
      }
    }
  }
  return null;
}

/**
 * Where a price came from. Body-text scanning is a last-resort regex over the
 * whole page and is treated as weaker evidence by confidence scoring.
 */
export type PriceSource = 'meta-tag' | 'json-ld' | 'dom-attribute' | 'dom-text' | 'body-text';

export interface PriceWithSource {
  price: ExtractedPrice;
  source: PriceSource;
}

function extractFromMetaTag(): ExtractedPrice | null {
  const metaPrice = document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content');
  const metaCurrency = document.querySelector('meta[property="product:price:currency"]')?.getAttribute('content');
  if (!metaPrice) return null;
  const value = parseFloat(metaPrice);
  if (isNaN(value) || value <= 0) return null;
  return {
    value: Math.round(value * 100),
    currency: metaCurrency || 'USD',
    raw: metaPrice,
  };
}

function extractFromJsonLd(): ExtractedPrice | null {
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const price = findPriceInJsonLd(data);
      if (price) return price;
    } catch {
      // Invalid JSON, continue
    }
  }
  return null;
}

/** True when an element's class or test-id marks it as a was/compare price. */
function isStruckThroughPrice(el: Element): boolean {
  const markers = [
    el.className || '',
    el.getAttribute('data-test-id') || '',
    el.getAttribute('data-testid') || '',
  ]
    .join(' ')
    .toLowerCase();
  return SKIP_PRICE_CLASSES.some((cls) => markers.includes(cls));
}

function extractFromPriceSelectors(): PriceWithSource | null {
  for (const selector of PRICE_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (isStruckThroughPrice(el)) continue;

        // Check data attributes first
        const dataPrice = el.getAttribute('data-price') ||
                         el.getAttribute('data-product-price') ||
                         el.getAttribute('content');
        if (dataPrice) {
          const value = parseFloat(dataPrice);
          if (!isNaN(value) && value > 0) {
            return {
              price: { value: Math.round(value * 100), currency: 'USD', raw: dataPrice },
              source: 'dom-attribute',
            };
          }
        }

        // Check text content
        const text = el.textContent?.trim();
        if (text) {
          // Check for range prices first
          const rangeMatch = text.match(RANGE_PRICE_PATTERN);
          if (rangeMatch) {
            const lowValue = parseFloat(rangeMatch[1].replace(/,/g, ''));
            if (!isNaN(lowValue) && lowValue > 0) {
              return {
                price: { value: Math.round(lowValue * 100), currency: 'USD', raw: rangeMatch[0] },
                source: 'dom-text',
              };
            }
          }

          // Check for "From $X" pattern
          const fromMatch = text.match(FROM_PRICE_PATTERN);
          if (fromMatch) {
            const fromValue = parseFloat(fromMatch[1].replace(/,/g, ''));
            if (!isNaN(fromValue) && fromValue > 0) {
              return {
                price: { value: Math.round(fromValue * 100), currency: 'USD', raw: fromMatch[0] },
                source: 'dom-text',
              };
            }
          }

          const price = extractPriceFromString(text);
          if (price) return { price, source: 'dom-text' };
        }
      }
    } catch {
      // Selector might be invalid, continue
    }
  }
  return null;
}

/** True for text a reader cannot see: hidden subtrees and display/visibility off. */
function isHiddenFromReader(el: Element): boolean {
  try {
    if (el.closest('[hidden], [aria-hidden="true"]')) return true;
  } catch {
    // Selector unsupported in this document — fall through to style checks.
  }

  // jsdom's getComputedStyle only resolves inline styles, so this catches the
  // common `style="display:none"` case without pretending to be a layout engine.
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    } catch {
      // Not styleable in this environment — treat as visible.
    }
  }

  return false;
}

/**
 * Body text with <script>/<style>/<noscript>/<template> and reader-hidden
 * content removed.
 *
 * A real browser's innerText already excludes those; the jsdom polyfill used
 * by the fixture suite aliases innerText to textContent, which does not — and
 * script payloads carry money-shaped tokens (Instagram ships a `$1$2s` regex
 * backreference), while hidden clearance/promo banners carry real-looking
 * prices that are not this product's. Walking text nodes keeps both
 * environments honest.
 */
function visibleBodyText(): string {
  const body = document.body;
  if (!body) return '';

  const skipped = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || skipped.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (isHiddenFromReader(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const lines: string[] = [];
  let node = walker.nextNode();
  while (node && lines.length < 400) {
    const text = node.nodeValue?.trim();
    if (text) lines.push(text);
    node = walker.nextNode();
  }
  return lines.join('\n');
}

function extractFromBodyText(): ExtractedPrice | null {
  const lines = visibleBodyText().split('\n');
  for (const line of lines) {
    // Try range prices in body text
    const rangeMatch = line.match(RANGE_PRICE_PATTERN);
    if (rangeMatch) {
      const lowValue = parseFloat(rangeMatch[1].replace(/,/g, ''));
      if (!isNaN(lowValue) && lowValue >= 1 && lowValue <= 100000) {
        return { value: Math.round(lowValue * 100), currency: 'USD', raw: rangeMatch[0] };
      }
    }

    const match = line.match(STRICT_DOLLAR_PATTERN);
    if (!match) continue;
    const value = parseFloat(match[1].replace(/,/g, ''));
    if (isNaN(value)) continue;
    const cents = Math.round(value * 100);
    if (cents >= 100 && cents <= 10000000) { // $1 - $100,000
      return { value: cents, currency: 'USD', raw: match[0] };
    }
  }

  return null;
}

/**
 * Extract a price along with the source that produced it.
 *
 * CL-R13 precedence: published/structured prices (meta tag, JSON-LD) beat any
 * regex over rendered markup, so a nav promo like Wayfair's "Style it for
 * under $100" can no longer outrank the product's own price.
 */
export function extractPriceWithSource(): PriceWithSource | null {
  const metaPrice = extractFromMetaTag();
  if (metaPrice) return { price: metaPrice, source: 'meta-tag' };

  const jsonLdPrice = extractFromJsonLd();
  if (jsonLdPrice) return { price: jsonLdPrice, source: 'json-ld' };

  const selectorPrice = extractFromPriceSelectors();
  if (selectorPrice) return selectorPrice;

  const bodyPrice = extractFromBodyText();
  if (bodyPrice) return { price: bodyPrice, source: 'body-text' };

  return null;
}

/**
 * Extract price from DOM elements
 */
export function extractPriceFromDOM(): ExtractedPrice | null {
  return extractPriceWithSource()?.price ?? null;
}

/**
 * Pick the offer to price against.
 *
 * CL-R13: 1stDibs publishes one Offer per supported currency (CHF first, USD
 * seventh) — take the USD offer when there is one, then any offer that names
 * its currency, and only then the first priced offer.
 */
function pickOfferPrice(offers: unknown[]): ExtractedPrice | null {
  const priced: Array<{ currency: string; price: ExtractedPrice }> = [];

  for (const entry of offers) {
    if (!entry || typeof entry !== 'object') continue;
    const offer = entry as Record<string, unknown>;
    const price = extractOfferPrice(offer);
    if (!price) continue;
    const currency = typeof offer.priceCurrency === 'string' ? offer.priceCurrency.toUpperCase() : '';
    priced.push({ currency, price });
  }

  if (priced.length === 0) return null;

  const usd = priced.find((entry) => entry.currency === 'USD');
  if (usd) return usd.price;

  const explicit = priced.find((entry) => entry.currency.length > 0);
  return (explicit ?? priced[0]).price;
}

/** JSON-LD `@type` is a string or an array of strings. */
function schemaTypes(obj: Record<string, unknown>): string[] {
  const type = obj['@type'];
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string');
  return [];
}

/** Every URL a variant advertises: its own, plus any on its offers. */
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
 * True when a variant URL addresses the page we are on: same pathname, and
 * either no query of its own or the same query (variants are usually
 * distinguished by a `?sku=` the address bar carries when one is selected).
 */
function addressesCurrentPage(url: string): boolean {
  if (typeof window === 'undefined' || !window.location?.href) return false;
  try {
    const candidate = new URL(url, window.location.href);
    const here = new URL(window.location.href);
    if (candidate.pathname !== here.pathname) return false;
    return candidate.search === '' || candidate.search === here.search;
  } catch {
    return false;
  }
}

function variantPrice(variant: Record<string, unknown>): ExtractedPrice | null {
  const offers = variant.offers;
  if (Array.isArray(offers)) return pickOfferPrice(offers);
  if (offers && typeof offers === 'object') {
    return extractOfferPrice(offers as Record<string, unknown>);
  }
  return extractOfferPrice(variant);
}

/**
 * Price a ProductGroup by its variants.
 *
 * Prefer the variant whose URL addresses this page (a selected sku). West Elm's
 * Harris Sofa publishes ten size/bench variants that all share the page's
 * pathname and differ only by `?sku=`, so nothing is selected — for a size
 * configurator like that the honest capture is the floor of the range, which is
 * also what the range and "from $X" patterns take elsewhere in this file.
 */
function pickVariantPrice(variants: unknown[]): ExtractedPrice | null {
  const priced: Array<{ urls: string[]; price: ExtractedPrice }> = [];

  for (const entry of variants) {
    if (!entry || typeof entry !== 'object') continue;
    const variant = entry as Record<string, unknown>;
    const price = variantPrice(variant);
    if (price) priced.push({ urls: variantUrls(variant), price });
  }

  if (priced.length === 0) return null;

  const selected = priced.find((v) => v.urls.some(addressesCurrentPage));
  if (selected) return selected.price;

  return priced.reduce((low, v) => (v.price.value < low.price.value ? v : low)).price;
}

/**
 * Find price in JSON-LD structured data
 */
function findPriceInJsonLd(data: unknown): ExtractedPrice | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;
  const types = schemaTypes(obj);

  if (types.includes('ProductGroup') && Array.isArray(obj.hasVariant)) {
    const price = pickVariantPrice(obj.hasVariant);
    if (price) return price;
  }

  // Check for Product schema
  if (types.includes('Product') || types.includes('Offer')) {
    const offers = obj.offers || obj;
    if (Array.isArray(offers)) {
      const price = pickOfferPrice(offers);
      if (price) return price;
    } else if (typeof offers === 'object') {
      const price = extractOfferPrice(offers as Record<string, unknown>);
      if (price) return price;
    }
  }

  // Recurse into arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      const price = findPriceInJsonLd(item);
      if (price) return price;
    }
  }

  // Recurse into nested objects
  for (const value of Object.values(obj)) {
    if (typeof value === 'object') {
      const price = findPriceInJsonLd(value);
      if (price) return price;
    }
  }

  return null;
}

/**
 * Extract price from an Offer object
 */
function extractOfferPrice(offer: Record<string, unknown>): ExtractedPrice | null {
  const priceValue = offer.price || offer.lowPrice;
  const currency = (offer.priceCurrency as string) || 'USD';

  if (typeof priceValue === 'number' || typeof priceValue === 'string') {
    const value = parseFloat(String(priceValue));
    if (!isNaN(value) && value > 0) {
      return {
        value: Math.round(value * 100),
        currency,
        raw: String(priceValue),
      };
    }
  }

  return null;
}

export { extractPriceFromString };
