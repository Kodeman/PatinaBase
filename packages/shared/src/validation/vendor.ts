import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Enum Schemas ─────────────────────────────────────────────────────────

export const marketPositionSchema = z.enum(['entry', 'mid', 'premium', 'luxury', 'ultra-luxury']);

export const productionModelSchema = z.enum(['stock', 'mto', 'custom', 'mixed']);

export const accountStatusSchema = z.enum(['none', 'pending', 'active']);

export const ownershipTypeSchema = z.enum(['family', 'private', 'pe-backed', 'public']);

export const leadTimeAccuracySchema = z.enum(['faster', 'as_expected', 'slower']);

// ─── Filter Schema ────────────────────────────────────────────────────────

export const vendorFilterSchema = z.object({
  search: z.string().optional(),
  categories: z.array(z.string()).optional(),
  marketPositions: z.array(marketPositionSchema).optional(),
  accountStatus: accountStatusSchema.optional(),
  minRating: z.number().min(1).max(5).optional(),
  certifications: z.array(z.string()).optional(),
  productionModels: z.array(productionModelSchema).optional(),
  hasQuickShip: z.boolean().optional(),
});

// ─── Review Schemas ───────────────────────────────────────────────────────

export const vendorReviewSchema = z.object({
  ratings: z.object({
    quality: z.number().int().min(1).max(5),
    finish: z.number().int().min(1).max(5),
    delivery: z.number().int().min(1).max(5),
    service: z.number().int().min(1).max(5),
    value: z.number().int().min(1).max(5),
  }),
  specializations: z.array(z.string()).min(1, 'Select at least one specialization'),
  writtenReview: z.string().max(2000).optional(),
  leadTimeAccuracy: leadTimeAccuracySchema.optional(),
  leadTimeWeeksOver: z.number().int().min(0).optional(),
  hasOrderedRecently: z.boolean(),
});

// ─── Vendor Create/Update Schemas ─────────────────────────────────────────

export const vendorCreateSchema = z.object({
  name: z.string().min(1).max(255),
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  marketPosition: marketPositionSchema.optional(),
  productionModel: productionModelSchema.optional(),
  foundedYear: z.number().int().min(1800).max(2100).optional(),
  ownership: ownershipTypeSchema.optional(),
  headquartersCity: z.string().max(100).optional(),
  headquartersState: z.string().max(50).optional(),
  primaryCategory: z.string().max(100).optional(),
  secondaryCategories: z.array(z.string()).optional(),
  tradeTerms: z.string().max(2000).optional(),
  notes: z.string().max(500).optional(),
});

export const vendorUpdateSchema = vendorCreateSchema.partial();

// ─── Trade Account Schemas ────────────────────────────────────────────────

export const tradeAccountApplicationSchema = z.object({
  vendorId: z.string().uuid(),
  message: z.string().max(1000).optional(),
});

// ─── Specialization Schemas ───────────────────────────────────────────────

export const specializationVoteSchema = z.object({
  specializationId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
});

// ─── Type Exports ─────────────────────────────────────────────────────────

export type MarketPosition = z.infer<typeof marketPositionSchema>;
export type ProductionModel = z.infer<typeof productionModelSchema>;
export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type OwnershipType = z.infer<typeof ownershipTypeSchema>;
export type LeadTimeAccuracy = z.infer<typeof leadTimeAccuracySchema>;
export type VendorFilters = z.infer<typeof vendorFilterSchema>;
export type VendorReviewInput = z.infer<typeof vendorReviewSchema>;
export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;
export type TradeAccountApplication = z.infer<typeof tradeAccountApplicationSchema>;
export type SpecializationVote = z.infer<typeof specializationVoteSchema>;
