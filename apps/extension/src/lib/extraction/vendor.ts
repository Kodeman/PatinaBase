/**
 * Vendor data extraction for vendor-only capture mode
 * Extracts company/brand information from about pages and vendor sites
 */

import type {
  ExtractedVendorData,
  ExtractedVendorContact,
  ExtractedVendorSocialLinks,
  VendorMatchConfidence,
  ExtractedVendorStory,
  VendorCertification,
  OwnershipType,
} from '@patina/shared';

/**
 * Extract vendor/company name from page
 */
function extractVendorName(): string | null {
  // Priority 1: OG site_name
  const ogSiteName = document.querySelector('meta[property="og:site_name"]');
  if (ogSiteName) {
    const content = ogSiteName.getAttribute('content');
    if (content && content.length > 0 && content.length < 100) {
      return content;
    }
  }

  // Priority 2: JSON-LD Organization
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const name = findOrganizationName(data);
      if (name) return name;
    } catch {
      // Invalid JSON
    }
  }

  // Priority 3: Copyright text (e.g., "2024 Company Name")
  const copyrightPatterns = [
    /(?:©|copyright|\(c\))\s*(?:\d{4})?\s*([A-Z][A-Za-z0-9\s&'-]+?)(?:\.|,|All|Inc|LLC|Ltd|$)/i,
    /(?:©|copyright|\(c\))\s*([A-Z][A-Za-z0-9\s&'-]+?)\s*(?:\d{4})/i,
  ];

  const footerElements = document.querySelectorAll('footer, [class*="footer"], [class*="copyright"]');
  for (const el of footerElements) {
    const text = el.textContent || '';
    for (const pattern of copyrightPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length > 1 && name.length < 50) {
          return name;
        }
      }
    }
  }

  // Priority 4: Document title (fallback)
  const title = document.title;
  if (title) {
    // Remove common suffixes
    const cleanedTitle = title
      .replace(/\s*[-|–—]\s*Home.*$/i, '')
      .replace(/\s*[-|–—]\s*Official.*$/i, '')
      .replace(/\s*[-|–—]\s*About.*$/i, '')
      .trim();
    if (cleanedTitle.length > 0 && cleanedTitle.length < 50) {
      return cleanedTitle;
    }
  }

  return null;
}

/**
 * Find organization name in JSON-LD data
 */
function findOrganizationName(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Check for Organization type
  if (
    obj['@type'] === 'Organization' ||
    obj['@type'] === 'Corporation' ||
    obj['@type'] === 'LocalBusiness'
  ) {
    if (typeof obj.name === 'string') {
      return obj.name;
    }
  }

  // Recurse into arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      const name = findOrganizationName(item);
      if (name) return name;
    }
  } else {
    // Recurse into nested objects (e.g., @graph)
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const name = findOrganizationName(value);
        if (name) return name;
      }
    }
  }

  return null;
}

/**
 * Extract logo URL from page
 * Priority: apple-touch-icon > OG image > favicon (by size)
 */
function extractLogoUrl(): string | null {
  // Priority 1: Apple touch icon (usually high quality)
  const appleTouchIcon = document.querySelector(
    'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
  );
  if (appleTouchIcon) {
    const href = appleTouchIcon.getAttribute('href');
    if (href) {
      return resolveUrl(href);
    }
  }

  // Priority 2: OG image (if it looks like a logo)
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) {
    const content = ogImage.getAttribute('content');
    if (content && /logo|brand|icon/i.test(content)) {
      return resolveUrl(content);
    }
  }

  // Priority 3: Favicon with largest size
  const favicons = document.querySelectorAll(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel*="icon"]'
  );
  let bestFavicon: { url: string; size: number } | null = null;

  for (const favicon of favicons) {
    const href = favicon.getAttribute('href');
    if (!href) continue;

    // Parse size from sizes attribute or filename
    const sizes = favicon.getAttribute('sizes');
    let size = 16; // Default favicon size

    if (sizes) {
      const match = sizes.match(/(\d+)/);
      if (match) {
        size = parseInt(match[1]);
      }
    } else {
      // Try to extract size from filename
      const sizeMatch = href.match(/(\d+)x\d+/);
      if (sizeMatch) {
        size = parseInt(sizeMatch[1]);
      }
    }

    if (!bestFavicon || size > bestFavicon.size) {
      bestFavicon = { url: resolveUrl(href), size };
    }
  }

  if (bestFavicon) {
    return bestFavicon.url;
  }

  // Priority 4: JSON-LD Organization logo
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const logo = findOrganizationLogo(data);
      if (logo) return logo;
    } catch {
      // Invalid JSON
    }
  }

  // Fallback: default favicon
  return resolveUrl('/favicon.ico');
}

/**
 * Find organization logo in JSON-LD data
 */
function findOrganizationLogo(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  if (
    obj['@type'] === 'Organization' ||
    obj['@type'] === 'Corporation' ||
    obj['@type'] === 'LocalBusiness'
  ) {
    if (typeof obj.logo === 'string') {
      return obj.logo;
    }
    if (typeof obj.logo === 'object' && obj.logo !== null) {
      const logoObj = obj.logo as Record<string, unknown>;
      if (typeof logoObj.url === 'string') {
        return logoObj.url;
      }
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const logo = findOrganizationLogo(item);
      if (logo) return logo;
    }
  } else {
    // Recurse into nested objects (e.g., @graph)
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const logo = findOrganizationLogo(value);
        if (logo) return logo;
      }
    }
  }

  return null;
}

/**
 * Extract contact information (email and phone)
 */
function extractContact(): ExtractedVendorContact {
  let email: string | null = null;
  let phone: string | null = null;

  // Find mailto: links
  const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
  for (const link of mailtoLinks) {
    const href = link.getAttribute('href');
    if (href) {
      const match = href.match(/mailto:([^?]+)/);
      if (match && match[1]) {
        email = match[1];
        break;
      }
    }
  }

  // Find tel: links
  const telLinks = document.querySelectorAll('a[href^="tel:"]');
  for (const link of telLinks) {
    const href = link.getAttribute('href');
    if (href) {
      const match = href.match(/tel:([^?]+)/);
      if (match && match[1]) {
        phone = match[1].replace(/[^\d+()-\s]/g, '');
        break;
      }
    }
  }

  // Fallback: search for email pattern in contact sections
  if (!email) {
    const contactSections = document.querySelectorAll(
      '[class*="contact"], [class*="footer"], address'
    );
    for (const section of contactSections) {
      const text = section.textContent || '';
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      if (emailMatch) {
        email = emailMatch[0];
        break;
      }
    }
  }

  // Fallback: search for phone pattern in contact sections
  if (!phone) {
    const contactSections = document.querySelectorAll(
      '[class*="contact"], [class*="footer"], address'
    );
    for (const section of contactSections) {
      const text = section.textContent || '';
      const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        phone = phoneMatch[0];
        break;
      }
    }
  }

  return { email, phone };
}

/**
 * Extract social media links
 */
function extractSocialLinks(): ExtractedVendorSocialLinks {
  const result: ExtractedVendorSocialLinks = {
    instagram: null,
    pinterest: null,
    facebook: null,
  };

  const allLinks = document.querySelectorAll('a[href]');

  for (const link of allLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;

    const hrefLower = href.toLowerCase();

    // Instagram
    if (!result.instagram && /instagram\.com\/[\w.-]+/.test(hrefLower)) {
      result.instagram = href;
    }

    // Pinterest
    if (!result.pinterest && /pinterest\.com\/[\w.-]+/.test(hrefLower)) {
      result.pinterest = href;
    }

    // Facebook
    if (!result.facebook && /facebook\.com\/[\w.-]+/.test(hrefLower)) {
      result.facebook = href;
    }

    // Early exit if all found
    if (result.instagram && result.pinterest && result.facebook) {
      break;
    }
  }

  return result;
}

/**
 * Extract founded year from page content
 * Looks for patterns like "Est. 1985", "Since 1992", "Founded 2010"
 */
function extractFoundedYear(): number | null {
  const patterns = [
    /\bEst(?:ablished)?\.?\s*(\d{4})\b/i,
    /\bSince\s+(\d{4})\b/i,
    /\bFounded\s+(?:in\s+)?(\d{4})\b/i,
    /\b(?:Established|Started)\s+(?:in\s+)?(\d{4})\b/i,
  ];

  // Search in footer, about sections, and general body
  const searchElements = [
    ...document.querySelectorAll('footer, [class*="footer"], [class*="about"], [class*="history"]'),
    document.body,
  ];

  for (const el of searchElements) {
    const text = el.textContent || '';
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const year = parseInt(match[1]);
        // Validate year is reasonable (1800-current year)
        const currentYear = new Date().getFullYear();
        if (year >= 1800 && year <= currentYear) {
          return year;
        }
      }
    }
  }

  return null;
}

/**
 * Extract headquarters location from page content
 * Looks for patterns like "Based in NYC", "Headquartered in San Francisco"
 */
function extractHeadquarters(): string | null {
  const patterns = [
    /\bBased\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|$|\s+(?:since|for|and))/i,
    /\bHeadquartered\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|$|\s+(?:since|for|and))/i,
    /\bLocated\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|$|\s+(?:since|for|and))/i,
    /\bHQ:\s*([A-Z][A-Za-z\s,]+?)(?:\.|,|$)/i,
  ];

  // Search in about sections and footer
  const searchElements = [
    ...document.querySelectorAll('[class*="about"], [class*="footer"], [class*="contact"], address'),
  ];

  for (const el of searchElements) {
    const text = el.textContent || '';
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const location = match[1].trim();
        // Validate location is reasonable length
        if (location.length >= 2 && location.length <= 100) {
          return location;
        }
      }
    }
  }

  return null;
}

/**
 * Extract about snippet from page content
 * Gets first 200 characters from About page or company description
 */
function extractAboutSnippet(): string | null {
  // Check meta description first
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    const content = metaDescription.getAttribute('content');
    if (content && content.length > 20) {
      return content.substring(0, 200).trim();
    }
  }

  // Check OG description
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) {
    const content = ogDescription.getAttribute('content');
    if (content && content.length > 20) {
      return content.substring(0, 200).trim();
    }
  }

  // Look for about sections
  const aboutSelectors = [
    '[class*="about"] p',
    '[class*="story"] p',
    '[class*="mission"] p',
    'main p',
    'article p',
  ];

  for (const selector of aboutSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent?.trim();
        if (text && text.length > 50) {
          return text.substring(0, 200).trim();
        }
      }
    } catch {
      // Invalid selector
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORY EXTRACTION - Structured narrative sections (500 chars each)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to extract text content following a header pattern
 */
function extractSectionContent(headerPatterns: RegExp[], maxLength = 500): string | null {
  const bodyText = document.body.innerHTML;

  for (const pattern of headerPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      // Find the position of the match and extract following content
      const matchIndex = match.index || 0;
      const afterMatch = bodyText.substring(matchIndex);

      // Look for paragraph content after the header
      const paragraphMatch = afterMatch.match(/<\/h[1-6]>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
      if (paragraphMatch && paragraphMatch[1]) {
        const text = paragraphMatch[1]
          .replace(/<[^>]*>/g, '') // Strip HTML tags
          .replace(/\s+/g, ' ')     // Normalize whitespace
          .trim();
        if (text.length > 30) {
          return text.substring(0, maxLength);
        }
      }
    }
  }

  // Fallback: search for sections by class/id
  const sectionSelectors = headerPatterns.map(p => {
    const keyword = p.source.match(/(\w+)/)?.[1]?.toLowerCase();
    return keyword ? `[class*="${keyword}"], [id*="${keyword}"]` : null;
  }).filter(Boolean);

  for (const selector of sectionSelectors) {
    try {
      const elements = document.querySelectorAll(selector as string);
      for (const el of elements) {
        const paragraphs = el.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent?.trim();
          if (text && text.length > 50) {
            return text.substring(0, maxLength);
          }
        }
      }
    } catch {
      // Invalid selector
    }
  }

  return null;
}

/**
 * Extract mission statement
 * "What we do and why"
 */
function extractMission(): string | null {
  const patterns = [
    /<h[1-6][^>]*>.*?(?:Our\s+)?Mission.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?What\s+We\s+Do.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?Purpose.*?<\/h[1-6]>/i,
  ];

  const result = extractSectionContent(patterns);
  if (result) return result;

  // Try to find mission in meta or dedicated elements
  const missionElements = document.querySelectorAll(
    '[class*="mission"], [id*="mission"], [data-section="mission"]'
  );
  for (const el of missionElements) {
    const text = el.textContent?.trim();
    if (text && text.length > 50 && text.length < 1000) {
      return text.substring(0, 500);
    }
  }

  return null;
}

/**
 * Extract philosophy/values statement
 * "How we approach design/craft"
 */
function extractPhilosophy(): string | null {
  const patterns = [
    /<h[1-6][^>]*>.*?(?:Our\s+)?Philosophy.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?(?:Our\s+)?Approach.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?(?:Our\s+)?Values.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?What\s+We\s+Believe.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?How\s+We\s+Design.*?<\/h[1-6]>/i,
  ];

  const result = extractSectionContent(patterns);
  if (result) return result;

  // Try dedicated elements
  const philosophyElements = document.querySelectorAll(
    '[class*="philosophy"], [class*="values"], [id*="philosophy"], [id*="values"]'
  );
  for (const el of philosophyElements) {
    const text = el.textContent?.trim();
    if (text && text.length > 50 && text.length < 1000) {
      return text.substring(0, 500);
    }
  }

  return null;
}

/**
 * Extract company history/origin story
 * "Our origin and journey"
 */
function extractHistory(): string | null {
  const patterns = [
    /<h[1-6][^>]*>.*?(?:Our\s+)?Story.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?(?:Our\s+)?History.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?About\s+Us.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?How\s+(?:We|It)\s+(?:Started|Began).*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?(?:Our\s+)?Origins?.*?<\/h[1-6]>/i,
  ];

  const result = extractSectionContent(patterns);
  if (result) return result;

  // Try dedicated elements
  const historyElements = document.querySelectorAll(
    '[class*="story"], [class*="history"], [class*="about"], [id*="story"], [id*="history"]'
  );
  for (const el of historyElements) {
    // Look for paragraphs with founding language
    const paragraphs = el.querySelectorAll('p');
    for (const p of paragraphs) {
      const text = p.textContent?.trim();
      if (text && text.length > 50) {
        // Check for history indicators
        if (/(?:founded|started|began|established|since|in\s+\d{4})/i.test(text)) {
          return text.substring(0, 500);
        }
      }
    }
  }

  return null;
}

/**
 * Extract craftsmanship/manufacturing description
 * "How we make things"
 */
function extractCraftsmanship(): string | null {
  const patterns = [
    /<h[1-6][^>]*>.*?(?:Our\s+)?Craftsmanship.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?How\s+(?:We|It'?s?)\s+Made.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?(?:Our\s+)?Process.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?Made\s+By\s+Hand.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?(?:Our\s+)?Workshop.*?<\/h[1-6]>/i,
    /<h[1-6][^>]*>.*?(?:Our\s+)?Atelier.*?<\/h[1-6]>/i,
  ];

  const result = extractSectionContent(patterns);
  if (result) return result;

  // Try dedicated elements
  const craftElements = document.querySelectorAll(
    '[class*="craft"], [class*="process"], [class*="making"], [class*="workshop"], [id*="craft"]'
  );
  for (const el of craftElements) {
    const text = el.textContent?.trim();
    if (text && text.length > 50 && text.length < 1000) {
      return text.substring(0, 500);
    }
  }

  return null;
}

/**
 * Extract complete vendor story
 */
function extractVendorStory(): ExtractedVendorStory {
  return {
    mission: extractMission(),
    philosophy: extractPhilosophy(),
    history: extractHistory(),
    craftsmanship: extractCraftsmanship(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CERTIFICATION EXTRACTION - Auto-detect credibility signals
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pattern map for certification detection
 */
const CERTIFICATION_PATTERNS: Record<VendorCertification, RegExp[]> = {
  'fsc': [/FSC[\s-]?certified/i, /Forest\s+Stewardship\s+Council/i],
  'greenguard': [/GREENGUARD(?!\s*Gold)/i, /greenguard[\s-]?certified/i],
  'greenguard-gold': [/GREENGUARD\s*Gold/i],
  'b-corp': [/B[\s-]?Corp/i, /Certified\s+B\s*Corporation/i],
  'fair-trade': [/Fair[\s-]?Trade/i, /Fairtrade/i],
  'gots': [/GOTS/i, /Global\s+Organic\s+Textile\s+Standard/i],
  'oeko-tex': [/OEKO[\s-]?TEX/i, /Oeko[\s-]?Tex/i],
  'made-in-usa': [/Made\s+in\s+(?:the\s+)?USA/i, /Made\s+in\s+America/i, /American[\s-]?Made/i],
  'made-in-italy': [/Made\s+in\s+Italy/i, /Italian[\s-]?Made/i],
  'made-in-europe': [/Made\s+in\s+Europe/i, /European[\s-]?Made/i],
  'handmade': [/Handmade/i, /Hand[\s-]?crafted/i, /Artisan[\s-]?made/i],
  'sustainable': [/Sustainab(?:le|ility)/i, /Eco[\s-]?friendly/i],
  'carbon-neutral': [/Carbon[\s-]?neutral/i, /Net[\s-]?zero/i, /Climate[\s-]?neutral/i],
  'recycled': [/Recycled\s+materials?/i, /Made\s+(?:from|with)\s+recycled/i, /Upcycled/i],
};

/**
 * Extract detected certifications from page content
 */
function extractCertifications(): VendorCertification[] {
  const pageText = document.body.innerText;
  const found: VendorCertification[] = [];

  for (const [cert, patterns] of Object.entries(CERTIFICATION_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(pageText))) {
      found.push(cert as VendorCertification);
    }
  }

  // Also check for certification images/badges
  const images = document.querySelectorAll('img[alt], img[title]');
  for (const img of images) {
    const alt = img.getAttribute('alt') || '';
    const title = img.getAttribute('title') || '';
    const combined = `${alt} ${title}`;

    for (const [cert, patterns] of Object.entries(CERTIFICATION_PATTERNS)) {
      if (!found.includes(cert as VendorCertification)) {
        if (patterns.some(pattern => pattern.test(combined))) {
          found.push(cert as VendorCertification);
        }
      }
    }
  }

  return found;
}

// ═══════════════════════════════════════════════════════════════════════════
// OWNERSHIP & PROVENANCE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Infer ownership type from page content
 */
function inferOwnershipType(): OwnershipType | null {
  const pageText = document.body.innerText;

  // Family-owned signals
  if (/family[\s-]?owned/i.test(pageText) ||
      /family\s+business/i.test(pageText) ||
      /multi[\s-]?generation/i.test(pageText) ||
      /\d+(?:st|nd|rd|th)\s+generation/i.test(pageText)) {
    return 'family';
  }

  // PE-backed signals
  if (/portfolio\s+company/i.test(pageText) ||
      /backed\s+by/i.test(pageText) ||
      /private\s+equity/i.test(pageText) ||
      /PE[\s-]?backed/i.test(pageText)) {
    return 'pe-backed';
  }

  // Public company signals
  if (/NYSE:|NASDAQ:|publicly\s+traded/i.test(pageText) ||
      /stock\s+ticker/i.test(pageText) ||
      /investor\s+relations/i.test(pageText)) {
    return 'public';
  }

  // Private company signals (weaker - check last)
  if (/privately\s+held/i.test(pageText) ||
      /private\s+company/i.test(pageText) ||
      /independent(?:ly[\s-]?owned)?/i.test(pageText)) {
    return 'private';
  }

  return null;
}

/**
 * Extract parent company if mentioned
 */
function extractParentCompany(): string | null {
  const patterns = [
    /(?:a\s+)?(?:subsidiary|division|brand)\s+of\s+([A-Z][A-Za-z\s&'-]+?)(?:\.|,|$)/i,
    /(?:owned\s+by|part\s+of)\s+([A-Z][A-Za-z\s&'-]+?)(?:\.|,|$)/i,
    /([A-Z][A-Za-z\s&'-]+?)\s+(?:family\s+of\s+brands|portfolio)/i,
  ];

  const pageText = document.body.innerText;

  for (const pattern of patterns) {
    const match = pageText.match(pattern);
    if (match && match[1]) {
      const company = match[1].trim();
      if (company.length > 2 && company.length < 100) {
        return company;
      }
    }
  }

  return null;
}

/**
 * Extract "Made in" location
 */
function extractMadeIn(): string | null {
  const patterns = [
    /Made\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|\s+(?:since|using|with|by))/i,
    /Crafted\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|\s+(?:since|using|with|by))/i,
    /Manufactured\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|\s+(?:since|using|with|by))/i,
    /Built\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|\s+(?:since|using|with|by))/i,
    /Proudly\s+made\s+in\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|$)/i,
  ];

  const pageText = document.body.innerText;

  for (const pattern of patterns) {
    const match = pageText.match(pattern);
    if (match && match[1]) {
      const location = match[1].trim();
      // Validate location is reasonable
      if (location.length >= 2 && location.length <= 50) {
        return location;
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HERO IMAGE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract hero/banner image for brand representation
 */
function extractHeroImage(): string | null {
  // Priority 1: OG image (usually high quality brand image)
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) {
    const content = ogImage.getAttribute('content');
    if (content) {
      return resolveUrl(content);
    }
  }

  // Priority 2: Large images in hero/banner sections
  const heroSelectors = [
    '[class*="hero"] img',
    '[class*="banner"] img',
    '[class*="header"] img:not([class*="logo"])',
    'header img:not([class*="logo"])',
  ];

  for (const selector of heroSelectors) {
    try {
      const images = document.querySelectorAll(selector);
      for (const img of images) {
        const src = (img as HTMLImageElement).src;
        const width = (img as HTMLImageElement).naturalWidth || parseInt(img.getAttribute('width') || '0');

        // Look for large images (hero-sized)
        if (src && width >= 800) {
          return src;
        }
      }
    } catch {
      // Invalid selector
    }
  }

  // Priority 3: Any large image near the top of the page
  const allImages = document.querySelectorAll('img');
  for (const img of allImages) {
    const rect = img.getBoundingClientRect();
    // Only consider images in the top 600px of the page
    if (rect.top >= 0 && rect.top < 600) {
      const src = (img as HTMLImageElement).src;
      const width = (img as HTMLImageElement).naturalWidth || parseInt(img.getAttribute('width') || '0');

      // Look for large images, exclude logos
      if (src && width >= 800 && !/logo/i.test(src)) {
        return src;
      }
    }
  }

  return null;
}

/**
 * Resolve a URL relative to the current page
 */
function resolveUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('//')) {
    return window.location.protocol + url;
  }
  if (url.startsWith('/')) {
    return window.location.origin + url;
  }
  return new URL(url, window.location.href).href;
}

/**
 * Calculate confidence based on extracted data quality
 * Weighted to prioritize story and credential signals
 */
function calculateConfidence(data: Partial<ExtractedVendorData>): VendorMatchConfidence {
  let score = 0;

  // Core identity (45 points max)
  if (data.name) score += 25;
  if (data.logoUrl) score += 10;
  if (data.heroImageUrl) score += 5;
  if (data.contact?.email) score += 3;
  if (data.contact?.phone) score += 2;

  // Social presence (5 points)
  if (data.socialLinks?.instagram || data.socialLinks?.facebook || data.socialLinks?.pinterest) {
    score += 5;
  }

  // Heritage (10 points)
  if (data.foundedYear) score += 5;
  if (data.headquarters) score += 3;
  if (data.aboutSnippet) score += 2;

  // Story sections (20 points - prioritized for designer value)
  if (data.story?.mission) score += 5;
  if (data.story?.philosophy) score += 5;
  if (data.story?.history) score += 5;
  if (data.story?.craftsmanship) score += 5;

  // Ownership & provenance (10 points)
  if (data.ownershipType) score += 5;
  if (data.madeIn) score += 5;

  // Certifications (10 points - strong credibility signals)
  if (data.certifications && data.certifications.length > 0) {
    score += Math.min(10, data.certifications.length * 3);
  }

  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

/**
 * Extract all vendor data from current page
 * Used for vendor-only capture mode
 */
export function extractVendorData(): ExtractedVendorData {
  // Core identity
  const name = extractVendorName();
  const logoUrl = extractLogoUrl();
  const heroImageUrl = extractHeroImage();

  // Contact & social
  const contact = extractContact();
  const socialLinks = extractSocialLinks();

  // Heritage (legacy)
  const foundedYear = extractFoundedYear();
  const headquarters = extractHeadquarters();
  const aboutSnippet = extractAboutSnippet();

  // Story (NEW - structured narrative)
  const story = extractVendorStory();

  // Ownership & provenance (NEW)
  const ownershipType = inferOwnershipType();
  const parentCompany = extractParentCompany();
  const madeIn = extractMadeIn();

  // Credentials (NEW)
  const certifications = extractCertifications();

  const data: ExtractedVendorData = {
    name,
    website: window.location.origin,
    logoUrl,
    heroImageUrl,
    contact,
    socialLinks,
    foundedYear,
    headquarters,
    aboutSnippet,
    story,
    ownershipType,
    parentCompany,
    madeIn,
    certifications,
    confidence: 'low', // Will be calculated
  };

  data.confidence = calculateConfidence(data);

  return data;
}

export {
  // Core identity
  extractVendorName,
  extractLogoUrl,
  extractHeroImage,
  extractContact,
  extractSocialLinks,
  // Heritage
  extractFoundedYear,
  extractHeadquarters,
  extractAboutSnippet,
  // Story
  extractVendorStory,
  extractMission,
  extractPhilosophy,
  extractHistory,
  extractCraftsmanship,
  // Credentials
  extractCertifications,
  CERTIFICATION_PATTERNS,
  // Ownership & provenance
  inferOwnershipType,
  extractParentCompany,
  extractMadeIn,
};
