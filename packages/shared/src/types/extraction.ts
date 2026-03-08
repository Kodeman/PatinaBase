// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION TYPES
// Types for Chrome extension product and vendor extraction
// ═══════════════════════════════════════════════════════════════════════════

import type { UUID } from './index';

// ─── Enum Types (defined here to avoid Zod runtime dependency) ───────────────
// These must match the Zod schemas in validation/vendor.ts

export type MarketPosition = 'entry' | 'mid' | 'premium' | 'luxury' | 'ultra-luxury';
export type ProductionModel = 'stock' | 'mto' | 'custom' | 'mixed';
export type OwnershipType = 'family' | 'private' | 'pe-backed' | 'public';

// ─── Page Mode Detection ──────────────────────────────────────────────────

export type PageMode = 'product' | 'vendor' | 'ambiguous';

export interface PageModeSignals {
  hasProductSchema: boolean;
  hasAddToCart: boolean;
  hasPrice: boolean;
  isAboutPage: boolean;
  hasOrganizationSchema: boolean;
}

// ─── Vendor Match Confidence ──────────────────────────────────────────────

export type VendorMatchConfidence = 'exact' | 'high' | 'medium' | 'low';

export interface VendorDetectionResult {
  confidence: VendorMatchConfidence;
  matchedVendor: VendorSummaryForCapture | null;
  suggestions: VendorSummaryForCapture[];
  extractedData: ExtractedVendorData | null;
}

// ─── Vendor Summary for Capture UI ────────────────────────────────────────

export interface VendorSummaryForCapture {
  id: UUID;
  name: string;
  logoUrl: string | null;
  website: string | null;
  marketPosition: MarketPosition | null;
  productionModel: ProductionModel | null;
  primaryCategory: string | null;
  rating: number | null;
  reviewCount: number;
}

// ─── Extracted Vendor Data ────────────────────────────────────────────────

export interface ExtractedVendorContact {
  email: string | null;
  phone: string | null;
}

export interface ExtractedVendorSocialLinks {
  instagram: string | null;
  pinterest: string | null;
  facebook: string | null;
}

// ─── Extracted Vendor Story (Structured Narrative) ───────────────────────

/**
 * Structured vendor story extracted from web pages
 * Different from VendorStory in vendor.ts which is for database records
 * This is simpler 500-char sections for capture/extraction
 */
export interface ExtractedVendorStory {
  mission: string | null;        // "What we do and why" (max 500 chars)
  philosophy: string | null;     // "How we approach design/craft" (max 500 chars)
  history: string | null;        // "Our origin and journey" (max 500 chars)
  craftsmanship: string | null;  // "How we make things" (max 500 chars)
}

// ─── Vendor Certifications ───────────────────────────────────────────────

/**
 * Predefined certification types for auto-detection
 * Used for credibility signals that justify premium pricing
 */
export type VendorCertification =
  | 'fsc'              // Forest Stewardship Council (sustainable wood)
  | 'greenguard'       // Low emissions certification
  | 'greenguard-gold'  // Stricter low emissions (schools/healthcare)
  | 'b-corp'           // Social/environmental performance
  | 'fair-trade'       // Fair trade certified
  | 'gots'             // Global Organic Textile Standard
  | 'oeko-tex'         // Tested for harmful substances
  | 'made-in-usa'      // Manufactured in USA
  | 'made-in-italy'    // Manufactured in Italy
  | 'made-in-europe'   // Manufactured in EU
  | 'handmade'         // Artisan handcrafted
  | 'sustainable'      // General sustainability claim
  | 'carbon-neutral'   // Carbon neutral operations
  | 'recycled';        // Made from recycled materials

/**
 * Display metadata for certifications
 */
export interface CertificationInfo {
  key: VendorCertification;
  label: string;
  description: string;
}

export const CERTIFICATION_OPTIONS: CertificationInfo[] = [
  { key: 'fsc', label: 'FSC Certified', description: 'Forest Stewardship Council - sustainable wood sourcing' },
  { key: 'greenguard', label: 'GREENGUARD', description: 'Low chemical emissions for indoor air quality' },
  { key: 'greenguard-gold', label: 'GREENGUARD Gold', description: 'Stricter emissions for schools & healthcare' },
  { key: 'b-corp', label: 'B Corp', description: 'Certified for social & environmental performance' },
  { key: 'fair-trade', label: 'Fair Trade', description: 'Fair wages and working conditions' },
  { key: 'gots', label: 'GOTS', description: 'Global Organic Textile Standard' },
  { key: 'oeko-tex', label: 'OEKO-TEX', description: 'Tested for harmful substances' },
  { key: 'made-in-usa', label: 'Made in USA', description: 'Manufactured in United States' },
  { key: 'made-in-italy', label: 'Made in Italy', description: 'Manufactured in Italy' },
  { key: 'made-in-europe', label: 'Made in Europe', description: 'Manufactured in European Union' },
  { key: 'handmade', label: 'Handmade', description: 'Artisan handcrafted' },
  { key: 'sustainable', label: 'Sustainable', description: 'General sustainability practices' },
  { key: 'carbon-neutral', label: 'Carbon Neutral', description: 'Carbon neutral operations' },
  { key: 'recycled', label: 'Recycled Materials', description: 'Made from recycled materials' },
];

// ─── Vendor Ownership Options ────────────────────────────────────────────

export const OWNERSHIP_OPTIONS: { value: OwnershipType; label: string }[] = [
  { value: 'family', label: 'Family-Owned' },
  { value: 'private', label: 'Private' },
  { value: 'pe-backed', label: 'PE-Backed' },
  { value: 'public', label: 'Public' },
];

// ─── Extended Extracted Vendor Data ──────────────────────────────────────

export interface ExtractedVendorData {
  // Core identity
  name: string | null;
  website: string;                        // Always available (current domain)
  logoUrl: string | null;                 // From favicon, OG image, or page
  heroImageUrl: string | null;            // Large brand hero image

  // Contact & social
  contact: ExtractedVendorContact;
  socialLinks: ExtractedVendorSocialLinks;

  // Heritage
  foundedYear: number | null;             // From "Est. 1985" patterns
  headquarters: string | null;            // From "Based in NYC" patterns
  aboutSnippet: string | null;            // First 200 chars of About text (legacy)

  // Story (NEW - structured narrative)
  story: ExtractedVendorStory;

  // Ownership & provenance (NEW)
  ownershipType: OwnershipType | null;
  parentCompany: string | null;
  madeIn: string | null;                  // "USA", "Italy", "North Carolina"

  // Credentials (NEW)
  certifications: VendorCertification[];

  // Extraction quality
  confidence: VendorMatchConfidence;
}

// ─── Product Vendor Extraction ────────────────────────────────────────────

export interface ExtractedProductVendors {
  retailer: {
    name: string;
    website: string;
    detection: VendorDetectionResult;
  };
  manufacturer: {
    name: string | null;
    detection: VendorDetectionResult | null;
  } | null;
}

// ─── Vendor Selection (User Choice in UI) ─────────────────────────────────

export interface VendorSelectionExisting {
  type: 'existing';
  id: UUID;
}

export interface VendorSelectionNew {
  type: 'new';
  data: VendorCaptureInput;
}

export interface VendorSelectionSkip {
  type: 'skip';
}

export type VendorSelection = VendorSelectionExisting | VendorSelectionNew | VendorSelectionSkip;

// ─── Vendor Create Input for Capture (for inline creation) ────────────────

export interface VendorCaptureInput {
  // Core identity
  name: string;
  website: string;
  logoUrl?: string;
  heroImageUrl?: string;

  // Classification
  marketPosition?: MarketPosition;
  productionModel?: ProductionModel;
  primaryCategory?: string;

  // Contact
  contactEmail?: string;
  contactPhone?: string;

  // Social links
  instagram?: string;
  pinterest?: string;
  facebook?: string;

  // Heritage
  foundedYear?: number;
  headquartersCity?: string;
  headquartersState?: string;

  // Story (NEW)
  story?: ExtractedVendorStory;

  // Credentials (NEW)
  certifications?: VendorCertification[];
  ownershipType?: OwnershipType;
  madeIn?: string;

  // Notes
  notes?: string;
}

// ─── Queued Capture with Vendor Data ──────────────────────────────────────

export interface QueuedCaptureVendorData {
  manufacturer: VendorSelection | null;
  retailer: VendorSelection | null;
}

// ─── Extended Extraction Data (includes vendor info) ──────────────────────

export interface ExtendedExtractedProductData {
  // Original ExtractedProductData fields
  productName: string | null;
  description: string | null;
  price: {
    value: number;
    currency: string;
    raw: string;
  } | null;
  dimensions: {
    width: number | null;
    height: number | null;
    depth: number | null;
    unit: 'in' | 'cm';
    raw: string;
  } | null;
  materials: string[];
  images: {
    url: string;
    score: number;
    width: number;
    height: number;
    alt: string;
  }[];
  manufacturer: string | null;
  url: string;
  extractedAt: string;
  confidence: 'high' | 'medium' | 'low';

  // New vendor extraction fields
  pageMode: PageMode;
  vendors: ExtractedProductVendors | null;
}
