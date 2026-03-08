/**
 * Validation Utilities
 *
 * This module provides a set of validation functions for common data types and formats.
 * All validators return boolean values indicating whether the input passes validation.
 *
 * @module utils/validation
 * @since 1.0.0
 */

/**
 * Validates if a string is a properly formatted email address.
 *
 * Uses a simple regex pattern that matches most common email formats.
 * For production use, consider using a more robust library like validator.js
 * or email-validator for comprehensive validation.
 *
 * @param {string} value - The email address to validate
 * @returns {boolean} True if the value is a valid email format, false otherwise
 *
 * @example
 * isEmail('user@example.com');
 * // Returns: true
 *
 * @example
 * isEmail('invalid.email');
 * // Returns: false
 *
 * @example
 * isEmail('user+tag@subdomain.example.com');
 * // Returns: true
 *
 * @see {@link https://www.npmjs.com/package/validator} for more comprehensive email validation
 * @since 1.0.0
 */
export function isEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Validates if a string is a properly formatted phone number.
 *
 * This is a basic phone number validator that accepts various formats including:
 * - International format: +1 234-567-8900
 * - Domestic format: (234) 567-8900
 * - Simple format: 234-567-8900 or 2345678900
 *
 * Note: This does not validate if the phone number actually exists or is active.
 * For production use, consider using libphonenumber-js for comprehensive validation.
 *
 * @param {string} value - The phone number string to validate
 * @returns {boolean} True if the value matches a phone number format, false otherwise
 *
 * @example
 * isPhone('+1 234-567-8900');
 * // Returns: true
 *
 * @example
 * isPhone('(234) 567-8900');
 * // Returns: true
 *
 * @example
 * isPhone('invalid-phone');
 * // Returns: false
 *
 * @see {@link https://www.npmjs.com/package/libphonenumber-js} for robust phone validation
 * @since 1.0.0
 */
export function isPhone(value: string): boolean {
  const phoneRegex = /^\+?[\d\s-()]+$/;
  return phoneRegex.test(value);
}

/**
 * Validates if a string is a properly formatted URL.
 *
 * Uses the native URL constructor for validation, which is strict and follows
 * the WHATWG URL Standard. This ensures the URL is parseable and has a valid scheme.
 *
 * @param {string} value - The URL string to validate
 * @returns {boolean} True if the value is a valid URL, false otherwise
 *
 * @example
 * isURL('https://example.com');
 * // Returns: true
 *
 * @example
 * isURL('http://localhost:3000/path?query=value');
 * // Returns: true
 *
 * @example
 * isURL('not-a-url');
 * // Returns: false
 *
 * @example
 * isURL('ftp://files.example.com/file.zip');
 * // Returns: true (supports various schemes)
 *
 * @see {@link https://url.spec.whatwg.org/} for URL specification
 * @since 1.0.0
 */
export function isURL(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a value is considered empty.
 *
 * This function handles multiple data types:
 * - null or undefined: considered empty
 * - string: empty if trimmed length is 0
 * - array: empty if length is 0
 * - object: empty if it has no own properties
 *
 * @param {unknown} value - The value to check for emptiness
 * @returns {boolean} True if the value is empty, false otherwise
 *
 * @example
 * // Null/undefined
 * isEmpty(null);
 * // Returns: true
 *
 * @example
 * // Strings
 * isEmpty('');
 * // Returns: true
 * isEmpty('   ');
 * // Returns: true
 * isEmpty('hello');
 * // Returns: false
 *
 * @example
 * // Arrays
 * isEmpty([]);
 * // Returns: true
 * isEmpty([1, 2, 3]);
 * // Returns: false
 *
 * @example
 * // Objects
 * isEmpty({});
 * // Returns: true
 * isEmpty({ key: 'value' });
 * // Returns: false
 *
 * @since 1.0.0
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Validates if a string is a properly formatted UUID (Universally Unique Identifier).
 *
 * Supports UUID versions 1-5 as defined in RFC 4122. The validation is case-insensitive.
 *
 * Format: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
 * Where:
 * - M is the UUID version (1-5)
 * - N is the variant (8, 9, a, or b)
 *
 * @param {string} value - The UUID string to validate
 * @returns {boolean} True if the value is a valid UUID format, false otherwise
 *
 * @example
 * // Valid UUIDs
 * isUUID('550e8400-e29b-41d4-a716-446655440000');
 * // Returns: true
 *
 * @example
 * isUUID('123e4567-e89b-12d3-a456-426614174000');
 * // Returns: true
 *
 * @example
 * // Invalid UUIDs
 * isUUID('not-a-uuid');
 * // Returns: false
 *
 * @example
 * isUUID('550e8400-e29b-41d4-a716');
 * // Returns: false (too short)
 *
 * @see {@link https://tools.ietf.org/html/rfc4122} for UUID specification
 * @since 1.0.0
 */
export function isUUID(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}
