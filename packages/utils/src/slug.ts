import slugify from 'slugify';

export interface SlugOptions {
  excludeId?: string;
}

/**
 * Generates a unique slug by appending a counter if the base slug already exists.
 * Useful for creating URL-friendly identifiers for products, collections, categories, etc.
 *
 * @param input - The string to slugify (e.g., product name, collection title)
 * @param findBySlug - Async function to check if a slug exists. Returns the entity with id field if exists, null otherwise.
 * @param options - Optional configuration
 * @param options.excludeId - If provided, allows this specific ID to bypass uniqueness check (useful for updates)
 * @returns A unique slug string
 *
 * @security Input validation and sanitization applied to prevent security issues:
 * - Validates input is a non-empty string
 * - Enforces maximum length of 200 characters
 * - Sanitizes dangerous characters (HTML injection, script tags)
 * - Limits retry attempts to prevent DoS attacks
 *
 * @security Consider implementing rate limiting in the calling service
 * to prevent slug generation DoS attacks. Recommended: 10 requests/minute per user.
 *
 * @throws {Error} If input is invalid, too long, or max attempts exceeded
 *
 * @example
 * ```typescript
 * const slug = await generateUniqueSlug(
 *   'My Product',
 *   (slug) => prisma.product.findUnique({ where: { slug }, select: { id: true } }),
 *   { excludeId: productId } // If updating, exclude current product from uniqueness check
 * );
 * ```
 */
export async function generateUniqueSlug<T extends { slug: string; id: string }>(
  input: string,
  findBySlug: (slug: string) => Promise<T | null>,
  options?: SlugOptions,
): Promise<string> {
  // Security: Input validation
  if (!input || typeof input !== 'string') {
    throw new Error('Input must be a non-empty string');
  }

  // Security: Prevent excessively long inputs that could cause performance issues
  if (input.length > 200) {
    throw new Error('Input too long (max 200 characters)');
  }

  // Security: Sanitize dangerous characters before processing
  // Remove HTML tags, script injection attempts, and other potentially dangerous characters
  const sanitized = input.replace(/[<>'"]/g, '');

  const baseSlug = slugify(sanitized, {
    lower: true,
    strict: true,
    trim: true,
  });

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await findBySlug(slug);

    // If no collision or it's the same entity being updated (excludeId matches)
    if (!existing || (options?.excludeId && existing.id === options.excludeId)) {
      return slug;
    }

    // Try with counter
    slug = `${baseSlug}-${counter}`;
    counter++;

    // Safety check to prevent infinite loops
    if (counter > 1000) {
      throw new Error(`Unable to generate unique slug after ${counter} attempts`);
    }
  }
}
