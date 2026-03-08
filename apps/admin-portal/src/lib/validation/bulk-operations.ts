/**
 * Bulk Operations Validation
 *
 * Zod schemas for validating bulk operation inputs to prevent injection attacks
 * and ensure data integrity.
 *
 * Security Features:
 * - UUID format validation
 * - Batch size limits
 * - Required field validation
 * - Type safety
 *
 * @module lib/validation/bulk-operations
 */

import { z } from 'zod';

/**
 * UUID v4 regex pattern
 * Ensures only valid UUIDs are accepted, preventing injection
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Maximum products allowed per bulk operation
 * Prevents DoS attacks through excessive batch sizes
 */
export const MAX_BULK_BATCH_SIZE = 100;

/**
 * Maximum length for reason fields
 */
export const MAX_REASON_LENGTH = 500;

/**
 * Product ID schema with UUID validation
 */
export const ProductIdSchema = z
  .string()
  .regex(UUID_REGEX, 'Invalid product ID format')
  .describe('Product UUID');

/**
 * Product status enum
 */
export const ProductStatusSchema = z.enum(['draft', 'in_review', 'published', 'deprecated'], {
  errorMap: () => ({ message: 'Invalid product status' }),
});

/**
 * Bulk operation base schema
 * Validates array of product IDs with size constraints
 */
export const BulkOperationSchema = z.object({
  productIds: z
    .array(ProductIdSchema)
    .min(1, 'At least one product ID required')
    .max(MAX_BULK_BATCH_SIZE, `Maximum ${MAX_BULK_BATCH_SIZE} products per batch`),
  reason: z
    .string()
    .max(MAX_REASON_LENGTH, `Reason must be ${MAX_REASON_LENGTH} characters or less`)
    .optional(),
});

/**
 * Bulk publish schema
 */
export const BulkPublishSchema = z.object({
  productIds: z
    .array(ProductIdSchema)
    .min(1, 'At least one product ID required')
    .max(MAX_BULK_BATCH_SIZE, `Maximum ${MAX_BULK_BATCH_SIZE} products per batch`),
});

/**
 * Bulk unpublish schema with required reason
 */
export const BulkUnpublishSchema = z.object({
  productIds: z
    .array(ProductIdSchema)
    .min(1, 'At least one product ID required')
    .max(MAX_BULK_BATCH_SIZE, `Maximum ${MAX_BULK_BATCH_SIZE} products per batch`),
  reason: z
    .string()
    .min(1, 'Reason is required for unpublishing')
    .max(MAX_REASON_LENGTH, `Reason must be ${MAX_REASON_LENGTH} characters or less`),
});

/**
 * Bulk delete schema
 */
export const BulkDeleteSchema = z.object({
  productIds: z
    .array(ProductIdSchema)
    .min(1, 'At least one product ID required')
    .max(MAX_BULK_BATCH_SIZE, `Maximum ${MAX_BULK_BATCH_SIZE} products per batch`),
  soft: z.boolean().optional(),
});

/**
 * Bulk update status schema
 */
export const BulkUpdateStatusSchema = z.object({
  productIds: z
    .array(ProductIdSchema)
    .min(1, 'At least one product ID required')
    .max(MAX_BULK_BATCH_SIZE, `Maximum ${MAX_BULK_BATCH_SIZE} products per batch`),
  status: ProductStatusSchema,
});

/**
 * Type exports for use in components/services
 */
export type BulkOperationInput = z.infer<typeof BulkOperationSchema>;
export type BulkPublishInput = z.infer<typeof BulkPublishSchema>;
export type BulkUnpublishInput = z.infer<typeof BulkUnpublishSchema>;
export type BulkDeleteInput = z.infer<typeof BulkDeleteSchema>;
export type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusSchema>;

/**
 * Validates product ID
 *
 * @param productId - ID to validate
 * @returns Validation result
 */
export function validateProductId(productId: string): { success: boolean; error?: string } {
  try {
    ProductIdSchema.parse(productId);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || 'Invalid product ID',
      };
    }
    return { success: false, error: 'Validation failed' };
  }
}

/**
 * Validates array of product IDs
 *
 * @param productIds - IDs to validate
 * @returns Validation result with invalid IDs
 */
export function validateProductIds(
  productIds: string[]
): { success: boolean; invalidIds?: string[]; error?: string } {
  const invalidIds: string[] = [];

  for (const id of productIds) {
    if (!UUID_REGEX.test(id)) {
      invalidIds.push(id);
    }
  }

  if (invalidIds.length > 0) {
    return {
      success: false,
      invalidIds,
      error: `Invalid product IDs: ${invalidIds.join(', ')}`,
    };
  }

  if (productIds.length > MAX_BULK_BATCH_SIZE) {
    return {
      success: false,
      error: `Maximum ${MAX_BULK_BATCH_SIZE} products per batch`,
    };
  }

  return { success: true };
}
