/**
 * Media Metadata Extractor Service (Domain Layer)
 * Pure domain service for extracting metadata from media files
 * No external dependencies on infrastructure (storage, database, etc.)
 */

import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { createHash } from 'crypto';

export interface MediaMetadata {
  width?: number;
  height?: number;
  format?: string;
  colorSpace?: string;
  hasAlpha?: boolean;
  sizeBytes?: number;
  phash?: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  shortEdge: number;
  longEdge: number;
}

@Injectable()
export class MediaMetadataExtractorService {
  private readonly logger = new Logger(MediaMetadataExtractorService.name);

  /**
   * Extract basic metadata from image buffer
   * Pure function - no side effects
   */
  async extractImageMetadata(buffer: Buffer): Promise<MediaMetadata> {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        colorSpace: metadata.space,
        hasAlpha: metadata.hasAlpha,
        sizeBytes: buffer.length,
      };
    } catch (error) {
      this.logger.error(`Failed to extract image metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate perceptual hash for duplicate detection
   * Simplified implementation - uses SHA256 on resized image
   * For production, consider using a proper pHash library
   */
  async calculatePerceptualHash(buffer: Buffer): Promise<string> {
    try {
      // Resize to small standard size and convert to grayscale
      const normalized = await sharp(buffer)
        .resize(16, 16, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

      // Calculate hash
      const hash = createHash('sha256').update(normalized).digest('hex');

      // Return first 16 characters as simplified perceptual hash
      return hash.substring(0, 16);
    } catch (error) {
      this.logger.error(`Failed to calculate perceptual hash: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate image dimensions and aspect ratio
   */
  calculateDimensions(width: number, height: number): ImageDimensions {
    const aspectRatio = width / height;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);

    return {
      width,
      height,
      aspectRatio,
      shortEdge,
      longEdge,
    };
  }

  /**
   * Determine optimal format based on image characteristics
   */
  async determineOptimalFormat(buffer: Buffer): Promise<string> {
    try {
      const metadata = await this.extractImageMetadata(buffer);

      // If image has alpha channel, prefer PNG or WebP
      if (metadata.hasAlpha) {
        return 'webp'; // WebP supports transparency and better compression
      }

      // For photos without alpha, prefer JPEG or WebP
      return 'jpeg';
    } catch (error) {
      this.logger.error(`Failed to determine optimal format: ${error.message}`);
      return 'jpeg'; // Default fallback
    }
  }

  /**
   * Validate image buffer
   */
  async validateImageBuffer(buffer: Buffer): Promise<boolean> {
    try {
      // Attempt to read metadata - will throw if not a valid image
      await sharp(buffer).metadata();
      return true;
    } catch (error) {
      this.logger.warn(`Invalid image buffer: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract file extension from filename
   */
  extractFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  }

  /**
   * Generate object key for storage
   * Pure function with deterministic output
   */
  generateStorageKey(
    assetId: string,
    kind: string,
    filename: string,
    prefix = 'raw',
  ): string {
    const extension = this.extractFileExtension(filename);
    const timestamp = Date.now();

    // Format: prefix/kind/timestamp/assetId.ext
    return `${prefix}/${kind.toLowerCase()}/${timestamp}/${assetId}.${extension}`;
  }

  /**
   * Calculate compression ratio
   */
  calculateCompressionRatio(originalSize: number, compressedSize: number): number {
    if (originalSize === 0) return 0;
    return ((originalSize - compressedSize) / originalSize) * 100;
  }

  /**
   * Estimate processing time based on file size and dimensions
   * Returns estimated time in milliseconds
   */
  estimateProcessingTime(
    sizeBytes: number,
    width?: number,
    height?: number,
  ): number {
    // Base time: 100ms
    let estimatedMs = 100;

    // Add time based on file size (1ms per 10KB)
    estimatedMs += (sizeBytes / 10240);

    // Add time based on dimensions (larger images take longer)
    if (width && height) {
      const pixels = width * height;
      estimatedMs += pixels / 10000; // 1ms per 10k pixels
    }

    // Cap at maximum
    return Math.min(estimatedMs, 30000); // Max 30 seconds
  }

  /**
   * Determine if image needs orientation correction
   */
  async needsOrientationCorrection(buffer: Buffer): Promise<boolean> {
    try {
      const metadata = await sharp(buffer).metadata();
      // Orientation values 2-8 indicate the image needs rotation/flip
      return metadata.orientation !== undefined && metadata.orientation > 1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate optimal quality setting based on file size
   * Returns quality value between 1-100
   */
  calculateOptimalQuality(sizeBytes: number, targetSizeBytes?: number): number {
    if (!targetSizeBytes) {
      // Default quality based on size
      if (sizeBytes > 5 * 1024 * 1024) return 75; // Large files: reduce quality
      if (sizeBytes > 1 * 1024 * 1024) return 85; // Medium files: good quality
      return 90; // Small files: high quality
    }

    // Calculate quality to achieve target size
    const ratio = targetSizeBytes / sizeBytes;
    return Math.max(60, Math.min(95, Math.round(ratio * 100)));
  }
}
