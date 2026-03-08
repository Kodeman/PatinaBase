// ═══════════════════════════════════════════════════════════════════════════
// CORE DOMAIN TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type UUID = string;

// ─── Product ───────────────────────────────────────────────────────────────

export interface Product {
  id: UUID;
  name: string;
  description: string | null;
  priceRetail: number | null;
  priceTrade: number | null;
  dimensions: ProductDimensions | null;
  materials: string[];
  colors: string[] | null;           // Primary color(s) of the product
  finish: string | null;             // Surface finish (matte, gloss, lacquered, etc.)
  availableColors: string[] | null;  // All color variants if available
  sourceUrl: string;
  images: string[];
  vendorId: UUID | null;       // Manufacturer - who makes the product
  retailerId: UUID | null;     // Retailer - where the product was captured/purchased
  capturedBy: UUID;
  capturedAt: string;
  qualityScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDimensions {
  // Overall dimensions
  width: number | null;
  height: number | null;
  depth: number | null;

  // Specialty dimensions (furniture-specific)
  seatHeight?: number | null;
  seatDepth?: number | null;
  seatWidth?: number | null;
  armHeight?: number | null;
  backHeight?: number | null;
  legHeight?: number | null;
  clearance?: number | null;  // Floor clearance

  unit: 'in' | 'cm';
}

export interface ProductCreateInput {
  name: string;
  description?: string;
  priceRetail?: number;
  priceTrade?: number;
  dimensions?: ProductDimensions;
  materials?: string[];
  colors?: string[];
  finish?: string;
  availableColors?: string[];
  sourceUrl: string;
  images: string[];
  vendorId?: UUID;      // Manufacturer
  retailerId?: UUID;    // Retailer
}

export interface ProductUpdateInput {
  name?: string;
  description?: string;
  priceRetail?: number;
  priceTrade?: number;
  dimensions?: ProductDimensions;
  materials?: string[];
  colors?: string[];
  finish?: string;
  availableColors?: string[];
  qualityScore?: number;
}

// ─── Style ─────────────────────────────────────────────────────────────────

export interface Style {
  id: UUID;
  name: string;
  parentId: UUID | null;
  description: string | null;
  visualMarkers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StyleCreateInput {
  name: string;
  parentId?: UUID;
  description?: string;
  visualMarkers?: string[];
}

// ─── Product-Style Relationship ────────────────────────────────────────────

export interface ProductStyle {
  id: UUID;
  productId: UUID;
  styleId: UUID;
  confidence: number;
  assignedBy: UUID;
  createdAt: string;
}

// ─── Product Relations ─────────────────────────────────────────────────────

export type RelationType = 'pairs_with' | 'alternative' | 'never_with';

export interface ProductRelation {
  id: UUID;
  productAId: UUID;
  productBId: UUID;
  relationType: RelationType;
  notes: string | null;
  assignedBy: UUID;
  createdAt: string;
}

// ─── Vendor ────────────────────────────────────────────────────────────────

export interface Vendor {
  id: UUID;
  name: string;
  website: string | null;
  tradeTerms: string | null;
  contactInfo: VendorContact | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorContact {
  email?: string;
  phone?: string;
  rep?: string;
}

// ─── Client Profile ────────────────────────────────────────────────────────

export interface ClientProfile {
  id: UUID;
  archetype: string | null;
  budgetRange: BudgetRange | null;
  stylePreferences: UUID[];
  quizResponses: Record<string, unknown> | null;
  projectId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetRange {
  min: number;
  max: number;
  currency: 'USD';
}

// ─── Project ───────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'completed' | 'archived';

export interface Project {
  id: UUID;
  name: string;
  clientProfileId: UUID | null;
  status: ProjectStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Quiz Session ──────────────────────────────────────────────────────────

export interface QuizSession {
  id: UUID;
  userId: UUID | null;
  responses: QuizResponse[];
  computedProfile: Record<string, unknown> | null;
  completedAt: string | null;
  conversionEvent: string | null;
  createdAt: string;
}

export interface QuizResponse {
  questionId: string;
  answer: unknown;
  timestamp: string;
}

// ─── User ──────────────────────────────────────────────────────────────────

export type UserRole = 'designer' | 'admin' | 'consumer';

export interface User {
  id: UUID;
  email: string;
  role: UserRole;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Chrome Extension Types ────────────────────────────────────────────────

export interface CaptureRequest {
  url: string;
  title: string;
  price: string | null;
  images: string[];
  description: string | null;
  dimensions: string | null;
  projectId?: UUID;
  notes?: string;
}

export interface CaptureResult {
  success: boolean;
  productId?: UUID;
  error?: string;
}

// ─── Smart Extraction Types ───────────────────────────────────────────────

export interface ExtractedProductData {
  productName: string | null;
  description: string | null;
  price: ExtractedPrice | null;
  dimensions: ExtractedDimensions | null;
  materials: string[];
  colors: ExtractedColor[] | null;
  finish: ExtractedFinish | null;
  availableColors: string[] | null;
  images: ExtractedImage[];
  manufacturer: string | null;
  url: string;
  extractedAt: string;
  confidence: ExtractionConfidence;
}

export interface ExtractedColor {
  name: string;
  isPrimary: boolean;
  confidence: number;
  source: 'json-ld' | 'selector' | 'swatch' | 'table' | 'text';
}

export interface ExtractedFinish {
  name: string;
  type: 'wood' | 'metal' | 'fabric' | 'other';
  confidence: number;
}

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface ExtractedPrice {
  value: number;        // In cents
  currency: string;     // 'USD', 'EUR', 'GBP', etc.
  raw: string;          // Original string from page
}

export interface ExtractedDimensions {
  // Overall dimensions
  width: number | null;
  height: number | null;
  depth: number | null;

  // Specialty dimensions (furniture-specific)
  seatHeight?: number | null;
  seatDepth?: number | null;
  seatWidth?: number | null;
  armHeight?: number | null;
  backHeight?: number | null;
  legHeight?: number | null;
  clearance?: number | null;  // Floor clearance

  unit: 'in' | 'cm';
  raw: string;          // Original string from page
}

export interface ExtractedImage {
  url: string;
  score: number;
  width: number;
  height: number;
  alt: string;
}

export interface QuickCaptureRequest extends CaptureRequest {
  primaryImageIndex: number;
  styleIds: UUID[];
  isPersonalCatalog: boolean;
  extractionConfidence: ExtractionConfidence;
}

// ─── Collections & Tags ───────────────────────────────────────────────────

export interface Collection {
  id: UUID;
  name: string;
  description: string | null;
  coverImage: string | null;
  isPublic: boolean;
  createdBy: UUID;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionCreateInput {
  name: string;
  description?: string;
  coverImage?: string;
  isPublic?: boolean;
}

export interface Tag {
  id: UUID;
  name: string;
  color: string;
  isSystem: boolean;
  createdBy: UUID | null;
  createdAt: string;
}

export interface TagCreateInput {
  name: string;
  color?: string;
}

// ─── Project Enhancements ─────────────────────────────────────────────────

export interface ProjectSection {
  id: UUID;
  projectId: UUID;
  name: string;
  position: number;
  createdAt: string;
}

export interface ProjectEnhanced extends Project {
  budgetMin: number | null;
  budgetMax: number | null;
  timelineStart: string | null;
  timelineEnd: string | null;
  createdBy: UUID;
  shareToken: string | null;
  sections?: ProjectSection[];
}

// ─── API Response Types ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Re-export teaching types
export * from './teaching';

// Re-export vendor types
export * from './vendor';

// Re-export extraction types
export * from './extraction';

// Re-export room scan association types
export * from './room-scan-association';

// Re-export user management types
export * from './user-management';

// Re-export analytics types
export * from './analytics';

// Re-export notification types
export * from './notifications';
