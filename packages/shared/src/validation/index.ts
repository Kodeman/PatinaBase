import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const uuidSchema = z.string().uuid();

// ─── Product Schemas ───────────────────────────────────────────────────────

export const productDimensionsSchema = z.object({
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  depth: z.number().positive().nullable(),
  unit: z.enum(['in', 'cm']),
});

export const productCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  priceRetail: z.number().positive().optional(),
  priceTrade: z.number().positive().optional(),
  dimensions: productDimensionsSchema.optional(),
  materials: z.array(z.string()).optional(),
  sourceUrl: z.string().url(),
  images: z.array(z.string().url()).min(1),
  vendorId: uuidSchema.optional(),
});

export const productUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  priceRetail: z.number().positive().optional(),
  priceTrade: z.number().positive().optional(),
  dimensions: productDimensionsSchema.optional(),
  materials: z.array(z.string()).optional(),
  qualityScore: z.number().min(0).max(100).optional(),
});

// ─── Style Schemas ─────────────────────────────────────────────────────────

export const styleCreateSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: uuidSchema.optional(),
  description: z.string().max(500).optional(),
  visualMarkers: z.array(z.string()).optional(),
});

// ─── Capture Schemas ───────────────────────────────────────────────────────

export const captureRequestSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(255),
  price: z.string().nullable(),
  images: z.array(z.string().url()),
  description: z.string().nullable(),
  dimensions: z.string().nullable(),
  projectId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
});

// ─── Search & Filter Schemas ───────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const productFilterSchema = z.object({
  search: z.string().optional(),
  styleIds: z.array(uuidSchema).optional(),
  vendorIds: z.array(uuidSchema).optional(),
  priceMin: z.number().positive().optional(),
  priceMax: z.number().positive().optional(),
  materials: z.array(z.string()).optional(),
});

// ─── Extraction Schemas ───────────────────────────────────────────────────

export const extractionConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const extractedPriceSchema = z.object({
  value: z.number().int().positive(), // cents
  currency: z.string().min(1).max(10),
  raw: z.string(),
});

export const extractedDimensionsSchema = z.object({
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  depth: z.number().positive().nullable(),
  unit: z.enum(['in', 'cm']),
  raw: z.string(),
});

export const extractedImageSchema = z.object({
  url: z.string().url(),
  score: z.number().min(0).max(100),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string(),
});

export const extractedProductDataSchema = z.object({
  productName: z.string().nullable(),
  price: extractedPriceSchema.nullable(),
  dimensions: extractedDimensionsSchema.nullable(),
  materials: z.array(z.string()),
  images: z.array(extractedImageSchema),
  manufacturer: z.string().nullable(),
  url: z.string().url(),
  extractedAt: z.string().datetime(),
  confidence: extractionConfidenceSchema,
});

export const quickCaptureRequestSchema = captureRequestSchema.extend({
  primaryImageIndex: z.number().int().min(0),
  styleIds: z.array(uuidSchema),
  isPersonalCatalog: z.boolean(),
  extractionConfidence: extractionConfidenceSchema,
});

// ─── Collection & Tag Schemas ─────────────────────────────────────────────

export const collectionCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  coverImage: z.string().url().optional(),
  isPublic: z.boolean().optional(),
});

export const tagCreateSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// ─── Teaching Schemas ─────────────────────────────────────────────────────

export const spectrumDimensionSchema = z.enum([
  'warmth',
  'complexity',
  'formality',
  'timelessness',
  'boldness',
  'craftsmanship',
]);

export const spectrumValueSchema = z.number().min(-1).max(1).nullable();

export const spectrumValuesSchema = z.object({
  warmth: spectrumValueSchema,
  complexity: spectrumValueSchema,
  formality: spectrumValueSchema,
  timelessness: spectrumValueSchema,
  boldness: spectrumValueSchema,
  craftsmanship: spectrumValueSchema,
});

export const appealCategorySchema = z.enum(['visual', 'functional', 'emotional', 'lifestyle']);

export const teachingModeSchema = z.enum(['embedded', 'quick_tags', 'deep_analysis', 'validation']);

export const teachingPrioritySchema = z.enum(['high', 'normal', 'low']);

export const teachingStatusSchema = z.enum([
  'pending',
  'in_progress',
  'needs_validation',
  'validated',
  'conflict',
]);

export const validationVoteSchema = z.enum(['confirm', 'adjust', 'flag']);

export const productClientMatchInputSchema = z.object({
  archetypeId: uuidSchema,
  matchStrength: z.number().min(0).max(1).optional(),
  isAvoidance: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const validationAdjustmentsSchema = z.object({
  primaryStyleId: uuidSchema.optional(),
  secondaryStyleId: uuidSchema.optional(),
  spectrum: spectrumValuesSchema.partial().optional(),
  clientMatches: z.array(productClientMatchInputSchema).optional(),
  appealSignalIds: z.array(uuidSchema).optional(),
  notes: z.string().max(1000).optional(),
});

export const validationInputSchema = z.object({
  vote: validationVoteSchema,
  adjustments: validationAdjustmentsSchema.optional(),
  flagReason: z.string().max(500).optional(),
});

export const productTeachingInputSchema = z.object({
  primaryStyleId: uuidSchema.optional(),
  secondaryStyleId: uuidSchema.optional(),
  spectrum: spectrumValuesSchema.partial().optional(),
  idealClientIds: z.array(uuidSchema).optional(),
  avoidanceClientIds: z.array(uuidSchema).optional(),
  appealSignalIds: z.array(uuidSchema).optional(),
  notes: z.string().max(1000).optional(),
});

export const teachingQueueFilterSchema = z.object({
  status: z.array(teachingStatusSchema).optional(),
  priority: z.array(teachingPrioritySchema).optional(),
  assignedTo: uuidSchema.optional(),
  requiresDeepAnalysis: z.boolean().optional(),
});

export const teachingSessionInputSchema = z.object({
  mode: teachingModeSchema,
});

// ─── Type Exports ──────────────────────────────────────────────────────────
// Note: Most types are defined in ./types/index.ts and ./types/teaching.ts
// These are only for types that don't have equivalents in the types files

export type Pagination = z.infer<typeof paginationSchema>;
export type ProductFilter = z.infer<typeof productFilterSchema>;

// ─── Re-exports ───────────────────────────────────────────────────────────

export * from './vendor';

export * from './analytics';

export * from './notifications';
