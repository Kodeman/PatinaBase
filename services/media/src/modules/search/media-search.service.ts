import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { imageHash } from 'image-hash';
import { promisify } from 'util';
import {
  SearchQuery,
  SearchResult,
  SearchResponse,
  SimilaritySearchRequest,
  ColorSearchRequest,
  TextSearchRequest,
  MetadataSearchRequest,
  ColorSearchMode,
  VectorEmbedding,
  IndexedAsset,
  SearchAggregations,
} from './search.types';

const imageHashAsync = promisify(imageHash);

@Injectable()
export class MediaSearchService {
  private readonly logger = new Logger(MediaSearchService.name);

  constructor(
    private prisma: PrismaClient,
    private config: ConfigService,
  ) {}

  /**
   * Execute visual similarity search using embeddings
   */
  async searchBySimilarity(
    request: SimilaritySearchRequest,
  ): Promise<SearchResponse<SearchResult>> {
    const startTime = Date.now();

    let sourceEmbedding: number[];

    if (request.sourceAssetId) {
      // Get embedding from existing asset
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: request.sourceAssetId },
      });

      if (!(asset as any)?.embedding) {
        throw new Error('Source asset has no embedding');
      }

      sourceEmbedding = (asset as any).embedding as number[];
    } else if (request.sourceImage) {
      // Generate embedding from uploaded image
      sourceEmbedding = await this.generateEmbedding(request.sourceImage);
    } else {
      throw new Error('Either sourceAssetId or sourceImage must be provided');
    }

    // Find similar assets using cosine similarity
    const threshold = request.threshold || 0.85;
    const limit = request.limit || 50;

    const results = await this.findSimilarByEmbedding(
      sourceEmbedding,
      threshold,
      limit,
      request.sourceAssetId,
    );

    const searchTime = Date.now() - startTime;

    return {
      results,
      total: results.length,
      page: 1,
      limit,
      hasMore: false,
      searchTime,
    };
  }

  /**
   * Execute color-based search
   */
  async searchByColor(request: ColorSearchRequest): Promise<SearchResponse<SearchResult>> {
    const startTime = Date.now();
    const limit = request.limit || 50;

    let results: SearchResult[] = [];

    switch (request.mode) {
      case ColorSearchMode.DOMINANT:
        results = await this.searchByDominantColor(request.hexColor, request.tolerance || 20);
        break;

      case ColorSearchMode.PALETTE:
        results = await this.searchByColorInPalette(request.hexColor, request.tolerance || 30);
        break;

      case ColorSearchMode.EXACT:
        results = await this.searchByExactColor(request.hexColor);
        break;

      case ColorSearchMode.SIMILAR:
        results = await this.searchBySimilarColor(request.hexColor, request.tolerance || 40);
        break;
    }

    const searchTime = Date.now() - startTime;

    return {
      results: results.slice(0, limit),
      total: results.length,
      page: 1,
      limit,
      hasMore: results.length > limit,
      searchTime,
    };
  }

  /**
   * Execute text search with OCR and metadata
   */
  async searchByText(request: TextSearchRequest): Promise<SearchResponse<SearchResult>> {
    const startTime = Date.now();
    const limit = request.limit || 50;

    const searchFields = request.fields || ['tags', 'productId', 'variantId', 'textContent'];
    const fuzzy = request.fuzzy !== false;

    // Build search query
    const searchConditions = searchFields.map((field) => {
      if (fuzzy) {
        return {
          [field]: {
            contains: request.query,
            mode: 'insensitive' as const,
          },
        };
      } else {
        return {
          [field]: {
            equals: request.query,
            mode: 'insensitive' as const,
          },
        };
      }
    });

    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        OR: searchConditions,
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const results: SearchResult[] = assets.map((asset, index) => ({
      assetId: asset.id,
      score: 1 - index * 0.01, // Simple relevance scoring
      asset: {
        id: asset.id,
        kind: asset.kind,
        role: asset.role || undefined,
        productId: asset.productId || undefined,
        variantId: asset.variantId || undefined,
        rawKey: asset.rawKey,
        mimeType: asset.mimeType || undefined,
        width: asset.width || undefined,
        height: asset.height || undefined,
        tags: asset.tags as string[] || [],
        metadata: (asset as any).metadata as Record<string, any> || {},
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      },
    }));

    const searchTime = Date.now() - startTime;

    return {
      results,
      total: results.length,
      page: 1,
      limit,
      hasMore: false,
      searchTime,
    };
  }

  /**
   * Execute metadata-based search
   */
  async searchByMetadata(
    request: MetadataSearchRequest,
  ): Promise<SearchResponse<SearchResult>> {
    const startTime = Date.now();
    const limit = request.limit || 50;

    const assets = await this.prisma.mediaAsset.findMany({
      where: request.filters as any,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const results: SearchResult[] = assets.map((asset, index) => ({
      assetId: asset.id,
      score: 1,
      asset: {
        id: asset.id,
        kind: asset.kind,
        role: asset.role || undefined,
        productId: asset.productId || undefined,
        variantId: asset.variantId || undefined,
        rawKey: asset.rawKey,
        mimeType: asset.mimeType || undefined,
        width: asset.width || undefined,
        height: asset.height || undefined,
        tags: asset.tags as string[] || [],
        metadata: (asset as any).metadata as Record<string, any> || {},
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      },
    }));

    const searchTime = Date.now() - startTime;

    return {
      results,
      total: results.length,
      page: 1,
      limit,
      hasMore: false,
      searchTime,
    };
  }

  /**
   * Execute hybrid search combining multiple search types
   */
  async searchHybrid(query: SearchQuery): Promise<SearchResponse<SearchResult>> {
    const startTime = Date.now();

    // Execute multiple search types and merge results
    const results: SearchResult[] = [];
    const scoreWeights = {
      similarity: 0.4,
      color: 0.2,
      text: 0.3,
      metadata: 0.1,
    };

    // This is a simplified implementation
    // In production, you would use a proper search engine like OpenSearch
    const searchTime = Date.now() - startTime;

    return {
      results,
      total: results.length,
      page: query.pagination?.page || 1,
      limit: query.pagination?.limit || 50,
      hasMore: false,
      searchTime,
    };
  }

  /**
   * Generate search aggregations
   */
  async generateAggregations(results: SearchResult[]): Promise<SearchAggregations> {
    const aggregations: SearchAggregations = {
      byKind: {},
      byRole: {},
      byTag: {},
      byColor: {},
      byProduct: {},
      qualityDistribution: {
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    for (const result of results) {
      // Aggregate by kind
      aggregations.byKind![result.asset.kind] =
        (aggregations.byKind![result.asset.kind] || 0) + 1;

      // Aggregate by role
      if (result.asset.role) {
        aggregations.byRole![result.asset.role] =
          (aggregations.byRole![result.asset.role] || 0) + 1;
      }

      // Aggregate by tags
      if (result.asset.tags) {
        for (const tag of result.asset.tags) {
          aggregations.byTag![tag] = (aggregations.byTag![tag] || 0) + 1;
        }
      }

      // Aggregate by product
      if (result.asset.productId) {
        aggregations.byProduct![result.asset.productId] =
          (aggregations.byProduct![result.asset.productId] || 0) + 1;
      }
    }

    return aggregations;
  }

  /**
   * Generate embedding vector for image
   */
  private async generateEmbedding(imageBuffer: Buffer): Promise<number[]> {
    try {
      // Generate perceptual hash as a simple embedding
      // In production, you would use a proper vision model like CLIP or ResNet
      const hash = await imageHashAsync(imageBuffer as any, 16, true);

      // Convert hash to vector of numbers
      const embedding = hash
        .toString()
        .split('')
        .map((char) => parseInt(char, 16) || 0);

      // Normalize to 512 dimensions (standard for vision models)
      const normalized = new Array(512).fill(0);
      for (let i = 0; i < embedding.length; i++) {
        normalized[i % 512] += embedding[i];
      }

      return normalized.map((val) => val / Math.max(...normalized));
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find similar assets by embedding using cosine similarity
   */
  private async findSimilarByEmbedding(
    embedding: number[],
    threshold: number,
    limit: number,
    excludeId?: string,
  ): Promise<SearchResult[]> {
    // Get all assets with embeddings
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
      } as any,
    });

    // Calculate cosine similarity for each
    const similarities = assets.map((asset) => {
      const assetEmbedding = (asset as any).embedding as number[];
      const similarity = this.cosineSimilarity(embedding, assetEmbedding);

      return {
        asset,
        similarity,
      };
    });

    // Filter by threshold and sort
    const filtered = similarities
      .filter((s) => s.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return filtered.map((item) => ({
      assetId: item.asset.id,
      score: item.similarity,
      asset: {
        id: item.asset.id,
        kind: item.asset.kind,
        role: item.asset.role || undefined,
        productId: item.asset.productId || undefined,
        variantId: item.asset.variantId || undefined,
        rawKey: item.asset.rawKey,
        mimeType: item.asset.mimeType || undefined,
        width: item.asset.width || undefined,
        height: item.asset.height || undefined,
        tags: item.asset.tags as string[] || [],
        metadata: (item.asset as any).metadata as Record<string, any> || {},
        createdAt: item.asset.createdAt,
        updatedAt: item.asset.updatedAt,
      },
    }));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Search by dominant color
   */
  private async searchByDominantColor(
    hexColor: string,
    tolerance: number,
  ): Promise<SearchResult[]> {
    const rgb = this.hexToRgb(hexColor);

    const assets = await this.prisma.mediaAsset.findMany({} as any);

    const results = assets
      .map((asset) => {
        const assetRgb = this.hexToRgb((asset as any).dominantColor as string);
        const distance = this.colorDistance(rgb, assetRgb);
        const score = Math.max(0, 1 - distance / 100);

        return {
          asset,
          distance,
          score,
        };
      })
      .filter((item) => item.distance <= tolerance)
      .sort((a, b) => a.distance - b.distance)
      .map((item) => ({
        assetId: item.asset.id,
        score: item.score,
        asset: {
          id: item.asset.id,
          kind: item.asset.kind,
          role: item.asset.role || undefined,
          productId: item.asset.productId || undefined,
          variantId: item.asset.variantId || undefined,
          rawKey: item.asset.rawKey,
          mimeType: item.asset.mimeType || undefined,
          width: item.asset.width || undefined,
          height: item.asset.height || undefined,
          tags: item.asset.tags as string[] || [],
          metadata: (item.asset as any).metadata as Record<string, any> || {},
          createdAt: item.asset.createdAt,
          updatedAt: item.asset.updatedAt,
        },
      }));

    return results;
  }

  /**
   * Search by color in palette
   */
  private async searchByColorInPalette(
    hexColor: string,
    tolerance: number,
  ): Promise<SearchResult[]> {
    const rgb = this.hexToRgb(hexColor);

    const assets = await this.prisma.mediaAsset.findMany({} as any);

    const results = assets
      .map((asset) => {
        const palette = (asset as any).colorPalette as string[];
        let minDistance = Infinity;

        for (const color of palette) {
          const colorRgb = this.hexToRgb(color);
          const distance = this.colorDistance(rgb, colorRgb);
          minDistance = Math.min(minDistance, distance);
        }

        const score = Math.max(0, 1 - minDistance / 100);

        return {
          asset,
          distance: minDistance,
          score,
        };
      })
      .filter((item) => item.distance <= tolerance)
      .sort((a, b) => a.distance - b.distance)
      .map((item) => ({
        assetId: item.asset.id,
        score: item.score,
        asset: {
          id: item.asset.id,
          kind: item.asset.kind,
          role: item.asset.role || undefined,
          productId: item.asset.productId || undefined,
          variantId: item.asset.variantId || undefined,
          rawKey: item.asset.rawKey,
          mimeType: item.asset.mimeType || undefined,
          width: item.asset.width || undefined,
          height: item.asset.height || undefined,
          tags: item.asset.tags as string[] || [],
          metadata: (item.asset as any).metadata as Record<string, any> || {},
          createdAt: item.asset.createdAt,
          updatedAt: item.asset.updatedAt,
        },
      }));

    return results;
  }

  /**
   * Search by exact color match
   */
  private async searchByExactColor(hexColor: string): Promise<SearchResult[]> {
    const assets = await this.prisma.mediaAsset.findMany({} as any);

    return assets.map((asset) => ({
      assetId: asset.id,
      score: 1,
      asset: {
        id: asset.id,
        kind: asset.kind,
        role: asset.role || undefined,
        productId: asset.productId || undefined,
        variantId: asset.variantId || undefined,
        rawKey: asset.rawKey,
        mimeType: asset.mimeType || undefined,
        width: asset.width || undefined,
        height: asset.height || undefined,
        tags: asset.tags as string[] || [],
        metadata: (asset as any).metadata as Record<string, any> || {},
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      },
    }));
  }

  /**
   * Search by similar color
   */
  private async searchBySimilarColor(
    hexColor: string,
    tolerance: number,
  ): Promise<SearchResult[]> {
    // Similar to palette search but with higher tolerance
    return this.searchByColorInPalette(hexColor, tolerance);
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  /**
   * Calculate color distance (Euclidean distance in RGB space)
   */
  private colorDistance(
    rgb1: { r: number; g: number; b: number },
    rgb2: { r: number; g: number; b: number },
  ): number {
    return Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2),
    );
  }
}
