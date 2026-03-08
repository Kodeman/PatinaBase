import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as exifParser from 'exif-parser';
import { imageHash } from 'image-hash';
import { encode as blurhashEncode } from 'blurhash';
import Vibrant from 'node-vibrant';
import { promisify } from 'util';

const imageHashAsync = promisify(imageHash);

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  colorSpace: string;
  hasAlpha: boolean;
  orientation?: number;
  phash?: string;
  blurhash?: string;
  palette?: ColorPalette;
  exif?: ExifData;
  quality?: QualityMetrics;
}

export interface ColorPalette {
  dominant: string;
  vibrant?: string;
  muted?: string;
  darkVibrant?: string;
  darkMuted?: string;
  lightVibrant?: string;
  lightMuted?: string;
}

export interface ExifData {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  gps?: {
    latitude?: number;
    longitude?: number;
  };
}

export interface QualityMetrics {
  sharpness: number;
  brightness: number;
  contrast: number;
  isLowQuality: boolean;
}

@Injectable()
export class MetadataExtractionService {
  private readonly logger = new Logger(MetadataExtractionService.name);

  /**
   * Extract comprehensive metadata from image buffer
   */
  async extractImageMetadata(buffer: Buffer): Promise<ImageMetadata> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    this.logger.log(
      `Extracting metadata for image: ${metadata.width}x${metadata.height} ${metadata.format}`,
    );

    // Extract EXIF data
    const exif = this.extractExifData(buffer);

    // Generate perceptual hash for deduplication
    const phash = await this.generatePerceptualHash(buffer);

    // Generate blurhash for progressive loading
    const blurhash = await this.generateBlurhash(image, metadata);

    // Extract color palette
    const palette = await this.extractColorPalette(buffer);

    // Calculate quality metrics
    const quality = await this.calculateQualityMetrics(image, metadata);

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      colorSpace: metadata.space || 'srgb',
      hasAlpha: metadata.hasAlpha || false,
      orientation: metadata.orientation,
      phash,
      blurhash,
      palette,
      exif,
      quality,
    };
  }

  /**
   * Extract EXIF data from image buffer
   */
  private extractExifData(buffer: Buffer): ExifData | undefined {
    try {
      const parser = exifParser.create(buffer);
      const result = parser.parse();

      const exif: ExifData = {};

      if (result.tags) {
        exif.make = result.tags.Make;
        exif.model = result.tags.Model;
        exif.software = result.tags.Software;
        exif.dateTime = result.tags.DateTime
          ? new Date(result.tags.DateTime * 1000).toISOString()
          : undefined;

        if (result.tags.GPSLatitude && result.tags.GPSLongitude) {
          exif.gps = {
            latitude: result.tags.GPSLatitude,
            longitude: result.tags.GPSLongitude,
          };
        }
      }

      return Object.keys(exif).length > 0 ? exif : undefined;
    } catch (error) {
      this.logger.warn(`Failed to extract EXIF data: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Generate perceptual hash for image deduplication
   */
  private async generatePerceptualHash(buffer: Buffer): Promise<string> {
    try {
      const hash = await imageHashAsync(buffer as any, 16, true);
      return hash as string;
    } catch (error) {
      this.logger.error(`Failed to generate perceptual hash: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate blurhash for progressive image loading
   */
  private async generateBlurhash(
    image: sharp.Sharp,
    metadata: sharp.Metadata,
  ): Promise<string> {
    try {
      // Resize to small dimensions for blurhash
      const small = await image
        .resize(32, 32, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const blurhash = blurhashEncode(
        new Uint8ClampedArray(small.data),
        small.info.width,
        small.info.height,
        4,
        3,
      );

      return blurhash;
    } catch (error) {
      this.logger.error(`Failed to generate blurhash: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract dominant color palette using node-vibrant
   */
  private async extractColorPalette(buffer: Buffer): Promise<ColorPalette> {
    try {
      const palette = await Vibrant.from(buffer).getPalette();

      return {
        dominant: palette.Vibrant?.hex || '#000000',
        vibrant: palette.Vibrant?.hex,
        muted: palette.Muted?.hex,
        darkVibrant: palette.DarkVibrant?.hex,
        darkMuted: palette.DarkMuted?.hex,
        lightVibrant: palette.LightVibrant?.hex,
        lightMuted: palette.LightMuted?.hex,
      };
    } catch (error) {
      this.logger.error(`Failed to extract color palette: ${error.message}`);
      return { dominant: '#000000' };
    }
  }

  /**
   * Calculate image quality metrics
   */
  private async calculateQualityMetrics(
    image: sharp.Sharp,
    metadata: sharp.Metadata,
  ): Promise<QualityMetrics> {
    try {
      const stats = await image.stats();

      // Calculate sharpness (using Laplacian variance approximation)
      const sharpness = stats.sharpness || 0;

      // Calculate brightness (average of RGB channels)
      const brightness =
        stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length / 255;

      // Calculate contrast (standard deviation across channels)
      const contrast =
        stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length / 255;

      // Determine if image is low quality
      const isLowQuality =
        sharpness < 0.3 || // Too blurry
        brightness < 0.1 || // Too dark
        brightness > 0.9 || // Too bright
        contrast < 0.1; // Too flat

      return {
        sharpness,
        brightness,
        contrast,
        isLowQuality,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate quality metrics: ${error.message}`);
      return {
        sharpness: 0,
        brightness: 0.5,
        contrast: 0.5,
        isLowQuality: false,
      };
    }
  }

  /**
   * Validate image dimensions against requirements
   */
  validateImageDimensions(
    width: number,
    height: number,
    role: string,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const shortEdge = Math.min(width, height);
    const aspectRatio = width / height;

    // From PRD: hero images require >= 1600px shortest edge
    if (role === 'HERO' && shortEdge < 1600) {
      issues.push(`Hero images must have shortest edge >= 1600px (current: ${shortEdge}px)`);
    }

    // From PRD: angle images require >= 1200px shortest edge
    if (role === 'ANGLE' && shortEdge < 1200) {
      issues.push(`Angle images must have shortest edge >= 1200px (current: ${shortEdge}px)`);
    }

    // From PRD: aspect ratio should be between 4:3 and 16:9
    if (aspectRatio < 4 / 3 || aspectRatio > 16 / 9) {
      issues.push(
        `Aspect ratio ${aspectRatio.toFixed(2)}:1 outside allowed range (4:3 to 16:9)`,
      );
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Detect and fix EXIF orientation
   */
  async applyExifOrientation(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer).rotate().toBuffer();
    } catch (error) {
      this.logger.error(`Failed to apply EXIF orientation: ${error.message}`);
      return buffer;
    }
  }

  /**
   * Convert color space to sRGB
   */
  async convertToSRGB(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer).toColorspace('srgb').toBuffer();
    } catch (error) {
      this.logger.error(`Failed to convert to sRGB: ${error.message}`);
      return buffer;
    }
  }

  /**
   * Strip EXIF data for public images (privacy)
   */
  async stripExifData(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer).withMetadata({ orientation: undefined }).toBuffer();
    } catch (error) {
      this.logger.error(`Failed to strip EXIF data: ${error.message}`);
      return buffer;
    }
  }
}
