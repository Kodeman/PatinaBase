/**
 * Image extraction and scoring from web pages
 */

import type { ExtractedImage } from '@patina/shared';

// URL patterns that indicate non-product images
const EXCLUDE_PATTERNS = [
  /logo/i,
  /icon/i,
  /banner/i,
  /ad[_-]?/i,
  /advertisement/i,
  /sprite/i,
  /avatar/i,
  /profile/i,
  /social/i,
  /facebook|twitter|instagram|pinterest/i,
  /payment|visa|mastercard|paypal/i,
  /badge/i,
  /rating/i,
  /star/i,
  /thumb(nail)?[_-]?(small|xs|tiny)/i,
  /placeholder/i,
  /loading/i,
  /spinner/i,
];

// URL patterns that indicate product images
const INCLUDE_PATTERNS = [
  /product/i,
  /main/i,
  /hero/i,
  /primary/i,
  /large/i,
  /full/i,
  /zoom/i,
  /detail/i,
  /gallery/i,
];

// Minimum dimensions for product images
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;

/**
 * Score an image based on various factors
 */
function scoreImage(img: HTMLImageElement, pageUrl: string): number {
  let score = 0;
  const src = img.src || img.getAttribute('data-src') || '';

  // Skip if no valid source
  if (!src || src.startsWith('data:')) return -1;

  // Get actual dimensions
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  // Size scoring (larger images are usually product images)
  if (width >= 800 && height >= 800) score += 30;
  else if (width >= 500 && height >= 500) score += 20;
  else if (width >= 300 && height >= 300) score += 10;
  else if (width < MIN_WIDTH || height < MIN_HEIGHT) return -1;

  // Aspect ratio scoring (product images typically 1:1 to 4:3)
  if (width > 0 && height > 0) {
    const ratio = width / height;
    if (ratio >= 0.75 && ratio <= 1.5) score += 15;
    else if (ratio >= 0.5 && ratio <= 2) score += 5;
  }

  // Position scoring (main content area)
  const rect = img.getBoundingClientRect();
  if (rect.top > 50 && rect.top < 800) score += 10;
  if (rect.left > 50 && rect.left < window.innerWidth - 50) score += 5;

  // URL pattern analysis
  const srcLower = src.toLowerCase();
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(srcLower)) {
      score -= 30;
      break;
    }
  }
  for (const pattern of INCLUDE_PATTERNS) {
    if (pattern.test(srcLower)) {
      score += 25;
      break;
    }
  }

  // Same domain preference (product images usually on same domain)
  try {
    const imgDomain = new URL(src).hostname;
    const pageDomain = new URL(pageUrl).hostname;
    if (imgDomain === pageDomain) score += 5;
    // CDN subdomains often used for product images
    if (imgDomain.includes(pageDomain.split('.')[0])) score += 3;
  } catch {
    // Invalid URL
  }

  // Alt text analysis
  const alt = img.alt || '';
  if (alt.length > 10) score += 10;
  if (/product|furniture|chair|table|sofa|bed|desk|lamp/i.test(alt)) score += 15;

  // Parent container analysis
  const parent = img.closest('[class*="product"], [class*="gallery"], [class*="image"], [data-product]');
  if (parent) score += 20;

  // Image gallery indicators
  if (img.closest('[class*="carousel"], [class*="slider"], [class*="swipe"]')) {
    score += 15;
  }

  // Data attributes
  if (img.getAttribute('data-zoom') || img.getAttribute('data-large')) {
    score += 20;
  }

  return score;
}

/**
 * Parse a srcset string and return the largest image URL
 */
function getLargestFromSrcset(srcset: string): string | null {
  if (!srcset) return null;

  const sources = srcset.split(',').map(s => {
    const parts = s.trim().split(/\s+/);
    const url = parts[0];
    const descriptor = parts[1] || '1x';
    let width = 0;

    if (descriptor.endsWith('w')) {
      width = parseInt(descriptor);
    } else if (descriptor.endsWith('x')) {
      width = parseFloat(descriptor) * 1000; // Approximate
    }

    return { url, width };
  });

  sources.sort((a, b) => b.width - a.width);
  return sources.length > 0 && sources[0].url ? sources[0].url : null;
}

/**
 * Get the best quality URL for an image
 */
function getBestImageUrl(img: HTMLImageElement): string {
  // Check for higher quality versions in data attributes
  const dataSrc = img.getAttribute('data-src') ||
                  img.getAttribute('data-large') ||
                  img.getAttribute('data-zoom') ||
                  img.getAttribute('data-full') ||
                  img.getAttribute('data-original') ||
                  img.getAttribute('data-lazy');

  if (dataSrc && dataSrc.startsWith('http')) {
    return dataSrc;
  }

  // Check data-srcset for lazy-loaded images
  const dataSrcset = img.getAttribute('data-srcset');
  if (dataSrcset) {
    const largest = getLargestFromSrcset(dataSrcset);
    if (largest) return largest;
  }

  // Check srcset for largest image
  if (img.srcset) {
    const largest = getLargestFromSrcset(img.srcset);
    if (largest) return largest;
  }

  return img.src;
}

/**
 * Extract images from DOM
 */
export function extractImagesFromDOM(pageUrl: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const seenUrls = new Set<string>();

  // Get all images
  const imgElements = document.querySelectorAll('img');

  for (const img of imgElements) {
    const score = scoreImage(img as HTMLImageElement, pageUrl);
    if (score < 0) continue;

    const url = getBestImageUrl(img as HTMLImageElement);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);

    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;

    images.push({
      url,
      score,
      width,
      height,
      alt: img.alt || '',
    });
  }

  // Check <picture> elements with <source> tags
  const pictureElements = document.querySelectorAll('picture');
  for (const picture of pictureElements) {
    const sources = picture.querySelectorAll('source[srcset]');
    for (const source of sources) {
      const srcset = source.getAttribute('srcset');
      if (!srcset) continue;
      const largest = getLargestFromSrcset(srcset);
      if (largest && !seenUrls.has(largest)) {
        seenUrls.add(largest);
        images.push({
          url: largest,
          score: 55,
          width: 0,
          height: 0,
          alt: picture.querySelector('img')?.alt || '',
        });
      }
    }
  }

  // Check for background images in product containers (expanded selectors)
  const productContainers = document.querySelectorAll(
    '[class*="product-image"], [class*="gallery"], [data-product-image], ' +
    '[class*="pdp"], [class*="hero"], [class*="main-image"], [class*="product-media"], ' +
    '[class*="swiper-slide"], [class*="carousel-item"], [class*="slide"], [role="img"]'
  );

  for (const container of productContainers) {
    const bgImage = window.getComputedStyle(container).backgroundImage;
    const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (match && match[1] && !seenUrls.has(match[1])) {
      seenUrls.add(match[1]);
      images.push({
        url: match[1],
        score: 50,
        width: 0,
        height: 0,
        alt: '',
      });
    }
  }

  // Check <video poster> attributes
  const videoElements = document.querySelectorAll('video[poster]');
  for (const video of videoElements) {
    const poster = video.getAttribute('poster');
    if (poster && !seenUrls.has(poster)) {
      seenUrls.add(poster);
      images.push({
        url: poster,
        score: 40,
        width: 0,
        height: 0,
        alt: '',
      });
    }
  }

  // Check JSON-LD for product images
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const jsonImages = findImagesInJsonLd(data);
      for (const url of jsonImages) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          images.push({
            url,
            score: 60, // JSON-LD images are usually product images
            width: 0,
            height: 0,
            alt: 'from JSON-LD',
          });
        }
      }
    } catch {
      // Invalid JSON
    }
  }

  // OG image fallback
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage && !seenUrls.has(ogImage)) {
    seenUrls.add(ogImage);
    images.push({
      url: ogImage,
      score: 35,
      width: 0,
      height: 0,
      alt: 'from og:image',
    });
  }

  // Sort by score descending
  images.sort((a, b) => b.score - a.score);

  console.log(`[Patina] Images: found ${images.length} (top score: ${images[0]?.score ?? 0})`);

  // Return top images (limit to prevent overwhelming)
  return images.slice(0, 20);
}

/**
 * Find images in JSON-LD data
 */
function findImagesInJsonLd(data: unknown): string[] {
  const images: string[] = [];

  if (!data || typeof data !== 'object') return images;

  const obj = data as Record<string, unknown>;

  // Check image property
  if (typeof obj.image === 'string') {
    images.push(obj.image);
  } else if (Array.isArray(obj.image)) {
    for (const img of obj.image) {
      if (typeof img === 'string') {
        images.push(img);
      } else if (typeof img === 'object' && img !== null) {
        const imgObj = img as Record<string, unknown>;
        if (typeof imgObj.url === 'string') {
          images.push(imgObj.url);
        }
      }
    }
  }

  // Recurse into arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      images.push(...findImagesInJsonLd(item));
    }
  } else {
    // Recurse into nested objects (e.g., @graph)
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        images.push(...findImagesInJsonLd(value));
      }
    }
  }

  return images;
}

export { scoreImage, getBestImageUrl };
