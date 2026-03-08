import { z } from 'zod';
import { queryTransforms } from './with-validation';

/**
 * Common validation schemas for reuse across API routes
 */

// ============================================================================
// UUID Schemas
// ============================================================================

/** UUID string validation */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/** URL parameter with UUID */
export const uuidParamSchema = z.object({
  id: uuidSchema,
});

/** Multiple UUIDs (comma-separated or array) */
export const uuidArraySchema = z.union([
  z.array(uuidSchema),
  z.string().transform((val) => val.split(',').map((s) => s.trim())),
]).pipe(z.array(uuidSchema));

// ============================================================================
// Pagination Schemas
// ============================================================================

/** Standard pagination query parameters */
export const paginationSchema = z.object({
  /** Page number (1-indexed) */
  page: queryTransforms.integer.default('1').refine((val) => val > 0, {
    message: 'Page must be greater than 0',
  }),
  /** Page size/limit */
  pageSize: queryTransforms.integer.default('20').refine(
    (val) => val > 0 && val <= 100,
    {
      message: 'Page size must be between 1 and 100',
    }
  ),
});

/** Cursor-based pagination query parameters */
export const cursorPaginationSchema = z.object({
  /** Cursor for next page */
  cursor: z.string().optional(),
  /** Number of items to return */
  limit: queryTransforms.integer.default('20').refine(
    (val) => val > 0 && val <= 100,
    {
      message: 'Limit must be between 1 and 100',
    }
  ),
});

// ============================================================================
// Sorting Schemas
// ============================================================================

/** Sort order */
export const sortOrderSchema = z.enum(['asc', 'desc']);

/** Generic sort schema */
export const sortSchema = z.object({
  /** Field to sort by */
  sortBy: z.string().optional(),
  /** Sort order */
  sortOrder: sortOrderSchema.optional().default('asc'),
});

// ============================================================================
// Filtering Schemas
// ============================================================================

/** Date range filter */
export const dateRangeSchema = z.object({
  /** Start date (ISO 8601) */
  startDate: z.string().datetime().optional(),
  /** End date (ISO 8601) */
  endDate: z.string().datetime().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  {
    message: 'Start date must be before or equal to end date',
  }
);

/** Search query */
export const searchSchema = z.object({
  /** Search term */
  q: z.string().min(1, 'Search query cannot be empty').optional(),
  /** Search field(s) */
  fields: queryTransforms.array().optional(),
});

/** Status filter (generic) */
export const statusFilterSchema = <T extends readonly [string, ...string[]]>(
  statuses: T
) =>
  z.object({
    status: z.enum(statuses).optional(),
  });

// ============================================================================
// Combined Query Schemas
// ============================================================================

/** Standard list query (pagination + sorting) */
export const listQuerySchema = paginationSchema.merge(sortSchema);

/** Full-featured list query (pagination + sorting + search) */
export const searchableListQuerySchema = paginationSchema
  .merge(sortSchema)
  .merge(searchSchema);

// ============================================================================
// Body Schemas
// ============================================================================

/** Email validation */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();

/** Password validation (minimum requirements) */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

/** URL validation */
export const urlSchema = z.string().url('Invalid URL format');

/** Phone number validation (E.164 format) */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format (use E.164 format: +1234567890)');

/** Color hex code validation */
export const hexColorSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color format');

/** Slug validation (URL-friendly string) */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format (use lowercase letters, numbers, and hyphens)');

// ============================================================================
// File Upload Schemas
// ============================================================================

/** File upload metadata */
export const fileUploadSchema = z.object({
  /** File name */
  filename: z.string().min(1, 'Filename is required'),
  /** MIME type */
  mimeType: z.string().min(1, 'MIME type is required'),
  /** File size in bytes */
  size: z.number().positive('File size must be positive'),
  /** Optional file key/path in storage */
  key: z.string().optional(),
});

/** Image upload with dimension constraints */
export const imageUploadSchema = fileUploadSchema.extend({
  /** Image width in pixels */
  width: z.number().positive().optional(),
  /** Image height in pixels */
  height: z.number().positive().optional(),
}).refine(
  (data) => {
    // Validate MIME type is an image
    return data.mimeType.startsWith('image/');
  },
  {
    message: 'File must be an image',
  }
);

// ============================================================================
// Geo/Location Schemas
// ============================================================================

/** Latitude/longitude coordinates */
export const coordinatesSchema = z.object({
  /** Latitude (-90 to 90) */
  latitude: z.number().min(-90).max(90),
  /** Longitude (-180 to 180) */
  longitude: z.number().min(-180).max(180),
});

/** Address schema */
export const addressSchema = z.object({
  /** Street address line 1 */
  line1: z.string().min(1, 'Address line 1 is required'),
  /** Street address line 2 (optional) */
  line2: z.string().optional(),
  /** City */
  city: z.string().min(1, 'City is required'),
  /** State/province/region */
  state: z.string().min(1, 'State is required'),
  /** Postal/ZIP code */
  postalCode: z.string().min(1, 'Postal code is required'),
  /** Country code (ISO 3166-1 alpha-2) */
  country: z.string().length(2, 'Country must be a 2-letter ISO code'),
});

// ============================================================================
// Common HTTP Method Schemas
// ============================================================================

/** Empty body schema (for methods that shouldn't have a body) */
export const emptyBodySchema = z.object({}).strict();

/** Generic success response with message */
export const messageResponseSchema = z.object({
  message: z.string(),
});
