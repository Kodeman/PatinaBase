/**
 * Date and Time Utilities
 *
 * This module provides utilities for date formatting, manipulation, and comparison.
 * All functions work with JavaScript Date objects.
 *
 * @module utils/date
 * @since 1.0.0
 */

/**
 * Formats a Date object into a human-readable string.
 *
 * Supports three format styles:
 * - `short`: MM/DD/YYYY (e.g., "10/18/2025")
 * - `long`: Month DD, YYYY (e.g., "October 18, 2025")
 * - `iso`: ISO 8601 format (e.g., "2025-10-18T12:00:00.000Z")
 *
 * @param {Date} date - The date to format
 * @param {'short' | 'long' | 'iso'} [format='short'] - The format style to use
 * @returns {string} The formatted date string
 *
 * @example
 * const date = new Date('2025-10-18');
 *
 * formatDate(date, 'short');
 * // Returns: '10/18/2025'
 *
 * formatDate(date, 'long');
 * // Returns: 'October 18, 2025'
 *
 * formatDate(date, 'iso');
 * // Returns: '2025-10-18T00:00:00.000Z'
 *
 * @since 1.0.0
 */
export function formatDate(date: Date, format: 'short' | 'long' | 'iso' = 'short'): string {
  if (format === 'iso') {
    return date.toISOString();
  }

  const options: Intl.DateTimeFormatOptions =
    format === 'long'
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : { year: 'numeric', month: '2-digit', day: '2-digit' };

  return date.toLocaleDateString('en-US', options);
}

/**
 * Checks if a date is in the past (before the current time).
 *
 * Compares the provided date with the current date/time.
 *
 * @param {Date} date - The date to check
 * @returns {boolean} True if the date is in the past, false otherwise
 *
 * @example
 * isDateInPast(new Date('2020-01-01'));
 * // Returns: true
 *
 * @example
 * isDateInPast(new Date('2030-01-01'));
 * // Returns: false
 *
 * @since 1.0.0
 */
export function isDateInPast(date: Date): boolean {
  return date < new Date();
}

/**
 * Checks if a date is in the future (after the current time).
 *
 * Compares the provided date with the current date/time.
 *
 * @param {Date} date - The date to check
 * @returns {boolean} True if the date is in the future, false otherwise
 *
 * @example
 * isDateInFuture(new Date('2030-01-01'));
 * // Returns: true
 *
 * @example
 * isDateInFuture(new Date('2020-01-01'));
 * // Returns: false
 *
 * @since 1.0.0
 */
export function isDateInFuture(date: Date): boolean {
  return date > new Date();
}

/**
 * Adds a specified number of days to a date.
 *
 * Returns a new Date object without modifying the original date.
 *
 * @param {Date} date - The starting date
 * @param {number} days - The number of days to add (can be negative to subtract)
 * @returns {Date} A new Date object with the days added
 *
 * @example
 * const today = new Date('2025-10-18');
 * addDays(today, 7);
 * // Returns: Date representing 2025-10-25
 *
 * @example
 * const today = new Date('2025-10-18');
 * addDays(today, -7);
 * // Returns: Date representing 2025-10-11
 *
 * @since 1.0.0
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Subtracts a specified number of days from a date.
 *
 * This is a convenience function that calls `addDays` with a negative value.
 * Returns a new Date object without modifying the original date.
 *
 * @param {Date} date - The starting date
 * @param {number} days - The number of days to subtract
 * @returns {Date} A new Date object with the days subtracted
 *
 * @example
 * const today = new Date('2025-10-18');
 * subtractDays(today, 7);
 * // Returns: Date representing 2025-10-11
 *
 * @since 1.0.0
 */
export function subtractDays(date: Date, days: number): Date {
  return addDays(date, -days);
}
