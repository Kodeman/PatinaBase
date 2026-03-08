/**
 * Input Sanitization Utilities
 *
 * Provides XSS protection through DOMPurify and input validation.
 *
 * Security Features:
 * - XSS attack prevention via DOMPurify
 * - Length enforcement to prevent DoS
 * - Suspicious pattern detection
 * - Security event logging
 *
 * @module lib/security/sanitize
 */

import DOMPurify from 'dompurify';

/**
 * Maximum allowed lengths for different input types
 */
export const MAX_SEARCH_LENGTH = 200;
export const MAX_FILTER_LENGTH = 100;
export const MAX_REASON_LENGTH = 500;
export const MAX_GENERAL_INPUT_LENGTH = 1000;

/**
 * Patterns that may indicate XSS or injection attempts
 */
const SUSPICIOUS_PATTERNS = [
  /<script/i,
  /<\/script>/i,
  /javascript:/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /onclick\s*=/i,
  /onmouseover\s*=/i,
  /<iframe/i,
  /<embed/i,
  /<object/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
  /vbscript:/i,
  /data:text\/html/i,
];

/**
 * Sanitizes user input to prevent XSS attacks
 *
 * @param input - Raw user input
 * @param maxLength - Maximum allowed length (default: 200)
 * @returns Sanitized string safe for rendering
 *
 * @example
 * ```typescript
 * const userInput = '<script>alert("XSS")</script>Hello';
 * const safe = sanitizeInput(userInput);
 * // Returns: 'Hello'
 * ```
 */
export function sanitizeInput(input: string, maxLength: number = MAX_SEARCH_LENGTH): string {
  if (!input) {
    return '';
  }

  // Trim and enforce length limit
  const trimmed = String(input).trim().slice(0, maxLength);

  // Sanitize with DOMPurify - strip ALL HTML tags
  const sanitized = DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: [], // No HTML allowed
    ALLOWED_ATTR: [], // No attributes allowed
    KEEP_CONTENT: true, // Keep text content
  });

  return sanitized;
}

/**
 * Sanitizes text that may contain safe HTML
 * Use only for trusted content like rich text editors
 *
 * @param input - Raw HTML input
 * @param maxLength - Maximum allowed length
 * @returns Sanitized HTML
 */
export function sanitizeHtml(input: string, maxLength: number = MAX_GENERAL_INPUT_LENGTH): string {
  if (!input) {
    return '';
  }

  const trimmed = String(input).slice(0, maxLength);

  // Allow safe HTML tags only
  const sanitized = DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
  });

  return sanitized;
}

/**
 * Detects suspicious patterns in user input
 *
 * @param input - User input to check
 * @returns True if suspicious patterns detected
 *
 * @example
 * ```typescript
 * detectSuspiciousInput('<script>'); // true
 * detectSuspiciousInput('normal text'); // false
 * ```
 */
export function detectSuspiciousInput(input: string): boolean {
  if (!input) {
    return false;
  }

  return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Validates input length
 *
 * @param input - Input to validate
 * @param maxLength - Maximum allowed length
 * @returns True if within limits
 */
export function validateLength(input: string, maxLength: number): boolean {
  return input.length <= maxLength;
}

/**
 * Logs security events for monitoring
 * In production, this should send to a security monitoring service
 *
 * @param event - Event type
 * @param data - Event data
 */
export function logSecurityEvent(event: string, data: any): void {
  const timestamp = new Date().toISOString();

  console.warn(`[SECURITY] ${timestamp} - ${event}:`, {
    ...data,
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
  });

  // TODO: Send to security monitoring service (Sentry, DataDog, etc.)
  // Example:
  // Sentry.captureMessage(`Security Event: ${event}`, {
  //   level: 'warning',
  //   extra: data,
  // });
}

/**
 * Sanitizes an array of strings
 *
 * @param inputs - Array of strings to sanitize
 * @param maxLength - Maximum length per item
 * @returns Sanitized array
 */
export function sanitizeArray(inputs: string[], maxLength: number = MAX_FILTER_LENGTH): string[] {
  return inputs.map(input => sanitizeInput(input, maxLength));
}

/**
 * Sanitizes search query with special handling
 *
 * @param query - Search query
 * @returns Sanitized query
 */
export function sanitizeSearchQuery(query: string): string {
  // Check for suspicious patterns first
  if (detectSuspiciousInput(query)) {
    logSecurityEvent('suspicious_search_query', { query });
  }

  return sanitizeInput(query, MAX_SEARCH_LENGTH);
}

/**
 * Sanitizes filter value
 *
 * @param value - Filter value
 * @returns Sanitized value
 */
export function sanitizeFilterValue(value: string): string {
  if (detectSuspiciousInput(value)) {
    logSecurityEvent('suspicious_filter_value', { value });
  }

  return sanitizeInput(value, MAX_FILTER_LENGTH);
}
