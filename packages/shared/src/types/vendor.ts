// ═══════════════════════════════════════════════════════════════════════════
// VENDOR MANAGEMENT TYPES
// Vendor profiles, trade accounts, reviews, and directory filtering
// ═══════════════════════════════════════════════════════════════════════════

import type { UUID } from './index';
import type { MarketPosition, ProductionModel, OwnershipType } from './extraction';

// Re-export for convenience
export type { MarketPosition, ProductionModel, OwnershipType } from './extraction';

// ─── Enum Types (defined here to avoid Zod runtime dependency) ───────────────

export type AccountStatus = 'none' | 'pending' | 'active';
export type LeadTimeAccuracy = 'faster' | 'as_expected' | 'slower';
export type ApplicationStatus = 'submitted' | 'under-review' | 'documents-requested' | 'approved' | 'rejected';

// ─── Location ─────────────────────────────────────────────────────────────

export interface VendorHeadquarters {
  city: string;
  state: string;
}

// ─── Lead Times ───────────────────────────────────────────────────────────

export interface LeadTimeEstimate {
  estimate: string;
  onTimePercent: number;
}

export interface LeadTimeSummary {
  quickShip: string | null;
  madeToOrder: string | null;
}

export interface LeadTimeMatrix {
  quickShip: LeadTimeEstimate | null;
  madeToOrder: LeadTimeEstimate;
  custom: LeadTimeEstimate | null;
  lastVerified: string;
}

// ─── Pricing Tiers ────────────────────────────────────────────────────────

export interface PricingTier {
  id: UUID;
  tierName: string;
  tierOrder: number;
  discountPercent: number;
  discountDisplay: string;
  minimumVolume: number | null;
  minimumRequirements: string[];
  benefits: string[];
}

// ─── Designer Relationship ────────────────────────────────────────────────

export interface DesignerRelationshipSummary {
  accountStatus: AccountStatus;
  currentTier: string | null;
  isSaved: boolean;
}

export interface DesignerPricing {
  currentTier: string;
  tierSince: string;
  annualVolume: number;
  volumeToNextTier: number | null;
  nextTierBenefits: string[];
}

// ─── Reputation ───────────────────────────────────────────────────────────

export interface ReputationDimensions {
  quality: number;
  finish: number;
  delivery: number;
  service: number;
  value: number;
}

export interface ReputationSummary {
  overallScore: number;
  reviewCount: number;
  topSpecializations: string[];
}

export interface VendorReputation {
  overallScore: number;
  reviewCount: number;
  dimensions: ReputationDimensions;
  networkConsensus: string | null;
  topSpecializations: string[];
}

// ─── Certifications ───────────────────────────────────────────────────────

export interface Certification {
  id: UUID;
  certificationType: string;
  level: string | null;
  isVerified: boolean;
  expirationDate: string | null;
}

// ─── Vendor Story ─────────────────────────────────────────────────────────

export interface TimelineEvent {
  year: number;
  title: string;
  description: string | null;
}

export interface MakerSpotlight {
  name: string;
  role: string;
  imageUrl: string | null;
  bio: string | null;
}

export interface ProcessGalleryItem {
  imageUrl: string;
  caption: string | null;
  order: number;
}

export interface VendorStory {
  heroImageUrl: string | null;
  narrative: string | null;
  timeline: TimelineEvent[];
  makerSpotlights: MakerSpotlight[];
  processGallery: ProcessGalleryItem[];
}

// ─── Trade Program ────────────────────────────────────────────────────────

export interface SalesRep {
  name: string;
  email: string;
  phone: string | null;
}

export interface TradeProgram {
  pricingTiers: PricingTier[];
  applicationUrl: string | null;
  contactEmail: string | null;
  salesReps: SalesRep[];
  minimumRequirements: string[];
}

// ─── Featured Product ─────────────────────────────────────────────────────

export interface FeaturedProduct {
  id: UUID;
  name: string;
  imageUrl: string;
  priceRetail: number | null;
  priceTrade: number | null;
}

// ─── Vendor Summary (Directory Card) ──────────────────────────────────────

export interface VendorSummary {
  id: UUID;
  tradeName: string;
  logoUrl: string | null;
  primaryCategory: string;
  marketPosition: MarketPosition;
  headquarters: VendorHeadquarters;
  designerRelationship: DesignerRelationshipSummary;
  reputation: ReputationSummary;
  leadTimes: LeadTimeSummary;
}

// ─── Vendor Profile (Full Detail) ─────────────────────────────────────────

export interface VendorProfile {
  // Base fields (from VendorSummary)
  id: UUID;
  tradeName: string;
  logoUrl: string | null;
  primaryCategory: string;
  marketPosition: MarketPosition;
  headquarters: VendorHeadquarters;
  designerRelationship: DesignerRelationshipSummary;

  // Extended fields
  legalName: string;
  brands: string[];
  parentCompany: string | null;
  secondaryCategories: string[];
  productionModel: ProductionModel;
  foundedYear: number | null;
  ownershipType: OwnershipType | null;
  tradeProgram: TradeProgram;
  designerPricing: DesignerPricing | null;
  reputation: VendorReputation;
  certifications: Certification[];
  story: VendorStory;
  leadTimes: LeadTimeMatrix;
  productCount: number;
  featuredProducts: FeaturedProduct[];
}

// ─── Trade Account ────────────────────────────────────────────────────────

export interface TradeAccountSalesRep {
  name: string;
  email: string;
  phone: string | null;
}

export interface TradeAccount {
  id: UUID;
  vendorId: UUID;
  accountStatus: AccountStatus;
  currentTier: string;
  accountNumber: string | null;
  accountSince: string;
  ytdVolume: number;
  volumeToNextTier: number | null;
  nextTier: string | null;
  salesRep: TradeAccountSalesRep | null;
}

// ─── Pending Application ──────────────────────────────────────────────────

export interface PendingApplication {
  id: UUID;
  vendorId: UUID;
  submittedAt: string;
  estimatedDecision: string | null;
  status: ApplicationStatus;
  documentsRequested: string[];
}

// ─── Vendor Reviews ───────────────────────────────────────────────────────

export interface VendorReviewRatings {
  quality: number;
  finish: number;
  delivery: number;
  service: number;
  value: number;
}

export interface VendorReview {
  id: UUID;
  vendorId: UUID;
  designerId: UUID;
  ratings: VendorReviewRatings;
  overallRating: number;
  writtenReview: string | null;
  leadTimeAccuracy: LeadTimeAccuracy | null;
  leadTimeWeeksOver: number | null;
  verifiedPurchase: boolean;
  hasOrderedRecently: boolean;
  createdAt: string;
  vendorResponse: string | null;
  vendorResponseAt: string | null;
}

// Note: VendorReviewInput is exported from validation/vendor.ts

// ─── Specialization Badges ────────────────────────────────────────────────

export interface SpecializationBadge {
  id: UUID;
  category: string;
  rating: number;
  voteCount: number;
  isConfirmedByUser: boolean;
}

// Note: VendorFilters is exported from validation/vendor.ts

// ─── Saved Vendor ─────────────────────────────────────────────────────────

export interface SavedVendor {
  id: UUID;
  vendorId: UUID;
  designerId: UUID;
  notes: string | null;
  savedAt: string;
}

export interface SavedVendorInput {
  vendorId: UUID;
  notes?: string;
}

// ─── Vendor List Response ─────────────────────────────────────────────────

export interface VendorListResponse {
  vendors: VendorSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
