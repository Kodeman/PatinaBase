/**
 * Material extraction from web pages
 */

// Material keywords organized by category
const MATERIAL_KEYWORDS: Record<string, string[]> = {
  // Woods
  wood: [
    'oak', 'walnut', 'maple', 'cherry', 'mahogany', 'teak', 'pine', 'ash', 'birch',
    'beech', 'cedar', 'elm', 'hickory', 'rosewood', 'ebony', 'bamboo', 'acacia',
    'mango wood', 'reclaimed wood', 'solid wood', 'hardwood', 'softwood',
    'veneer', 'plywood', 'mdf', 'particleboard',
  ],
  // Metals
  metal: [
    'steel', 'brass', 'bronze', 'iron', 'aluminum', 'chrome', 'copper', 'nickel',
    'stainless steel', 'powder-coated', 'brushed metal', 'polished metal',
    'wrought iron', 'cast iron', 'gold-tone', 'silver-tone', 'antiqued',
  ],
  // Fabrics
  fabric: [
    'leather', 'velvet', 'linen', 'cotton', 'wool', 'silk', 'polyester', 'microfiber',
    'chenille', 'tweed', 'boucle', 'bouclé', 'canvas', 'denim', 'suede', 'faux leather',
    'vegan leather', 'performance fabric', 'crypton', 'sunbrella', 'outdoor fabric',
    'upholstered', 'tufted', 'nubuck',
  ],
  // Stone & Mineral
  stone: [
    'marble', 'granite', 'quartz', 'slate', 'travertine', 'limestone', 'onyx',
    'concrete', 'terrazzo', 'ceramic', 'porcelain', 'stone', 'natural stone',
  ],
  // Glass
  glass: [
    'glass', 'tempered glass', 'frosted glass', 'smoked glass', 'mirror',
    'mirrored', 'crystal', 'acrylic', 'lucite', 'plexiglass',
  ],
  // Natural Fibers
  natural: [
    'rattan', 'wicker', 'cane', 'jute', 'seagrass', 'sisal', 'hemp', 'raffia',
    'abaca', 'water hyacinth', 'banana leaf',
  ],
  // Synthetics
  synthetic: [
    'plastic', 'resin', 'fiberglass', 'polypropylene', 'abs', 'pvc',
    'laminate', 'melamine', 'formica', 'corian',
  ],
};

// Flatten for quick lookup
const ALL_MATERIALS = new Set(
  Object.values(MATERIAL_KEYWORDS).flat().map(m => m.toLowerCase())
);

// Selectors for material information
const MATERIAL_SELECTORS = [
  '[data-materials]',
  '[itemprop="material"]',
  '.product-materials',
  '.materials',
  '[class*="material"]',
  '[class*="specification"]',
  '.product-details',
  '.product-description',
];

/**
 * Extract materials from text
 */
function extractMaterialsFromText(text: string): string[] {
  const found = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const material of ALL_MATERIALS) {
    // Use word boundary matching to avoid partial matches
    const pattern = new RegExp(`\\b${escapeRegex(material)}\\b`, 'i');
    if (pattern.test(lowerText)) {
      // Normalize the material name (capitalize first letter of each word)
      const normalized = material
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      found.add(normalized);
    }
  }

  return Array.from(found);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get material category
 */
export function getMaterialCategory(material: string): string | null {
  const lower = material.toLowerCase();
  for (const [category, materials] of Object.entries(MATERIAL_KEYWORDS)) {
    if (materials.some(m => lower.includes(m))) {
      return category;
    }
  }
  return null;
}

/**
 * Extract materials from DOM
 */
export function extractMaterialsFromDOM(): string[] {
  const allMaterials = new Set<string>();

  // Try specific selectors
  for (const selector of MATERIAL_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent || '';
        const materials = extractMaterialsFromText(text);
        materials.forEach(m => allMaterials.add(m));
      }
    } catch {
      // Invalid selector
    }
  }

  // Check meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    const content = metaDesc.getAttribute('content') || '';
    const materials = extractMaterialsFromText(content);
    materials.forEach(m => allMaterials.add(m));
  }

  // Check JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const materials = findMaterialsInJsonLd(data);
      materials.forEach(m => allMaterials.add(m));
    } catch {
      // Invalid JSON
    }
  }

  // If we found few materials, scan the main content
  if (allMaterials.size < 3) {
    // Look for product description or details sections
    const contentSelectors = [
      '.product-description',
      '.description',
      '[class*="detail"]',
      'main',
      'article',
    ];

    for (const selector of contentSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent || '';
          // Limit to first 2000 chars to avoid scanning entire page
          const materials = extractMaterialsFromText(text.slice(0, 2000));
          materials.forEach(m => allMaterials.add(m));
        }
      } catch {
        // Invalid selector
      }
    }
  }

  return Array.from(allMaterials);
}

/**
 * Find materials in JSON-LD data
 */
function findMaterialsInJsonLd(data: unknown): string[] {
  const materials: string[] = [];

  if (!data || typeof data !== 'object') return materials;

  const obj = data as Record<string, unknown>;

  // Check for material property
  if (typeof obj.material === 'string') {
    materials.push(...extractMaterialsFromText(obj.material));
  } else if (Array.isArray(obj.material)) {
    for (const m of obj.material) {
      if (typeof m === 'string') {
        materials.push(...extractMaterialsFromText(m));
      }
    }
  }

  // Check description
  if (typeof obj.description === 'string') {
    materials.push(...extractMaterialsFromText(obj.description));
  }

  // Recurse
  if (Array.isArray(data)) {
    for (const item of data) {
      materials.push(...findMaterialsInJsonLd(item));
    }
  }

  return materials;
}

export { extractMaterialsFromText, MATERIAL_KEYWORDS };
