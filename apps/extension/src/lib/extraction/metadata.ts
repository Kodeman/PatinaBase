/**
 * Metadata extraction (product name, manufacturer) from web pages
 */

// Known furniture retailers and their display names
const RETAILER_MAP: Record<string, string> = {
  'restorationhardware.com': 'Restoration Hardware',
  'rh.com': 'Restoration Hardware',
  'cb2.com': 'CB2',
  'crateandbarrel.com': 'Crate & Barrel',
  'westelm.com': 'West Elm',
  'potterybarn.com': 'Pottery Barn',
  'potterybarnkids.com': 'Pottery Barn Kids',
  'arhaus.com': 'Arhaus',
  'roomandboard.com': 'Room & Board',
  'article.com': 'Article',
  'wayfair.com': 'Wayfair',
  'allmodern.com': 'AllModern',
  'jossandmain.com': 'Joss & Main',
  'birchlane.com': 'Birch Lane',
  'ethanallen.com': 'Ethan Allen',
  'bassettfurniture.com': 'Bassett',
  'haverty.com': "Haverty's",
  'ikea.com': 'IKEA',
  'target.com': 'Target',
  'amazon.com': 'Amazon',
  'overstock.com': 'Overstock',
  'homedepot.com': 'The Home Depot',
  'lowes.com': "Lowe's",
  'williams-sonoma.com': 'Williams Sonoma',
  'serenaandlily.com': 'Serena & Lily',
  'ballarddesigns.com': 'Ballard Designs',
  'anthropologie.com': 'Anthropologie',
  'urbanoutfitters.com': 'Urban Outfitters',
  'zgallerie.com': 'Z Gallerie',
  'lumens.com': 'Lumens',
  'ylighting.com': 'YLighting',
  'design-within-reach.com': 'Design Within Reach',
  'dwr.com': 'Design Within Reach',
  'hermanmiller.com': 'Herman Miller',
  'knoll.com': 'Knoll',
  'vitra.com': 'Vitra',
  'hay.dk': 'HAY',
  'muuto.com': 'Muuto',
  'fritzhansen.com': 'Fritz Hansen',
  'kartell.com': 'Kartell',
  'flos.com': 'Flos',
  'artek.fi': 'Artek',
  'cassina.com': 'Cassina',
  'bfremodern.com': 'B&B Italia',
  'poliform.com': 'Poliform',
  'minotti.com': 'Minotti',
  'flexform.it': 'Flexform',
  'ligne-roset.com': 'Ligne Roset',
  'natuzzi.com': 'Natuzzi',
  'burkedecor.com': 'Burke Decor',
  '1stdibs.com': '1stDibs',
  'chairish.com': 'Chairish',
};

/**
 * Extract manufacturer/retailer from URL
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
