/**
 * Secure File Validation Utilities
 *
 * Implements defense-in-depth file validation including:
 * - Magic number (file signature) verification
 * - SVG sanitization to prevent XSS
 * - File type forgery detection
 * - Content security validation
 *
 * Security: OWASP File Upload Best Practices
 * References: CWE-434, CWE-79
 */

// Lazy import DOMPurify to avoid SSR issues with jsdom/canvas
let DOMPurify: any = null;

function getDOMPurify() {
  if (typeof window !== 'undefined' && !DOMPurify) {
    DOMPurify = require('dompurify');
  }
  return DOMPurify;
}

/**
 * File magic numbers (file signatures) for validation
 * These are the byte sequences at the start of files that identify their true type
 */
export const FILE_SIGNATURES: Record<string, number[][]> = {
  // JPEG - FF D8 FF
  'image/jpeg': [
    [0xFF, 0xD8, 0xFF, 0xE0], // JFIF
    [0xFF, 0xD8, 0xFF, 0xE1], // Exif
    [0xFF, 0xD8, 0xFF, 0xE2], // JPEG with ICC
    [0xFF, 0xD8, 0xFF, 0xE3], // JPEG with SPIFF
    [0xFF, 0xD8, 0xFF, 0xE8], // JPEG with SPIFF
  ],

  // PNG - 89 50 4E 47 0D 0A 1A 0A
  'image/png': [
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  ],

  // GIF - GIF87a or GIF89a
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],

  // WebP - RIFF....WEBP
  'image/webp': [
    [0x52, 0x49, 0x46, 0x46] // RIFF (must verify WEBP at byte 8)
  ],

  // SVG - XML or <svg
  'image/svg+xml': [
    [0x3C, 0x3F, 0x78, 0x6D, 0x6C], // <?xml
    [0x3C, 0x73, 0x76, 0x67], // <svg
    [0xEF, 0xBB, 0xBF, 0x3C, 0x73, 0x76, 0x67], // BOM + <svg
  ],

  // MP4 - ftypXXXX
  'video/mp4': [
    [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ftyp at offset 4
    [0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70],
    [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
  ],

  // WebM
  'video/webm': [
    [0x1A, 0x45, 0xDF, 0xA3]
  ],

  // PDF
  'application/pdf': [
    [0x25, 0x50, 0x44, 0x46] // %PDF
  ],
};

/**
 * Verify file signature matches declared MIME type
 * This prevents file type forgery attacks
 */
export async function verifyFileSignature(
  file: File,
  expectedType: string
): Promise<{ valid: boolean; error?: string }> {
  const signatures = FILE_SIGNATURES[expectedType];

  if (!signatures) {
    // If we don't have signatures for this type, reject it
    return {
      valid: false,
      error: `File type ${expectedType} is not supported for upload`
    };
  }

  try {
    // Read first 32 bytes for signature verification
    const arrayBuffer = await file.slice(0, 32).arrayBuffer();
    const header = new Uint8Array(arrayBuffer);

    // Check if any signature matches
    const matches = signatures.some(signature => {
      return signature.every((byte, index) => {
        // Allow wildcard matching with -1
        if (byte === -1) return true;
        return header[index] === byte;
      });
    });

    if (!matches) {
      return {
        valid: false,
        error: 'File content does not match declared type. Possible file forgery detected.'
      };
    }

    // Additional WebP validation (check WEBP at offset 8)
    if (expectedType === 'image/webp') {
      const webpMarker = [0x57, 0x45, 0x42, 0x50]; // WEBP
      const hasWebpMarker = webpMarker.every((byte, i) => header[8 + i] === byte);

      if (!hasWebpMarker) {
        return {
          valid: false,
          error: 'Invalid WebP file structure'
        };
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to verify file signature: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Sanitize SVG content to prevent XSS attacks
 * Removes all scripts, event handlers, and dangerous elements
 */
export function sanitizeSVG(svgContent: string): {
  sanitized: string;
  safe: boolean;
  removedContent: boolean;
} {
  const originalLength = svgContent.length;
  const purify = getDOMPurify();

  // Ensure DOMPurify is available (client-side only)
  if (!purify) {
    return {
      sanitized: svgContent,
      safe: false,
      removedContent: false,
    };
  }

  // Use DOMPurify with strict SVG profile
  const sanitized = purify.sanitize(svgContent, {
    USE_PROFILES: { svg: true, svgFilters: true },

    // Explicitly allowed tags
    ADD_TAGS: ['use', 'defs', 'pattern', 'linearGradient', 'radialGradient'],

    // Forbidden tags that could execute code
    FORBID_TAGS: [
      'script', 'style', 'iframe', 'object', 'embed', 'foreignObject',
      'audio', 'video', 'base', 'link', 'meta', 'frame', 'frameset'
    ],

    // Forbidden attributes that could execute code
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout',
      'onmousemove', 'onmouseenter', 'onmouseleave', 'onchange',
      'onfocus', 'onblur', 'onsubmit', 'onreset', 'onselect',
      'onkeydown', 'onkeyup', 'onkeypress', 'href', 'xlink:href'
    ],

    // Additional security settings
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true,
  });

  const sanitizedLength = sanitized.length;
  const removedContent = sanitizedLength < originalLength * 0.9;

  // Check for suspicious patterns even after sanitization
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers
    /data:text\/html/i,
    /vbscript:/i,
    /<embed/i,
    /<object/i,
    /<iframe/i,
  ];

  const hasSuspiciousContent = suspiciousPatterns.some(pattern =>
    pattern.test(sanitized)
  );

  return {
    sanitized,
    safe: !hasSuspiciousContent && !removedContent,
    removedContent,
  };
}

/**
 * Validate SVG file for security issues
 */
export async function validateSVGFile(file: File): Promise<{
  valid: boolean;
  error?: string;
  sanitized?: string;
}> {
  try {
    const content = await file.text();

    // Check file size (prevent DoS via large files)
    if (content.length > 5 * 1024 * 1024) { // 5MB limit for SVG
      return {
        valid: false,
        error: 'SVG file too large (max 5MB)'
      };
    }

    // Sanitize the SVG
    const { sanitized, safe, removedContent } = sanitizeSVG(content);

    if (!safe) {
      return {
        valid: false,
        error: 'SVG contains potentially malicious content that was removed during sanitization'
      };
    }

    if (removedContent) {
      return {
        valid: false,
        error: 'SVG contains suspicious content. Over 10% of content was removed during sanitization.'
      };
    }

    // Check for external resource references (can be used for tracking/data exfiltration)
    const externalResourcePatterns = [
      /xlink:href\s*=\s*["']?http/i,
      /<image[^>]+href\s*=\s*["']?http/i,
      /<use[^>]+href\s*=\s*["']?http/i,
      /url\s*\(\s*["']?http/i,
    ];

    const hasExternalResources = externalResourcePatterns.some(pattern =>
      pattern.test(sanitized)
    );

    if (hasExternalResources) {
      return {
        valid: false,
        error: 'SVG contains external resource references which are not allowed'
      };
    }

    return {
      valid: true,
      sanitized,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate SVG: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Comprehensive file validation with security checks
 */
export async function validateFileSecure(file: File): Promise<{
  valid: boolean;
  error?: string;
  sanitized?: string;
}> {
  // Step 1: Verify magic number matches declared type
  const signatureCheck = await verifyFileSignature(file, file.type);
  if (!signatureCheck.valid) {
    return signatureCheck;
  }

  // Step 2: Special handling for SVG files (XSS risk)
  if (file.type === 'image/svg+xml') {
    return await validateSVGFile(file);
  }

  // Step 3: Additional image validation
  if (file.type.startsWith('image/')) {
    try {
      // Attempt to load as image (additional validation)
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve();
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('File is not a valid image'));
        };

        img.src = url;
      });
    } catch (error) {
      return {
        valid: false,
        error: 'File appears to be corrupted or is not a valid image'
      };
    }
  }

  return { valid: true };
}

/**
 * Generate secure filename that prevents directory traversal
 */
export function sanitizeFilename(filename: string): string {
  // Remove directory traversal patterns
  let safe = filename.replace(/[\/\\]/g, '_');

  // Remove null bytes
  safe = safe.replace(/\0/g, '');

  // Remove control characters
  safe = safe.replace(/[\x00-\x1F\x7F]/g, '');

  // Limit length
  if (safe.length > 255) {
    const ext = safe.slice(safe.lastIndexOf('.'));
    safe = safe.slice(0, 255 - ext.length) + ext;
  }

  return safe;
}

/**
 * Calculate file hash for deduplication
 */
export async function calculateSecureHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
