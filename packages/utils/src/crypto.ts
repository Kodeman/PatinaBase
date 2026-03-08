/**
 * Cryptography and Hashing Utilities
 */

import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'crypto';

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Generate a secure random integer in range [0, max)
 */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('maxExclusive must be a positive integer');
  }

  return randomInt(maxExclusive);
}

/**
 * Select a secure random character from a charset
 */
export function secureRandomPasswordCharacter(charset: string): string {
  if (!charset || charset.length === 0) {
    throw new Error('charset must be a non-empty string');
  }

  return charset.charAt(secureRandomInt(charset.length));
}

const DEFAULT_IDENTIFIER_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generate a secure random identifier suffix
 */
export function generateIdentifierSuffix(
  length: number = 6,
  alphabet: string = DEFAULT_IDENTIFIER_ALPHABET,
): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('length must be a positive integer');
  }
  if (!alphabet || alphabet.length === 0) {
    throw new Error('alphabet must be a non-empty string');
  }

  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet.charAt(secureRandomInt(alphabet.length));
  }
  return result;
}

/**
 * Hash a string with SHA-256
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Hash a string with SHA-512
 */
export function sha512(input: string): string {
  return createHash('sha512').update(input).digest('hex');
}

/**
 * Create HMAC signature
 */
export function hmacSha256(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifyHmac(data: string, signature: string, secret: string): boolean {
  const expected = hmacSha256(data, secret);
  return timingSafeEqual(expected, signature);
}

/**
 * Timing-safe string comparison
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Hash sensitive data (email, phone) for indexing
 * Uses SHA-256 for one-way hashing
 */
export function hashSensitiveData(input: string): string {
  return sha256(input.toLowerCase().trim());
}

/**
 * Generate a slug-safe random ID
 */
export function generateSlugId(prefix?: string): string {
  const random = randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${random}` : random;
}

/**
 * Mask sensitive string (for display/logging)
 */
export function maskString(input: string, visibleStart: number = 4, visibleEnd: number = 4): string {
  if (input.length <= visibleStart + visibleEnd) {
    return '*'.repeat(input.length);
  }

  const start = input.substring(0, visibleStart);
  const end = input.substring(input.length - visibleEnd);
  const masked = '*'.repeat(input.length - visibleStart - visibleEnd);

  return `${start}${masked}${end}`;
}

/**
 * Mask email address
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return maskString(email, 2, 2);

  const maskedLocal = maskString(local, Math.min(2, local.length - 1), 0);
  return `${maskedLocal}@${domain}`;
}

/**
 * Mask credit card number
 */
export function maskCardNumber(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');
  return maskString(cleaned, 0, 4);
}

/**
 * Hash for idempotency key
 */
export function generateIdempotencyKey(data: Record<string, unknown>): string {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return sha256(normalized);
}
