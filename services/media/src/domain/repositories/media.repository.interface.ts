/**
 * Media Repository Interface
 * Defines data access operations for media assets (Domain Layer)
 *
 * This interface follows the Repository Pattern and Dependency Inversion Principle:
 * - Application layer depends on this abstraction, not concrete implementations
 * - Infrastructure layer implements this interface using Prisma
 * - Easy to swap implementations (e.g., for testing with in-memory repository)
 */

import { MediaAsset, AssetRendition, ThreeDAsset } from '../../generated/prisma-client';

export interface MediaQuery {
  kind?: string;
  productId?: string;
  variantId?: string;
  role?: string;
  status?: string;
  uploadedBy?: string;
  isPublic?: boolean;
  mimeType?: string;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  processedOnly?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateMediaAssetCommand {
  id?: string;
  kind: string;
  productId?: string;
  variantId?: string;
  role?: string;
  rawKey: string;
  status?: string;
  width?: number;
  height?: number;
  format?: string;
  sizeBytes?: number;
  mimeType?: string;
  phash?: string;
  palette?: any;
  blurhash?: string;
  license?: any;
  isPublic?: boolean;
  permissions?: any;
  tags?: string[];
  uploadedBy?: string;
}

export interface UpdateMediaAssetCommand {
  role?: string;
  tags?: string[];
  isPublic?: boolean;
  width?: number;
  height?: number;
  format?: string;
  permissions?: any;
  license?: any;
  palette?: any;
  qcIssues?: any;
  scanResult?: any;
  status?: string;
  processed?: boolean;
}

/**
 * Repository interface for MediaAsset aggregate
 * Separates data access concerns from business logic
 */
export interface IMediaRepository {
  /**
   * Create a new media asset
   */
  create(command: CreateMediaAssetCommand): Promise<MediaAsset>;

  /**
   * Find media asset by ID
   */
  findById(id: string): Promise<MediaAsset | null>;

  /**
   * Find all media assets matching query (paginated)
   */
  findAll(query: MediaQuery): Promise<PaginatedResult<MediaAsset>>;

  /**
   * Update media asset by ID
   */
  update(id: string, command: UpdateMediaAssetCommand): Promise<MediaAsset>;

  /**
   * Delete media asset by ID (soft delete by default)
   */
  delete(id: string, softDelete?: boolean): Promise<void>;

  /**
   * Find asset by perceptual hash (for duplicate detection)
   */
  findByPhash(phash: string): Promise<MediaAsset | null>;

  /**
   * Find assets by product ID
   */
  findByProductId(productId: string): Promise<MediaAsset[]>;

  /**
   * Find assets by variant ID
   */
  findByVariantId(variantId: string): Promise<MediaAsset[]>;

  /**
   * Increment view count
   */
  incrementViewCount(id: string): Promise<void>;

  /**
   * Increment download count
   */
  incrementDownloadCount(id: string): Promise<void>;

  /**
   * Update asset status
   */
  updateStatus(id: string, status: string): Promise<MediaAsset>;

  /**
   * Find renditions for an asset
   */
  findRenditions(assetId: string): Promise<AssetRendition[]>;

  /**
   * Find 3D metadata for an asset
   */
  find3DMetadata(assetId: string): Promise<ThreeDAsset | null>;

  /**
   * Check if asset exists
   */
  exists(id: string): Promise<boolean>;
}

/**
 * Symbol for dependency injection
 */
export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');
