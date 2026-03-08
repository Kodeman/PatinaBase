/**
 * Dimension extraction from web pages
 */

import type { ExtractedDimensions } from '@patina/shared';

// Patterns for dimension formats
const DIMENSION_PATTERNS = [
  // Standard WxHxD or WxDxH formats
  // 24" x 18" x 30" or 24"x18"x30" or 24 x 18 x 30 in
  /(\d+(?:\.\d+)?)\s*["″]?\s*[x×]\s*(\d+(?:\.\d+)?)\s*["″]?\s*[x×]\s*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?)?/i,
  // With unit at end: 24 x 18 x 30 inches
  /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:in(?:ches)?|cm|mm)/i,
  // Metric: 60cm x 45cm x 75cm
  /(\d+(?:\.\d+)?)\s*cm\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/i,
];

// Labeled dimension patterns for overall dimensions
const LABELED_PATTERNS = {
  width: [
    /W(?:idth)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /Width[:\s]*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*["″]?\s*W(?:ide)?/i,
  ],
  height: [
    /H(?:eight)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /Height[:\s]*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*["″]?\s*H(?:igh)?/i,
  ],
  depth: [
    /D(?:epth)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /Depth[:\s]*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*["″]?\s*D(?:eep)?/i,
  ],
};

// Specialty dimension patterns for furniture-specific measurements
const SPECIALTY_PATTERNS = {
  seatHeight: [
    /seat\s*h(?:eight)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /seat\s*ht[:\s]*(\d+(?:\.\d+)?)/i,
    /sh[:\s]*(\d+(?:\.\d+)?)\s*["″]/i,
  ],
  seatDepth: [
    /seat\s*d(?:epth)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /seat\s*dp[:\s]*(\d+(?:\.\d+)?)/i,
    /sd[:\s]*(\d+(?:\.\d+)?)\s*["″]/i,
  ],
  seatWidth: [
    /seat\s*w(?:idth)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /seat\s*wd[:\s]*(\d+(?:\.\d+)?)/i,
    /sw[:\s]*(\d+(?:\.\d+)?)\s*["″]/i,
  ],
  armHeight: [
    /arm\s*h(?:eight)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /arm\s*ht[:\s]*(\d+(?:\.\d+)?)/i,
    /armrest\s*h(?:eight)?[:\s]*(\d+(?:\.\d+)?)/i,
  ],
  backHeight: [
    /back(?:rest)?\s*h(?:eight)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /back\s*ht[:\s]*(\d+(?:\.\d+)?)/i,
  ],
  legHeight: [
    /leg\s*h(?:eight)?[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /leg\s*ht[:\s]*(\d+(?:\.\d+)?)/i,
  ],
  clearance: [
    /(?:floor\s*)?clearance[:\s]*(\d+(?:\.\d+)?)\s*["″]?\s*(?:in(?:ches)?|cm)?/i,
    /ground\s*clearance[:\s]*(\d+(?:\.\d+)?)/i,
  ],
};

// Selectors for dimension containers
const DIMENSION_SELECTORS = [
  '[data-dimensions]',
  '[itemprop="width"]',
  '[itemprop="height"]',
  '[itemprop="depth"]',
  '.product-dimensions',
  '.dimensions',
  '[class*="dimension"]',
  '[class*="specification"]',
  'table', // Often dimensions are in spec tables
];

/**
 * Detect unit from text
 */
function detectUnit(text: string): 'in' | 'cm' {
  if (/cm|centimeter|metric/i.test(text)) return 'cm';
  if (/mm|millimeter/i.test(text)) return 'cm'; // Convert mm context to cm
  return 'in'; // Default to inches for furniture
}

/**
 * Extract dimensions from a string using WxHxD pattern
 */
function extractWxHxD(text: string): ExtractedDimensions | null {
  for (const pattern of DIMENSION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const unit = detectUnit(text);
      return {
        width: parseFloat(match[1]),
        height: parseFloat(match[2]),
        depth: parseFloat(match[3]),
        unit,
        raw: match[0],
      };
    }
  }
  return null;
}

/**
 * Extract individual labeled dimensions (overall + specialty)
 */
function extractLabeledDimensions(text: string): Partial<ExtractedDimensions> {
  const result: Partial<ExtractedDimensions> = {
    unit: detectUnit(text),
    raw: '',
  };
  const rawParts: string[] = [];

  // Extract overall dimensions
  for (const [dim, patterns] of Object.entries(LABELED_PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && value > 0) {
          (result as Record<string, unknown>)[dim] = value;
          rawParts.push(match[0]);
          break;
        }
      }
    }
  }

  // Extract specialty dimensions
  for (const [dim, patterns] of Object.entries(SPECIALTY_PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && value > 0) {
          (result as Record<string, unknown>)[dim] = value;
          rawParts.push(match[0]);
          break;
        }
      }
    }
  }

  result.raw = rawParts.join(', ');
  return result;
}

/**
 * Extract dimensions from spec table (overall + specialty)
 */
function extractFromTable(table: HTMLTableElement): ExtractedDimensions | null {
  const rows = table.querySelectorAll('tr');
  const dimensions: Partial<ExtractedDimensions> = { unit: 'in' };
  const rawParts: string[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    if (cells.length >= 2) {
      const label = cells[0].textContent?.toLowerCase().trim() || '';
      const value = cells[1].textContent?.trim() || '';
      const num = parseFloat(value);

      // Overall dimensions
      if (/^width$|^w$/i.test(label) || /overall\s*width/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.width = num;
          rawParts.push(`W: ${value}`);
        }
      } else if (/^height$|^h$/i.test(label) || /overall\s*height/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.height = num;
          rawParts.push(`H: ${value}`);
        }
      } else if (/^depth$|^d$/i.test(label) || /overall\s*depth/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.depth = num;
          rawParts.push(`D: ${value}`);
        }
      }
      // Specialty dimensions
      else if (/seat\s*height|seat\s*h\b/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.seatHeight = num;
          rawParts.push(`Seat H: ${value}`);
        }
      } else if (/seat\s*depth|seat\s*d\b/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.seatDepth = num;
          rawParts.push(`Seat D: ${value}`);
        }
      } else if (/seat\s*width|seat\s*w\b/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.seatWidth = num;
          rawParts.push(`Seat W: ${value}`);
        }
      } else if (/arm\s*height|armrest\s*height/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.armHeight = num;
          rawParts.push(`Arm H: ${value}`);
        }
      } else if (/back(?:rest)?\s*height/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.backHeight = num;
          rawParts.push(`Back H: ${value}`);
        }
      } else if (/leg\s*height/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.legHeight = num;
          rawParts.push(`Leg H: ${value}`);
        }
      } else if (/clearance|floor\s*clearance/i.test(label)) {
        if (!isNaN(num)) {
          dimensions.clearance = num;
          rawParts.push(`Clearance: ${value}`);
        }
      } else if (/dimension/i.test(label)) {
        // Try to parse combined dimension string
        const extracted = extractWxHxD(value);
        if (extracted) return extracted;
      }

      // Detect unit from any cell
      if (/cm|centimeter/i.test(value)) {
        dimensions.unit = 'cm';
      }
    }
  }

  const hasAnyDimension =
    dimensions.width ||
    dimensions.height ||
    dimensions.depth ||
    dimensions.seatHeight ||
    dimensions.seatDepth ||
    dimensions.seatWidth ||
    dimensions.armHeight ||
    dimensions.backHeight ||
    dimensions.legHeight ||
    dimensions.clearance;

  if (hasAnyDimension) {
    return {
      width: dimensions.width || null,
      height: dimensions.height || null,
      depth: dimensions.depth || null,
      seatHeight: dimensions.seatHeight,
      seatDepth: dimensions.seatDepth,
      seatWidth: dimensions.seatWidth,
      armHeight: dimensions.armHeight,
      backHeight: dimensions.backHeight,
      legHeight: dimensions.legHeight,
      clearance: dimensions.clearance,
      unit: dimensions.unit || 'in',
      raw: rawParts.join(', '),
    };
  }

  return null;
}

/**
 * Extract dimensions from DOM
 */
export function extractDimensionsFromDOM(): ExtractedDimensions | null {
  // Try specific selectors
  for (const selector of DIMENSION_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        // Check for tables
        if (el.tagName === 'TABLE') {
          const dims = extractFromTable(el as HTMLTableElement);
          if (dims && (dims.width || dims.height || dims.depth)) {
            return dims;
          }
        }

        // Check text content
        const text = el.textContent || '';

        // Try WxHxD format first
        const wxhxd = extractWxHxD(text);
        if (wxhxd) return wxhxd;

        // Try labeled dimensions (includes specialty dimensions)
        const labeled = extractLabeledDimensions(text);
        const hasLabeledDimension =
          labeled.width ||
          labeled.height ||
          labeled.depth ||
          labeled.seatHeight ||
          labeled.seatDepth ||
          labeled.seatWidth ||
          labeled.armHeight ||
          labeled.backHeight ||
          labeled.legHeight ||
          labeled.clearance;

        if (hasLabeledDimension) {
          return {
            width: labeled.width || null,
            height: labeled.height || null,
            depth: labeled.depth || null,
            seatHeight: labeled.seatHeight,
            seatDepth: labeled.seatDepth,
            seatWidth: labeled.seatWidth,
            armHeight: labeled.armHeight,
            backHeight: labeled.backHeight,
            legHeight: labeled.legHeight,
            clearance: labeled.clearance,
            unit: labeled.unit || 'in',
            raw: labeled.raw || '',
          };
        }
      }
    } catch {
      // Invalid selector, continue
    }
  }

  // Try JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const dims = findDimensionsInJsonLd(data);
      if (dims) return dims;
    } catch {
      // Invalid JSON
    }
  }

  return null;
}

/**
 * Find dimensions in JSON-LD data
 */
function findDimensionsInJsonLd(data: unknown): ExtractedDimensions | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Check for Product with dimensions
  if (obj['@type'] === 'Product') {
    const width = obj.width as Record<string, unknown> | undefined;
    const height = obj.height as Record<string, unknown> | undefined;
    const depth = obj.depth as Record<string, unknown> | undefined;

    if (width || height || depth) {
      return {
        width: width?.value ? parseFloat(String(width.value)) : null,
        height: height?.value ? parseFloat(String(height.value)) : null,
        depth: depth?.value ? parseFloat(String(depth.value)) : null,
        unit: 'in',
        raw: 'from JSON-LD',
      };
    }
  }

  // Recurse into arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      const dims = findDimensionsInJsonLd(item);
      if (dims) return dims;
    }
  } else {
    // Recurse into nested objects (e.g., @graph)
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const dims = findDimensionsInJsonLd(value);
        if (dims) return dims;
      }
    }
  }

  return null;
}

export { extractWxHxD, extractLabeledDimensions };
