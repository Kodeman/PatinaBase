/**
 * String Manipulation Utilities
 *
 * This module provides a comprehensive set of string transformation and manipulation functions
 * for consistent text processing across the Patina platform.
 *
 * @module utils/string
 * @since 1.0.0
 */

/**
 * Capitalizes the first letter of a string and lowercases the rest.
 *
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string
 *
 * @example
 * capitalize('hello world');
 * // Returns: 'Hello world'
 *
 * @example
 * capitalize('HELLO WORLD');
 * // Returns: 'Hello world'
 *
 * @since 1.0.0
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Converts a string to a URL-friendly slug format.
 *
 * This function:
 * - Converts to lowercase
 * - Removes non-alphanumeric characters (except spaces and hyphens)
 * - Replaces spaces and underscores with hyphens
 * - Removes leading and trailing hyphens
 *
 * @param {string} str - The string to slugify
 * @returns {string} The slugified string
 *
 * @example
 * // Basic usage
 * slugify('Hello World');
 * // Returns: 'hello-world'
 *
 * @example
 * // With special characters
 * slugify('Product Name @#$% Test');
 * // Returns: 'product-name-test'
 *
 * @example
 * // With multiple spaces
 * slugify('   Multiple   Spaces   ');
 * // Returns: 'multiple-spaces'
 *
 * @see {@link https://www.npmjs.com/package/slugify} for advanced slugification
 * @since 1.0.0
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Converts a string to camelCase format.
 *
 * Transforms strings with spaces, hyphens, or underscores into camelCase format
 * (first word lowercase, subsequent words capitalized with no separators).
 *
 * @param {string} str - The string to convert
 * @returns {string} The camelCased string
 *
 * @example
 * // From space-separated
 * camelCase('hello world');
 * // Returns: 'helloWorld'
 *
 * @example
 * // From kebab-case
 * camelCase('product-item-name');
 * // Returns: 'productItemName'
 *
 * @example
 * // Already camelCase
 * camelCase('alreadyCamelCase');
 * // Returns: 'alreadyCamelCase'
 *
 * @since 1.0.0
 */
export function camelCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    )
    .replace(/\s+/g, '');
}

/**
 * Converts a string to kebab-case format (lowercase with hyphens).
 *
 * Useful for CSS class names, file names, and URL slugs.
 *
 * @param {string} str - The string to convert
 * @returns {string} The kebab-cased string
 *
 * @example
 * // From camelCase
 * kebabCase('productItemName');
 * // Returns: 'product-item-name'
 *
 * @example
 * // From space-separated
 * kebabCase('Product Item Name');
 * // Returns: 'product-item-name'
 *
 * @example
 * // From snake_case
 * kebabCase('product_item_name');
 * // Returns: 'product-item-name'
 *
 * @since 1.0.0
 */
export function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Converts a string to snake_case format (lowercase with underscores).
 *
 * Commonly used for database column names, API parameters, and JSON keys.
 *
 * @param {string} str - The string to convert
 * @returns {string} The snake_cased string
 *
 * @example
 * // From camelCase
 * snakeCase('productItemName');
 * // Returns: 'product_item_name'
 *
 * @example
 * // From space-separated
 * snakeCase('Product Item Name');
 * // Returns: 'product_item_name'
 *
 * @example
 * // From kebab-case
 * snakeCase('product-item-name');
 * // Returns: 'product_item_name'
 *
 * @since 1.0.0
 */
export function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}
