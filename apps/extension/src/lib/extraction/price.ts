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
// token: a dollar sign, then 1-3 digits, then only comma-grouped thousands and
// an optional 2-decimal cents part. The looser PRICE_PATTERNS entry matches
// regex backreferences like the `$1$2s` token Instagram ships in its script
// payloads.
const STRICT_DOLLAR_PATTERN = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?![\d,])/;

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

/**
 * Body text with <script>/<style>/<noscript>/<template> content removed.
 *
 * A real browser's innerText already excludes those; the jsdom polyfill used
 * by the fixture suite aliases innerText to textContent, which does not — and
 * script payloads carry money-shaped tokens (Instagram ships a `$1$2s` regex
 * backreference). Walking text nodes keeps both environments honest.
 */
function visibleBodyText(): string {
  const body = document.body;
  if (!body) return '';

  const skipped = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || skipped.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
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

/**
 * Find price in JSON-LD structured data
 */
function findPriceInJsonLd(data: unknown): ExtractedPrice | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Check for Product schema
  if (obj['@type'] === 'Product' || obj['@type'] === 'Offer') {
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
