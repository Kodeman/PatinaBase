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

// Selectors commonly used for prices (sale/current prices first for priority)
const PRICE_SELECTORS = [
  '[data-price]',
  '[itemprop="price"]',
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
 * Extract price from DOM elements
 */
export function extractPriceFromDOM(): ExtractedPrice | null {
  // Check meta tags first (Shopify and many platforms emit these)
  const metaPrice = document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content');
  const metaCurrency = document.querySelector('meta[property="product:price:currency"]')?.getAttribute('content');
  if (metaPrice) {
    const value = parseFloat(metaPrice);
    if (!isNaN(value) && value > 0) {
      console.log(`[Patina] Price from meta tag: ${value} ${metaCurrency || 'USD'}`);
      return {
        value: Math.round(value * 100),
        currency: metaCurrency || 'USD',
        raw: metaPrice,
      };
    }
  }

  // Try specific selectors first
  for (const selector of PRICE_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        // Skip elements that look like original/was prices
        const className = (el.className || '').toLowerCase();
        if (SKIP_PRICE_CLASSES.some(cls => className.includes(cls))) continue;

        // Check data attributes first
        const dataPrice = el.getAttribute('data-price') ||
                         el.getAttribute('data-product-price') ||
                         el.getAttribute('content');
        if (dataPrice) {
          const value = parseFloat(dataPrice);
          if (!isNaN(value) && value > 0) {
            return {
              value: Math.round(value * 100),
              currency: 'USD',
              raw: dataPrice,
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
                value: Math.round(lowValue * 100),
                currency: 'USD',
                raw: rangeMatch[0],
              };
            }
          }

          // Check for "From $X" pattern
          const fromMatch = text.match(FROM_PRICE_PATTERN);
          if (fromMatch) {
            const fromValue = parseFloat(fromMatch[1].replace(/,/g, ''));
            if (!isNaN(fromValue) && fromValue > 0) {
              return {
                value: Math.round(fromValue * 100),
                currency: 'USD',
                raw: fromMatch[0],
              };
            }
          }

          const price = extractPriceFromString(text);
          if (price) return price;
        }
      }
    } catch {
      // Selector might be invalid, continue
    }
  }

  // Try structured data (JSON-LD)
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

  // Fallback: scan visible text for price patterns
  const bodyText = document.body.innerText;
  const lines = bodyText.split('\n').slice(0, 100); // Limit to first 100 lines
  for (const line of lines) {
    // Try range prices in body text
    const rangeMatch = line.match(RANGE_PRICE_PATTERN);
    if (rangeMatch) {
      const lowValue = parseFloat(rangeMatch[1].replace(/,/g, ''));
      if (!isNaN(lowValue) && lowValue >= 1 && lowValue <= 100000) {
        return { value: Math.round(lowValue * 100), currency: 'USD', raw: rangeMatch[0] };
      }
    }

    const price = extractPriceFromString(line);
    if (price && price.value >= 100 && price.value <= 10000000) { // $1 - $100,000
      return price;
    }
  }

  return null;
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
      for (const offer of offers) {
        const price = extractOfferPrice(offer as Record<string, unknown>);
        if (price) return price;
      }
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
