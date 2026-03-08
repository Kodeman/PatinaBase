/**
 * Media Search Types and Interfaces
 * Team Lima - Media Analytics & Search
 */

export enum SearchType {
  VISUAL_SIMILARITY = 'VISUAL_SIMILARITY',
  COLOR = 'COLOR',
  TEXT = 'TEXT',
  METADATA = 'METADATA',
  TAG = 'TAG',
  HYBRID = 'HYBRID',
}

export enum ColorSearchMode {
  DOMINANT = 'DOMINANT',
  PALETTE = 'PALETTE',
  EXACT = 'EXACT',
  SIMILAR = 'SIMILAR',
}

export interface SearchQuery {
  type: SearchType;
  query: string | Buffer;
  filters?: SearchFilters;
  pagination?: {
    page: number;
    limit: number;
  };
  options?: SearchOptions;
}

export interface SearchFilters {
  productIds?: string[];
  variantIds?: string[];
  assetKind?: string[];
  assetRole?: string[];
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  dimensions?: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  };
  quality?: {
    minScore?: number;
    excludeLowQuality?: boolean;
  };
  colors?: {
    mode: ColorSearchMode;
    hex?: string;
    tolerance?: number;
  };
}

export interface SearchOptions {
  includeMetadata?: boolean;
  includeAnalytics?: boolean;
  includeAITags?: boolean;
  similarityThreshold?: number;
  maxResults?: number;
  sortBy?: 'relevance' | 'date' | 'quality' | 'popularity';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  assetId: string;
  score: number;
  asset: AssetSearchData;
  highlights?: SearchHighlight[];
  analytics?: AssetAnalytics;
}

export interface AssetSearchData {
  id: string;
  kind: string;
  role?: string;
  productId?: string;
  variantId?: string;
  rawKey: string;
  mimeType?: string;
  width?: number;
  height?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  aiTags?: AITag[];
  colorPalette?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchHighlight {
  field: string;
  matches: string[];
}

export interface AssetAnalytics {
  viewCount: number;
  downloadCount: number;
  lastViewed?: Date;
  avgViewDuration?: number;
  engagementScore: number;
}

export interface AITag {
  label: string;
  confidence: number;
  category: string;
  source: 'vision_api' | 'custom_model' | 'manual';
}

export interface VectorEmbedding {
  assetId: string;
  embedding: number[];
  model: string;
  dimensions: number;
  createdAt: Date;
}

export interface ColorSearchRequest {
  hexColor: string;
  mode: ColorSearchMode;
  tolerance?: number;
  limit?: number;
}

export interface SimilaritySearchRequest {
  sourceAssetId?: string;
  sourceImage?: Buffer;
  threshold?: number;
  limit?: number;
}

export interface TextSearchRequest {
  query: string;
  fields?: string[];
  fuzzy?: boolean;
  limit?: number;
}

export interface MetadataSearchRequest {
  filters: Record<string, any>;
  limit?: number;
}

export interface SearchResponse<T = SearchResult> {
  results: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  aggregations?: SearchAggregations;
  searchTime: number;
}

export interface SearchAggregations {
  byKind?: Record<string, number>;
  byRole?: Record<string, number>;
  byTag?: Record<string, number>;
  byColor?: Record<string, number>;
  byProduct?: Record<string, number>;
  qualityDistribution?: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface IndexedAsset {
  id: string;
  kind: string;
  role?: string;
  productId?: string;
  variantId?: string;
  tags: string[];
  aiTags: AITag[];
  metadata: Record<string, any>;
  colorPalette: string[];
  dominantColor: string;
  dimensions: {
    width: number;
    height: number;
  };
  quality: {
    score: number;
    isLowQuality: boolean;
  };
  textContent?: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}
