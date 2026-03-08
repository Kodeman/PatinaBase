/**
 * Color and finish extraction from web pages
 */

import type { ExtractedColor, ExtractedFinish } from '@patina/shared';

// Color keywords by category
const COLOR_KEYWORDS: Record<string, string[]> = {
  // Neutral colors
  neutral: [
    'black', 'white', 'gray', 'grey', 'charcoal', 'slate', 'cream', 'ivory',
    'beige', 'tan', 'taupe', 'sand', 'oatmeal', 'linen', 'off-white', 'bone',
  ],
  // Brown tones (common in furniture)
  brown: [
    'brown', 'cognac', 'caramel', 'espresso', 'chocolate', 'coffee', 'mocha',
    'chestnut', 'sienna', 'umber', 'saddle', 'tobacco', 'camel',
  ],
  // Wood tones (often used as colors)
  woodTone: [
    'walnut', 'oak', 'cherry', 'mahogany', 'ebony', 'natural', 'honey',
    'driftwood', 'weathered', 'whitewash', 'bleached',
  ],
  // Primary and accent colors
  color: [
    'navy', 'blue', 'green', 'sage', 'olive', 'forest', 'emerald', 'teal',
    'burgundy', 'wine', 'rust', 'terracotta', 'coral', 'blush', 'pink',
    'mustard', 'gold', 'silver', 'copper', 'bronze',
  ],
};

// Finish keywords by material type
const FINISH_KEYWORDS: Record<string, string[]> = {
  wood: [
    'matte', 'satin', 'gloss', 'glossy', 'lacquered', 'oiled', 'waxed',
    'stained', 'painted', 'distressed', 'antiqued', 'hand-rubbed',
    'natural finish', 'clear coat', 'polyurethane', 'varnished',
  ],
  metal: [
    'polished', 'brushed', 'matte', 'satin', 'hammered', 'antiqued',
    'patina', 'powder-coated', 'electroplated', 'anodized', 'blackened',
    'burnished', 'oxidized',
  ],
  fabric: [
    'matte', 'sheen', 'textured', 'smooth', 'nubuck', 'distressed',
    'washed', 'stonewashed', 'tumbled',
  ],
  other: [
    'high-gloss', 'semi-gloss', 'eggshell', 'flat', 'frosted', 'clear',
    'tinted', 'smoked',
  ],
};

// Flatten for quick lookup
const ALL_COLORS = new Set(
  Object.values(COLOR_KEYWORDS).flat().map(c => c.toLowerCase())
);

const ALL_FINISHES = new Set(
  Object.values(FINISH_KEYWORDS).flat().map(f => f.toLowerCase())
);

// CSS selectors for color/finish information
const COLOR_SELECTORS = [
  '[data-color]',
  '[data-colors]',
  '[data-selected-color]',
  '[name="color"]',
  'select[name*="color" i]',
  '.color-selector',
  '.color-picker',
  '.color-options',
  '.color-swatch',
  '.swatch',
  '[class*="variant"]',
  '[data-attribute-name="color"]', // Shopify pattern
  '[data-option-name="color" i]',
];

const FINISH_SELECTORS = [
  '[data-finish]',
  '[name="finish"]',
  'select[name*="finish" i]',
  '.finish-selector',
  '.finish-options',
  '[data-attribute-name="finish"]',
];

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract colors from text
 */
function extractColorsFromText(text: string): string[] {
  const found = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const color of ALL_COLORS) {
    const pattern = new RegExp(`\\b${escapeRegex(color)}\\b`, 'i');
    if (pattern.test(lowerText)) {
      // Normalize: capitalize first letter
      const normalized = color
        .split(/[-\s]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      found.add(normalized);
    }
  }

  return Array.from(found);
}

/**
 * Extract finishes from text
 */
function extractFinishesFromText(text: string): string[] {
  const found = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const finish of ALL_FINISHES) {
    const pattern = new RegExp(`\\b${escapeRegex(finish)}\\b`, 'i');
    if (pattern.test(lowerText)) {
      const normalized = finish
        .split(/[-\s]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      found.add(normalized);
    }
  }

  return Array.from(found);
}

/**
 * Get finish type based on the finish name
 */
function getFinishType(finish: string): 'wood' | 'metal' | 'fabric' | 'other' {
  const lower = finish.toLowerCase();
  for (const [type, finishes] of Object.entries(FINISH_KEYWORDS)) {
    if (finishes.some(f => lower.includes(f))) {
      return type as 'wood' | 'metal' | 'fabric' | 'other';
    }
  }
  return 'other';
}

/**
 * Extract colors from DOM color selectors
 */
function extractColorsFromSelectors(): { colors: string[]; confidence: number } {
  const colors: string[] = [];

  for (const selector of COLOR_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        // Check data attributes
        const dataColor = el.getAttribute('data-color') ||
          el.getAttribute('data-selected-color') ||
          el.getAttribute('data-value');
        if (dataColor) {
          colors.push(dataColor);
        }

        // Check title/aria-label
        const title = el.getAttribute('title') || el.getAttribute('aria-label');
        if (title) {
          colors.push(title);
        }

        // Check select options
        if (el.tagName === 'SELECT') {
          const options = el.querySelectorAll('option');
          options.forEach(opt => {
            const value = opt.textContent?.trim();
            if (value && value !== 'Select' && value !== 'Choose') {
              colors.push(value);
            }
          });
        }

        // Check for swatch labels
        const label = el.querySelector('.swatch-label, .color-name');
        if (label?.textContent) {
          colors.push(label.textContent.trim());
        }
      }
    } catch {
      // Invalid selector
    }
  }

  // Dedupe and filter
  const unique = [...new Set(colors.map(c => c.toLowerCase()))];
  const normalized = unique
    .filter(c => c.length > 1 && c.length < 50) // Filter out noise
    .map(c => c.charAt(0).toUpperCase() + c.slice(1));

  return {
    colors: normalized,
    confidence: normalized.length > 0 ? 0.9 : 0,
  };
}

/**
 * Extract color from JSON-LD data
 */
function extractColorFromJsonLd(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Check for Product with color
  if (obj['@type'] === 'Product') {
    if (typeof obj.color === 'string') {
      return obj.color;
    }
  }

  // Check offers
  if (obj.offers && typeof obj.offers === 'object') {
    const offers = obj.offers as Record<string, unknown>;
    if (typeof offers.color === 'string') {
      return offers.color;
    }
  }

  // Recurse for arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      const color = extractColorFromJsonLd(item);
      if (color) return color;
    }
  }

  return null;
}

/**
 * Extract color and finish from spec tables
 */
function extractFromTable(table: HTMLTableElement): { color: string | null; finish: string | null } {
  const result: { color: string | null; finish: string | null } = {
    color: null,
    finish: null,
  };

  const rows = table.querySelectorAll('tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    if (cells.length >= 2) {
      const label = cells[0].textContent?.toLowerCase().trim() || '';
      const value = cells[1].textContent?.trim() || '';

      if (/^color$|^colour$/i.test(label)) {
        result.color = value;
      } else if (/^finish$/i.test(label)) {
        result.finish = value;
      }
    }
  }

  return result;
}

export interface ExtractedColorFinish {
  colors: ExtractedColor[];
  finishes: ExtractedFinish[];
  availableColors: string[];
}

/**
 * Main extraction function for colors and finishes
 */
export function extractColorFinishFromDOM(): ExtractedColorFinish {
  const result: ExtractedColorFinish = {
    colors: [],
    finishes: [],
    availableColors: [],
  };

  // 1. Try JSON-LD (highest confidence)
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const jsonLdColor = extractColorFromJsonLd(data);
      if (jsonLdColor) {
        result.colors.push({
          name: jsonLdColor,
          isPrimary: true,
          confidence: 0.95,
          source: 'json-ld',
        });
      }
    } catch {
      // Invalid JSON
    }
  }

  // 2. Try color selectors (high confidence, gets available variants)
  const selectorResult = extractColorsFromSelectors();
  if (selectorResult.colors.length > 0) {
    result.availableColors = selectorResult.colors;

    // First color is often the selected/default one
    if (!result.colors.some(c => c.source === 'json-ld')) {
      result.colors.push({
        name: selectorResult.colors[0],
        isPrimary: true,
        confidence: 0.85,
        source: 'selector',
      });
    }
  }

  // 3. Try spec tables
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const tableData = extractFromTable(table);
    if (tableData.color && !result.colors.some(c => c.name.toLowerCase() === tableData.color?.toLowerCase())) {
      result.colors.push({
        name: tableData.color,
        isPrimary: result.colors.length === 0,
        confidence: 0.85,
        source: 'table',
      });
    }
    if (tableData.finish) {
      result.finishes.push({
        name: tableData.finish,
        type: getFinishType(tableData.finish),
        confidence: 0.85,
      });
    }
  }

  // 4. Try meta tags
  const metaColor = document.querySelector('meta[property="product:color"]');
  if (metaColor) {
    const colorValue = metaColor.getAttribute('content');
    if (colorValue && !result.colors.some(c => c.name.toLowerCase() === colorValue.toLowerCase())) {
      result.colors.push({
        name: colorValue,
        isPrimary: result.colors.length === 0,
        confidence: 0.8,
        source: 'selector',
      });
    }
  }

  // 5. Try text extraction from product description (lower confidence)
  if (result.colors.length === 0 || result.finishes.length === 0) {
    const contentSelectors = [
      '.product-description',
      '.product-details',
      '.description',
      '[class*="detail"]',
      'h1', // Product title
    ];

    for (const selector of contentSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent || '';
          const textSlice = text.slice(0, 1000); // Limit scan

          if (result.colors.length === 0) {
            const textColors = extractColorsFromText(textSlice);
            for (const color of textColors.slice(0, 2)) { // Max 2 from text
              result.colors.push({
                name: color,
                isPrimary: result.colors.length === 0,
                confidence: 0.6,
                source: 'text',
              });
            }
          }

          if (result.finishes.length === 0) {
            const textFinishes = extractFinishesFromText(textSlice);
            for (const finish of textFinishes.slice(0, 1)) { // Max 1 from text
              result.finishes.push({
                name: finish,
                type: getFinishType(finish),
                confidence: 0.6,
              });
            }
          }
        }
      } catch {
        // Invalid selector
      }
    }
  }

  // Dedupe colors by name
  const seenColors = new Set<string>();
  result.colors = result.colors.filter(c => {
    const lower = c.name.toLowerCase();
    if (seenColors.has(lower)) return false;
    seenColors.add(lower);
    return true;
  });

  return result;
}

export { extractColorsFromText, extractFinishesFromText, COLOR_KEYWORDS, FINISH_KEYWORDS };
