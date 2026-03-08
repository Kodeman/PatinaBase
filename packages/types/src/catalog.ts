import { UUID, Timestamps } from './common';
import { Product, AvailabilityStatus, Variant, AttributeType, ProductAttribute as BaseProductAttribute } from './product';

// Category Management
export interface Category extends Timestamps {
  id: UUID;
  name: string;
  slug: string;
  parentId?: UUID;
  parent?: Category;
  children?: Category[];
  path: string; // e.g., "/living-room/sofas/sectionals"
  depth: number;
  order: number;
  isActive: boolean;
  description?: string;
  image?: string;
  seoTitle?: string;
  seoDescription?: string;
  requiredAttributes?: string[]; // Attribute codes required for products in this category
}

// Collections
export type CollectionType = 'manual' | 'rule' | 'smart';

export interface Collection extends Timestamps {
  id: UUID;
  name: string;
  slug: string;
  type: CollectionType;
  description?: string;
  heroImage?: string;
  status: 'draft' | 'published' | 'scheduled';
  publishedAt?: Date;
  scheduledPublishAt?: Date;

  // SEO
  seoTitle?: string;
  seoDescription?: string;

  // Content
  items?: CollectionItem[]; // For manual collections
  rule?: CollectionRule; // For rule-based collections
  productCount?: number;

  // Display
  displayOrder?: number;
  featured?: boolean;
  tags?: string[];
}

export interface CollectionItem {
  id: UUID;
  collectionId: UUID;
  productId: UUID;
  product?: Product;
  displayOrder: number;
  addedAt: Date;
  notes?: string;
}

export interface CollectionRule {
  id: UUID;
  collectionId: UUID;
  operator: 'AND' | 'OR';
  conditions: RuleCondition[];
  lastEvaluatedAt?: Date;
  nextEvaluationAt?: Date;
}

export interface RuleCondition {
  field: string; // e.g., "category", "price", "brand", "material"
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'between';
  value: any;
}

// Media Assets
export type MediaType = 'image' | 'video' | 'model3d' | 'document';
export type MediaRole = 'hero' | 'angle' | 'lifestyle' | 'detail' | 'ar_preview' | 'thumbnail' | 'swatch';
export type MediaStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired';

export interface MediaAsset extends Timestamps {
  id: UUID;
  productId?: UUID;
  variantId?: UUID;
  collectionId?: UUID;

  // Type and role
  type: MediaType;
  role: MediaRole;

  // Storage
  originalUrl: string;
  cdnUrl?: string;
  thumbnailUrl?: string;
  storageKey: string;
  bucket?: string;

  // Properties
  filename: string;
  mimeType: string;
  size: number; // bytes
  width?: number;
  height?: number;
  duration?: number; // for videos in seconds
  format?: string;

  // Processing
  status: MediaStatus;
  processingError?: string;
  renditions?: MediaRendition[];

  // Metadata
  metadata?: Record<string, any>;
  phash?: string; // perceptual hash for duplicate detection
  palette?: string[]; // color palette

  // Rights
  licenseType?: string;
  attribution?: string;
  expiresAt?: Date;
  geoRestrictions?: string[];

  // Display
  displayOrder?: number;
  alt?: string;
  caption?: string;
}

export interface MediaRendition {
  id: UUID;
  mediaAssetId: UUID;
  name: string; // e.g., "thumb", "sm", "md", "lg", "2x"
  url: string;
  width: number;
  height: number;
  size: number;
  format: string;
}

// Vendor Management
export interface Vendor extends Timestamps {
  id: UUID;
  name: string;
  slug: string;
  code: string;
  logo?: string;
  website?: string;

  // Contact
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: ManufacturerAddress;

  // Business Terms
  leadTimeDays?: number;
  minimumOrderValue?: number;
  shippingTerms?: string;
  paymentTerms?: string;
  returnPolicyUrl?: string;

  // Integration
  apiEnabled: boolean;
  apiEndpoint?: string;
  apiKey?: string;
  syncEnabled: boolean;
  lastSyncAt?: Date;

  // Status
  status: 'active' | 'inactive' | 'suspended';
  notes?: string;
  rating?: number;

  // Stats
  productCount?: number;
  averageLeadTime?: number;
  onTimeDeliveryRate?: number;
}

export interface ManufacturerAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// Attribute Groups
export interface AttributeGroup extends Timestamps {
  id: UUID;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  attributes?: AttributeDefinition[];
}

// Attribute Definitions
export interface AttributeDefinition extends Timestamps {
  id: UUID;
  code: string; // unique identifier e.g., "seat_depth"
  name: string;
  description?: string;
  type: AttributeType;

  // Group
  groupId?: UUID;
  group?: AttributeGroup;

  // Validation
  validation?: AttributeValidation;
  isRequired: boolean;
  requiredCategories: UUID[]; // Category IDs where this attribute is required

  // Display & Filtering
  sortOrder: number;
  isFilterable: boolean;
  isSearchable: boolean;
  showInDetails: boolean;

  // Options (for SELECT/MULTISELECT types)
  allowedValues?: AttributeOption[];

  // Units (for DIMENSION/NUMBER types)
  unit?: string;
  displayUnit?: string;

  // Default value
  defaultValue?: any;

  // UI Hints
  helpText?: string;
  placeholder?: string;

  // Relations
  productAttributes?: CatalogProductAttribute[];
}

export interface AttributeValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string; // regex
  allowedValues?: any[];
  precision?: number;
  allowNegative?: boolean;
  customMessage?: string;
}

export interface AttributeOption {
  value: string;
  label: string;
  order?: number;
  color?: string; // for color swatches
  imageUrl?: string; // for visual options
}

// Product Attributes (values assigned to products) - Extended version with relations
export interface CatalogProductAttribute extends BaseProductAttribute {
  // Relations
  product?: Product;
  variant?: Variant;
  definition?: AttributeDefinition;
}

// Legacy alias for backward compatibility
export interface AttributeDef extends AttributeDefinition {
  required: boolean; // alias for isRequired
  showInFilters: boolean; // alias for isFilterable
  options?: AttributeOption[]; // alias for allowedValues
}

// Import/Export
export type ImportSource = 'csv' | 'json' | 'xml' | 'api' | 'vendor';
export type ImportStatus = 'draft' | 'validating' | 'mapping' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ImportJob extends Timestamps {
  id: UUID;
  name: string;
  source: ImportSource;
  vendorId?: UUID;

  // File info
  filename?: string;
  fileUrl?: string;
  fileSize?: number;

  // Configuration
  mapping: ImportMapping;
  options: ImportOptions;

  // Status
  status: ImportStatus;
  startedAt?: Date;
  completedAt?: Date;

  // Progress
  totalRows?: number;
  processedRows?: number;
  successRows?: number;
  errorRows?: number;
  skippedRows?: number;

  // Results
  stats?: ImportStats;
  errors?: ImportError[];
  createdBy?: UUID;
}

export interface ImportMapping {
  productFields: Record<string, string>; // source field -> target field
  variantFields?: Record<string, string>;
  delimiter?: string;
  hasHeader?: boolean;
  dateFormat?: string;
  numberFormat?: string;
}

export interface ImportOptions {
  updateExisting: boolean;
  skipDuplicates: boolean;
  validateOnly: boolean;
  publishAfterImport: boolean;
  defaultValues?: Record<string, any>;
  transformations?: Record<string, string>; // field -> transformation expression
}

export interface ImportStats {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  imagesProcessed: number;
  duplicatesFound: number;
  validationErrors: number;
}

export interface ImportError {
  row: number;
  field?: string;
  value?: any;
  error: string;
  severity: 'error' | 'warning' | 'info';
}

// Search & Filtering
export interface SearchQuery {
  q?: string;
  category?: string | string[];
  brand?: string | string[];
  priceMin?: number;
  priceMax?: number;
  colors?: string[];
  materials?: string[];
  styleTags?: string[];
  dimensions?: DimensionFilter;
  availability?: AvailabilityStatus[];
  has3D?: boolean;
  customizable?: boolean;
  attributes?: AttributeFilter[];
  sort?: SortOption;
  page?: number;
  pageSize?: number;
}

export interface DimensionFilter {
  widthMin?: number;
  widthMax?: number;
  heightMin?: number;
  heightMax?: number;
  depthMin?: number;
  depthMax?: number;
  unit?: 'cm' | 'inch';
}

export interface AttributeFilter {
  code: string;
  operator: 'equals' | 'contains' | 'in' | 'between' | 'greater_than' | 'less_than';
  value: any;
}

export interface SortOption {
  field: 'name' | 'price' | 'createdAt' | 'updatedAt' | 'popularity' | 'rating' | 'relevance';
  direction: 'asc' | 'desc';
}

export interface SearchResult<T> {
  data: T[];
  facets?: SearchFacets;
  meta: SearchMeta;
}

export interface SearchFacets {
  categories: FacetBucket[];
  brands: FacetBucket[];
  colors: FacetBucket[];
  materials: FacetBucket[];
  priceRanges: FacetBucket[];
  attributes: Record<string, FacetBucket[]>;
}

export interface FacetBucket {
  key: string;
  label?: string;
  count: number;
  selected?: boolean;
}

export interface SearchMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  took: number; // milliseconds
  query?: string;
}

// Recommendations
export interface CatalogRecommendationRequest {
  productId?: UUID;
  userId?: UUID;
  sessionId?: string;
  text?: string;
  imageUrl?: string;
  limit?: number;
  filters?: SearchQuery;
  strategy?: RecommendationStrategy;
}

export type RecommendationStrategy =
  | 'similar_visual'
  | 'similar_style'
  | 'complementary'
  | 'trending'
  | 'personalized'
  | 'cross_sell'
  | 'up_sell';

export interface RecommendationResult {
  products: Product[];
  strategy: RecommendationStrategy;
  score?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

// Validation
export interface ValidationIssue extends Timestamps {
  id: UUID;
  productId?: UUID;
  variantId?: UUID;
  importJobId?: UUID;

  code: string;
  severity: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
  details?: Record<string, any>;

  resolved: boolean;
  resolvedBy?: UUID;
  resolvedAt?: Date;
  resolutionNotes?: string;
}