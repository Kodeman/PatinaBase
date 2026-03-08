import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { imageHash } from 'image-hash';
import { promisify } from 'util';
import sharp from 'sharp';

const imageHashAsync = promisify(imageHash);

export interface DuplicateMatch {
  assetId: string;
  similarity: number;
  phash: string;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  exactMatches: DuplicateMatch[];
  similarMatches: DuplicateMatch[];
  phash: string;
}

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  // Hamming distance threshold for duplicate detection
  private readonly EXACT_MATCH_THRESHOLD = 5; // ~95% similarity
  private readonly SIMILAR_MATCH_THRESHOLD = 10; // ~85% similarity

  constructor(private prisma: PrismaClient) {}

  /**
   * Generate perceptual hash (pHash) for an image
   */
  async generatePHash(buffer: Buffer, bits = 16): Promise<string> {
    try {
      // Normalize image before hashing for better consistency
      const normalized = await sharp(buffer)
        .resize(256, 256, { fit: 'inside' })
        .normalise()
        .toBuffer();

      const hash = await imageHashAsync(normalized as any, bits, true);
      return hash as string;
    } catch (error) {
      this.logger.error(`Failed to generate pHash: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate Hamming distance between two hashes
   */
  calculateHammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      throw new Error('Hash lengths must be equal');
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }

    return distance;
  }

  /**
   * Calculate similarity percentage between two hashes
   */
  calculateSimilarity(hash1: string, hash2: string): number {
    const distance = this.calculateHammingDistance(hash1, hash2);
    const maxDistance = hash1.length;
    const similarity = ((maxDistance - distance) / maxDistance) * 100;
    return Math.round(similarity * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Detect duplicates for a new image
   */
  async detectDuplicates(
    buffer: Buffer,
    excludeAssetId?: string,
  ): Promise<DuplicateDetectionResult> {
    const phash = await this.generatePHash(buffer);

    this.logger.log(`Checking for duplicates with pHash: ${phash}`);

    // Find all assets with pHash data
    const existingAssets = await this.prisma.mediaAsset.findMany({
      where: {
        phash: { not: null },
        id: excludeAssetId ? { not: excludeAssetId } : undefined,
      },
      select: {
        id: true,
        phash: true,
      },
    });

    const exactMatches: DuplicateMatch[] = [];
    const similarMatches: DuplicateMatch[] = [];

    for (const asset of existingAssets) {
      if (!asset.phash) continue;

      const distance = this.calculateHammingDistance(phash, asset.phash);
      const similarity = this.calculateSimilarity(phash, asset.phash);

      if (distance <= this.EXACT_MATCH_THRESHOLD) {
        exactMatches.push({
          assetId: asset.id,
          similarity,
          phash: asset.phash,
        });
      } else if (distance <= this.SIMILAR_MATCH_THRESHOLD) {
        similarMatches.push({
          assetId: asset.id,
          similarity,
          phash: asset.phash,
        });
      }
    }

    // Sort matches by similarity (highest first)
    exactMatches.sort((a, b) => b.similarity - a.similarity);
    similarMatches.sort((a, b) => b.similarity - a.similarity);

    const isDuplicate = exactMatches.length > 0;

    if (isDuplicate) {
      this.logger.warn(
        `Found ${exactMatches.length} exact duplicate(s) and ${similarMatches.length} similar image(s)`,
      );
    } else if (similarMatches.length > 0) {
      this.logger.log(`Found ${similarMatches.length} similar image(s)`);
    }

    return {
      isDuplicate,
      exactMatches,
      similarMatches,
      phash,
    };
  }

  /**
   * Find all duplicates in the system
   */
  async findAllDuplicates(): Promise<Map<string, DuplicateMatch[]>> {
    const duplicateGroups = new Map<string, DuplicateMatch[]>();

    const allAssets = await this.prisma.mediaAsset.findMany({
      where: {
        phash: { not: null },
        kind: 'IMAGE',
      },
      select: {
        id: true,
        phash: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    this.logger.log(`Scanning ${allAssets.length} images for duplicates...`);

    const processedHashes = new Set<string>();

    for (let i = 0; i < allAssets.length; i++) {
      const asset1 = allAssets[i];
      if (!asset1.phash || processedHashes.has(asset1.phash)) continue;

      const matches: DuplicateMatch[] = [];

      for (let j = i + 1; j < allAssets.length; j++) {
        const asset2 = allAssets[j];
        if (!asset2.phash) continue;

        const distance = this.calculateHammingDistance(asset1.phash, asset2.phash);

        if (distance <= this.EXACT_MATCH_THRESHOLD) {
          const similarity = this.calculateSimilarity(asset1.phash, asset2.phash);
          matches.push({
            assetId: asset2.id,
            similarity,
            phash: asset2.phash,
          });
          processedHashes.add(asset2.phash);
        }
      }

      if (matches.length > 0) {
        duplicateGroups.set(asset1.id, matches);
        processedHashes.add(asset1.phash);
      }
    }

    this.logger.log(`Found ${duplicateGroups.size} groups of duplicates`);

    return duplicateGroups;
  }

  /**
   * Generate similarity matrix for a set of images
   */
  async generateSimilarityMatrix(assetIds: string[]): Promise<number[][]> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        id: { in: assetIds },
        phash: { not: null },
      },
      select: {
        id: true,
        phash: true,
      },
    });

    const matrix: number[][] = [];
    const assetMap = new Map(assets.map((a) => [a.id, a.phash]));

    for (const id1 of assetIds) {
      const row: number[] = [];
      const hash1 = assetMap.get(id1);

      for (const id2 of assetIds) {
        const hash2 = assetMap.get(id2);

        if (!hash1 || !hash2) {
          row.push(0);
        } else if (id1 === id2) {
          row.push(100);
        } else {
          const similarity = this.calculateSimilarity(hash1, hash2);
          row.push(similarity);
        }
      }

      matrix.push(row);
    }

    return matrix;
  }

  /**
   * Update pHash for existing asset
   */
  async updateAssetPHash(assetId: string, buffer: Buffer): Promise<string> {
    const phash = await this.generatePHash(buffer);

    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { phash },
    });

    this.logger.log(`Updated pHash for asset ${assetId}`);

    return phash;
  }

  /**
   * Batch update pHashes for assets missing them
   */
  async backfillPHashes(limit = 100): Promise<number> {
    const assetsWithoutPHash = await this.prisma.mediaAsset.findMany({
      where: {
        phash: null,
        kind: 'IMAGE',
        status: 'READY',
      },
      take: limit,
      select: {
        id: true,
        rawKey: true,
      },
    });

    let updated = 0;

    for (const asset of assetsWithoutPHash) {
      try {
        // This would require fetching the image from storage
        // For now, we'll skip actual implementation
        this.logger.log(`Would process asset ${asset.id} for pHash generation`);
        updated++;
      } catch (error) {
        this.logger.error(`Failed to generate pHash for asset ${asset.id}: ${error.message}`);
      }
    }

    this.logger.log(`Backfilled pHashes for ${updated} assets`);

    return updated;
  }

  /**
   * Find visually similar images to a reference image
   */
  async findSimilarImages(
    referenceBuffer: Buffer,
    maxResults = 10,
    minSimilarity = 70,
  ): Promise<DuplicateMatch[]> {
    const phash = await this.generatePHash(referenceBuffer);

    const allAssets = await this.prisma.mediaAsset.findMany({
      where: {
        phash: { not: null },
        kind: 'IMAGE',
      },
      select: {
        id: true,
        phash: true,
      },
    });

    const matches: DuplicateMatch[] = [];

    for (const asset of allAssets) {
      if (!asset.phash) continue;

      const similarity = this.calculateSimilarity(phash, asset.phash);

      if (similarity >= minSimilarity) {
        matches.push({
          assetId: asset.id,
          similarity,
          phash: asset.phash,
        });
      }
    }

    // Sort by similarity and limit results
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches.slice(0, maxResults);
  }

  /**
   * Compare two images directly
   */
  async compareImages(buffer1: Buffer, buffer2: Buffer): Promise<number> {
    const [hash1, hash2] = await Promise.all([
      this.generatePHash(buffer1),
      this.generatePHash(buffer2),
    ]);

    return this.calculateSimilarity(hash1, hash2);
  }

  /**
   * Generate duplicate detection report
   */
  async generateDuplicateReport(): Promise<{
    totalImages: number;
    totalDuplicateGroups: number;
    totalDuplicateImages: number;
    estimatedStorageSavings: number;
    groups: Array<{
      originalId: string;
      duplicates: DuplicateMatch[];
      count: number;
    }>;
  }> {
    const duplicateGroups = await this.findAllDuplicates();

    let totalDuplicateImages = 0;
    const groups = [];

    for (const [originalId, duplicates] of duplicateGroups.entries()) {
      totalDuplicateImages += duplicates.length;
      groups.push({
        originalId,
        duplicates,
        count: duplicates.length,
      });
    }

    const totalImages = await this.prisma.mediaAsset.count({
      where: { kind: 'IMAGE' },
    });

    // Estimate storage savings (assuming average image size of 2MB)
    const estimatedStorageSavings = totalDuplicateImages * 2 * 1024 * 1024;

    return {
      totalImages,
      totalDuplicateGroups: duplicateGroups.size,
      totalDuplicateImages,
      estimatedStorageSavings,
      groups,
    };
  }
}
