import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { OCIStorageService } from '../storage/oci-storage.service';

export interface TransformOptions {
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  quality?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: string;
  background?: string;
}

export interface RenditionSpec {
  width: number;
  format: 'jpeg' | 'png' | 'webp' | 'avif';
  quality: number;
  purpose: 'THUMB' | 'WEB' | 'RETINA' | 'ORIGINAL';
}

@Injectable()
export class ImageTransformService {
  private readonly logger = new Logger(ImageTransformService.name);

  // From PRD: standard rendition sizes
  private readonly RENDITION_SIZES = [256, 512, 768, 1024, 1600, 2048];

  // Quality presets
  private readonly QUALITY_PRESETS = {
    jpeg: { thumb: 75, web: 85, retina: 90 },
    webp: { thumb: 70, web: 80, retina: 85 },
    avif: { thumb: 60, web: 70, retina: 75 },
  };

  constructor(
    private config: ConfigService,
    private ociStorage: OCIStorageService,
  ) {}

  /**
   * Generate standard renditions for an image
   */
  async generateRenditions(
    assetId: string,
    sourceBuffer: Buffer,
    originalFormat: string,
  ): Promise<RenditionSpec[]> {
    const renditions: RenditionSpec[] = [];
    const metadata = await sharp(sourceBuffer).metadata();

    this.logger.log(`Generating renditions for asset ${assetId}, original: ${metadata.width}x${metadata.height}`);

    // Generate renditions for each size
    for (const size of this.RENDITION_SIZES) {
      // Skip if original is smaller than rendition size
      if ((metadata.width || 0) < size && (metadata.height || 0) < size) {
        continue;
      }

      // Generate WebP rendition
      const webpRendition = await this.createRendition(sourceBuffer, {
        width: size,
        format: 'webp',
        quality: this.getQuality('webp', size),
        fit: 'inside',
      });

      const webpKey = this.ociStorage.generateRenditionKey(assetId, size, size, 'webp');
      await this.ociStorage.putObject(
        this.config.get('OCI_BUCKET_PROCESSED') || 'processed',
        webpKey,
        webpRendition,
      );

      renditions.push({
        width: size,
        format: 'webp',
        quality: this.getQuality('webp', size),
        purpose: this.getPurpose(size),
      });

      // Generate AVIF rendition (modern browsers)
      const avifRendition = await this.createRendition(sourceBuffer, {
        width: size,
        format: 'avif',
        quality: this.getQuality('avif', size),
        fit: 'inside',
      });

      const avifKey = this.ociStorage.generateRenditionKey(assetId, size, size, 'avif');
      await this.ociStorage.putObject(
        this.config.get('OCI_BUCKET_PROCESSED') || 'processed',
        avifKey,
        avifRendition,
      );

      renditions.push({
        width: size,
        format: 'avif',
        quality: this.getQuality('avif', size),
        purpose: this.getPurpose(size),
      });

      // Keep original format as fallback
      if (originalFormat === 'jpeg' || originalFormat === 'png') {
        const fallbackRendition = await this.createRendition(sourceBuffer, {
          width: size,
          format: originalFormat as 'jpeg' | 'png',
          quality: this.getQuality('jpeg', size),
          fit: 'inside',
        });

        const fallbackKey = this.ociStorage.generateRenditionKey(
          assetId,
          size,
          size,
          originalFormat,
        );
        await this.ociStorage.putObject(
          this.config.get('OCI_BUCKET_PROCESSED') || 'processed',
          fallbackKey,
          fallbackRendition,
        );

        renditions.push({
          width: size,
          format: originalFormat as 'jpeg' | 'png',
          quality: this.getQuality('jpeg', size),
          purpose: this.getPurpose(size),
        });
      }
    }

    this.logger.log(`Generated ${renditions.length} renditions for asset ${assetId}`);
    return renditions;
  }

  /**
   * Create a single rendition with specified options
   */
  async createRendition(sourceBuffer: Buffer, options: TransformOptions): Promise<Buffer> {
    let pipeline = sharp(sourceBuffer);

    // Resize
    if (options.width || options.height) {
      pipeline = pipeline.resize({
        width: options.width,
        height: options.height,
        fit: options.fit || 'inside',
        position: options.position || 'centre',
        background: options.background || { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: true,
      });
    }

    // Convert format
    switch (options.format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({
          quality: options.quality || 85,
          progressive: true,
          mozjpeg: true,
        });
        break;
      case 'png':
        pipeline = pipeline.png({
          quality: options.quality || 90,
          compressionLevel: 9,
          progressive: true,
        });
        break;
      case 'webp':
        pipeline = pipeline.webp({
          quality: options.quality || 80,
          effort: 6,
        });
        break;
      case 'avif':
        pipeline = pipeline.avif({
          quality: options.quality || 70,
          effort: 6,
        });
        break;
    }

    return pipeline.toBuffer();
  }

  /**
   * Generate LQIP (Low Quality Image Placeholder)
   */
  async generateLQIP(assetId: string, sourceBuffer: Buffer): Promise<string> {
    const lqipBuffer = await sharp(sourceBuffer)
      .resize(64, 64, { fit: 'inside' })
      .jpeg({ quality: 40 })
      .toBuffer();

    const lqipKey = this.ociStorage.generatePreviewKey(assetId, 'image');
    await this.ociStorage.putObject(this.config.get('OCI_BUCKET_PROCESSED') || 'processed', lqipKey, lqipBuffer);

    this.logger.log(`Generated LQIP for asset ${assetId}`);
    return lqipKey;
  }

  /**
   * Get quality setting based on format and size
   */
  private getQuality(format: 'jpeg' | 'webp' | 'avif', size: number): number {
    if (size <= 512) {
      return this.QUALITY_PRESETS[format].thumb;
    } else if (size <= 1024) {
      return this.QUALITY_PRESETS[format].web;
    } else {
      return this.QUALITY_PRESETS[format].retina;
    }
  }

  /**
   * Determine rendition purpose based on size
   */
  private getPurpose(size: number): 'THUMB' | 'WEB' | 'RETINA' | 'ORIGINAL' {
    if (size <= 512) return 'THUMB';
    if (size <= 1024) return 'WEB';
    return 'RETINA';
  }

  /**
   * Integrate with imgproxy for on-the-fly transformations
   */
  async getImgproxyUrl(assetKey: string, options: TransformOptions): Promise<string> {
    const imgproxyUrl = this.config.get('IMGPROXY_URL');
    const imgproxyKey = this.config.get('IMGPROXY_KEY');
    const imgproxySalt = this.config.get('IMGPROXY_SALT');

    // Construct imgproxy URL with signing
    const path = `/resize:fit:${options.width || 0}:${options.height || 0}/format:${options.format || 'webp'}/quality:${options.quality || 80}/${assetKey}`;

    // TODO: Implement HMAC signing for imgproxy
    const signature = 'unsigned'; // Replace with actual signature

    return `${imgproxyUrl}/${signature}${path}`;
  }

  /**
   * Apply watermark to image with advanced options
   */
  async applyWatermark(
    sourceBuffer: Buffer,
    watermarkBuffer: Buffer,
    options: {
      position?: 'northwest' | 'northeast' | 'southwest' | 'southeast' | 'center';
      opacity?: number; // 0-100
      size?: number; // Percentage of image width (1-100)
      margin?: number; // Pixels from edge
    } = {},
  ): Promise<Buffer> {
    const metadata = await sharp(sourceBuffer).metadata();
    const watermarkSize = Math.floor((metadata.width || 1000) * ((options.size || 20) / 100));
    const opacity = Math.max(0, Math.min(100, options.opacity || 100)) / 100;

    // Resize and adjust opacity of watermark
    const processedWatermark = await sharp(watermarkBuffer)
      .resize(watermarkSize, watermarkSize, { fit: 'inside' })
      .ensureAlpha()
      .toBuffer();

    // Apply opacity by compositing with transparent layer
    const watermarkWithOpacity =
      opacity < 1
        ? await sharp(processedWatermark)
            .composite([
              {
                input: Buffer.from([255, 255, 255, Math.floor(opacity * 255)]),
                raw: {
                  width: 1,
                  height: 1,
                  channels: 4,
                },
                tile: true,
                blend: 'dest-in',
              },
            ])
            .toBuffer()
        : processedWatermark;

    const margin = options.margin || 20;

    // Calculate position
    let gravity: any = options.position || 'southeast';
    let offset: { x?: number; y?: number } = {};

    if (gravity !== 'center') {
      offset = { x: margin, y: margin };
    }

    return sharp(sourceBuffer)
      .composite([
        {
          input: watermarkWithOpacity,
          gravity,
          blend: 'over',
        },
      ])
      .toBuffer();
  }

  /**
   * Apply text watermark
   */
  async applyTextWatermark(
    sourceBuffer: Buffer,
    text: string,
    options: {
      position?: 'northwest' | 'northeast' | 'southwest' | 'southeast' | 'center';
      fontSize?: number;
      color?: string;
      opacity?: number;
    } = {},
  ): Promise<Buffer> {
    // Generate SVG text watermark
    const fontSize = options.fontSize || 48;
    const color = options.color || 'white';
    const opacity = (options.opacity || 70) / 100;

    const svgText = `
      <svg width="${text.length * fontSize * 0.6}" height="${fontSize * 1.5}">
        <text
          x="0"
          y="${fontSize}"
          font-family="Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="bold"
          fill="${color}"
          opacity="${opacity}"
        >${text}</text>
      </svg>
    `;

    const textBuffer = Buffer.from(svgText);

    return this.applyWatermark(sourceBuffer, textBuffer, {
      position: options.position,
      size: 30, // 30% of image width
    });
  }

  /**
   * Remove background (placeholder for AI service integration)
   */
  async removeBackground(sourceBuffer: Buffer): Promise<Buffer> {
    // TODO: Integrate with background removal service:
    // - remove.bg API
    // - Adobe Sensei
    // - PhotoRoom API
    // - Local ML models (U2-Net, etc.)
    this.logger.warn('Background removal not implemented - requires ML service integration');
    return sourceBuffer;
  }

  /**
   * Apply blur effect to background (privacy for faces)
   */
  async blurBackground(
    sourceBuffer: Buffer,
    blurStrength = 10,
    foregroundMask?: Buffer,
  ): Promise<Buffer> {
    if (!foregroundMask) {
      // No mask provided, blur entire image
      return sharp(sourceBuffer).blur(blurStrength).toBuffer();
    }

    // Blur the image
    const blurred = await sharp(sourceBuffer).blur(blurStrength).toBuffer();

    // Composite original with blurred using mask
    return sharp(sourceBuffer)
      .composite([
        {
          input: blurred,
          blend: 'over',
        },
      ])
      .toBuffer();
  }
}
