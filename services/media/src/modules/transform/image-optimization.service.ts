import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface OptimizationOptions {
  quality?: number;
  progressive?: boolean;
  stripMetadata?: boolean;
  optimizeForWeb?: boolean;
  targetSizeKB?: number;
}

export interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  savings: number;
  savingsPercent: number;
  format: string;
  buffer: Buffer;
}

@Injectable()
export class ImageOptimizationService {
  private readonly logger = new Logger(ImageOptimizationService.name);

  constructor(private config: ConfigService) {}

  /**
   * Optimize image based on content type and format
   */
  async optimizeImage(
    buffer: Buffer,
    format: 'jpeg' | 'png' | 'webp' | 'avif' | 'svg',
    options: OptimizationOptions = {},
  ): Promise<OptimizationResult> {
    const originalSize = buffer.length;

    this.logger.log(
      `Optimizing ${format.toUpperCase()} image (${(originalSize / 1024).toFixed(2)} KB)`,
    );

    let optimizedBuffer: Buffer;

    switch (format) {
      case 'jpeg':
        optimizedBuffer = await this.optimizeJPEG(buffer, options);
        break;
      case 'png':
        optimizedBuffer = await this.optimizePNG(buffer, options);
        break;
      case 'webp':
        optimizedBuffer = await this.optimizeWebP(buffer, options);
        break;
      case 'avif':
        optimizedBuffer = await this.optimizeAVIF(buffer, options);
        break;
      case 'svg':
        optimizedBuffer = await this.optimizeSVG(buffer);
        break;
      default:
        optimizedBuffer = buffer;
    }

    const optimizedSize = optimizedBuffer.length;
    const savings = originalSize - optimizedSize;
    const savingsPercent = (savings / originalSize) * 100;

    this.logger.log(
      `Optimization complete: ${(optimizedSize / 1024).toFixed(2)} KB (${savingsPercent.toFixed(1)}% reduction)`,
    );

    return {
      originalSize,
      optimizedSize,
      savings,
      savingsPercent,
      format,
      buffer: optimizedBuffer,
    };
  }

  /**
   * Optimize JPEG with progressive encoding and MozJPEG
   */
  private async optimizeJPEG(
    buffer: Buffer,
    options: OptimizationOptions,
  ): Promise<Buffer> {
    const quality = this.determineQuality(buffer, options.quality || 85);

    let pipeline = sharp(buffer);

    // Strip metadata if requested
    if (options.stripMetadata) {
      pipeline = pipeline.withMetadata({ orientation: undefined });
    }

    // Convert to JPEG with optimizations
    pipeline = pipeline.jpeg({
      quality,
      progressive: options.progressive !== false, // Default to progressive
      mozjpeg: true, // Use MozJPEG for better compression
      chromaSubsampling: quality > 90 ? '4:4:4' : '4:2:0',
      trellisQuantisation: true,
      overshootDeringing: true,
      optimizeScans: true,
      force: true,
    });

    let optimized = await pipeline.toBuffer();

    // If target size specified, iteratively reduce quality
    if (options.targetSizeKB) {
      optimized = await this.optimizeToTargetSize(
        buffer,
        options.targetSizeKB * 1024,
        'jpeg',
      );
    }

    return optimized;
  }

  /**
   * Optimize PNG with pngquant-style compression
   */
  private async optimizePNG(
    buffer: Buffer,
    options: OptimizationOptions,
  ): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();

    let pipeline = sharp(buffer);

    // Strip metadata if requested
    if (options.stripMetadata) {
      pipeline = pipeline.withMetadata({ orientation: undefined });
    }

    // Convert to PNG with optimizations
    if (metadata.hasAlpha) {
      // PNG with alpha channel
      pipeline = pipeline.png({
        quality: options.quality || 90,
        compressionLevel: 9,
        palette: true, // Use palette-based compression if possible
        progressive: options.progressive !== false,
        force: true,
      });
    } else {
      // PNG without alpha - consider converting to JPEG
      if (options.optimizeForWeb) {
        this.logger.log('PNG without alpha - converting to JPEG for better compression');
        return this.optimizeJPEG(buffer, options);
      }

      pipeline = pipeline.png({
        quality: options.quality || 90,
        compressionLevel: 9,
        progressive: options.progressive !== false,
        force: true,
      });
    }

    return pipeline.toBuffer();
  }

  /**
   * Optimize WebP with smart quality settings
   */
  private async optimizeWebP(
    buffer: Buffer,
    options: OptimizationOptions,
  ): Promise<Buffer> {
    const quality = this.determineQuality(buffer, options.quality || 80);

    let pipeline = sharp(buffer);

    if (options.stripMetadata) {
      pipeline = pipeline.withMetadata({ orientation: undefined });
    }

    pipeline = pipeline.webp({
      quality,
      effort: 6, // 0-6, higher is slower but better compression
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
      force: true,
    });

    return pipeline.toBuffer();
  }

  /**
   * Optimize AVIF with smart quality settings
   */
  private async optimizeAVIF(
    buffer: Buffer,
    options: OptimizationOptions,
  ): Promise<Buffer> {
    const quality = this.determineQuality(buffer, options.quality || 70);

    let pipeline = sharp(buffer);

    if (options.stripMetadata) {
      pipeline = pipeline.withMetadata({ orientation: undefined });
    }

    pipeline = pipeline.avif({
      quality,
      effort: 6, // 0-9, higher is slower but better compression
      chromaSubsampling: '4:2:0',
      lossless: false,
      force: true,
    });

    return pipeline.toBuffer();
  }

  /**
   * Optimize SVG by removing unnecessary data
   */
  private async optimizeSVG(buffer: Buffer): Promise<Buffer> {
    try {
      // Basic SVG optimization - remove comments, whitespace, etc.
      let svg = buffer.toString('utf-8');

      // Remove XML comments
      svg = svg.replace(/<!--[\s\S]*?-->/g, '');

      // Remove unnecessary whitespace
      svg = svg.replace(/>\s+</g, '><');
      svg = svg.trim();

      // Remove metadata elements
      svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');

      // Remove editor data
      svg = svg.replace(/xmlns:sketch="[^"]*"/g, '');
      svg = svg.replace(/sketch:type="[^"]*"/g, '');

      return Buffer.from(svg, 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to optimize SVG: ${error.message}`);
      return buffer;
    }
  }

  /**
   * Determine optimal quality based on image content
   */
  private determineQuality(buffer: Buffer, defaultQuality: number): number {
    // TODO: Implement content-aware quality detection
    // For now, return default quality
    return defaultQuality;
  }

  /**
   * Optimize image to target file size
   */
  private async optimizeToTargetSize(
    buffer: Buffer,
    targetSizeBytes: number,
    format: 'jpeg' | 'webp' | 'avif',
  ): Promise<Buffer> {
    let quality = 95;
    let optimized = buffer;
    let attempts = 0;
    const maxAttempts = 10;

    while (optimized.length > targetSizeBytes && attempts < maxAttempts) {
      quality -= 5;

      if (quality < 30) {
        this.logger.warn(
          `Cannot reach target size ${targetSizeBytes} bytes without significant quality loss`,
        );
        break;
      }

      let pipeline = sharp(buffer);

      switch (format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality, effort: 6 });
          break;
        case 'avif':
          pipeline = pipeline.avif({ quality, effort: 6 });
          break;
      }

      optimized = await pipeline.toBuffer();
      attempts++;

      this.logger.debug(
        `Attempt ${attempts}: quality=${quality}, size=${optimized.length} bytes`,
      );
    }

    return optimized;
  }

  /**
   * Generate progressive JPEG with multiple scans
   */
  async generateProgressiveJPEG(buffer: Buffer, quality = 85): Promise<Buffer> {
    return sharp(buffer)
      .jpeg({
        quality,
        progressive: true,
        mozjpeg: true,
        optimizeScans: true,
        trellisQuantisation: true,
      })
      .toBuffer();
  }

  /**
   * Batch optimize images
   */
  async batchOptimize(
    images: { id: string; buffer: Buffer; format: string }[],
    options: OptimizationOptions = {},
  ): Promise<Map<string, OptimizationResult>> {
    const results = new Map<string, OptimizationResult>();

    this.logger.log(`Starting batch optimization of ${images.length} images`);

    for (const image of images) {
      try {
        const result = await this.optimizeImage(
          image.buffer,
          image.format as any,
          options,
        );
        results.set(image.id, result);
      } catch (error) {
        this.logger.error(`Failed to optimize image ${image.id}: ${error.message}`);
      }
    }

    this.logger.log(`Batch optimization complete: ${results.size}/${images.length} succeeded`);

    return results;
  }

  /**
   * Calculate image complexity score (affects optimal quality)
   */
  async calculateComplexity(buffer: Buffer): Promise<number> {
    try {
      const stats = await sharp(buffer).stats();

      // Calculate complexity based on color variance and entropy
      const channels = stats.channels;
      const avgStdDev = channels.reduce((sum, ch) => sum + ch.stdev, 0) / channels.length;

      // Normalize to 0-1 range
      const complexity = Math.min(avgStdDev / 128, 1);

      return complexity;
    } catch (error) {
      this.logger.error(`Failed to calculate complexity: ${error.message}`);
      return 0.5; // Default medium complexity
    }
  }

  /**
   * Smart quality selection based on image content
   */
  async selectOptimalQuality(
    buffer: Buffer,
    format: 'jpeg' | 'webp' | 'avif',
  ): Promise<number> {
    const complexity = await this.calculateComplexity(buffer);

    // High complexity images can use lower quality without visible degradation
    // Low complexity images need higher quality to avoid banding artifacts
    const qualityMap = {
      jpeg: {
        high: 75, // High complexity (photos, textures)
        medium: 85, // Medium complexity
        low: 95, // Low complexity (graphics, text)
      },
      webp: {
        high: 70,
        medium: 80,
        low: 90,
      },
      avif: {
        high: 60,
        medium: 70,
        low: 85,
      },
    };

    if (complexity > 0.7) {
      return qualityMap[format].high;
    } else if (complexity > 0.3) {
      return qualityMap[format].medium;
    } else {
      return qualityMap[format].low;
    }
  }
}
