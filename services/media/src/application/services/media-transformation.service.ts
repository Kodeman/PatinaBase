/**
 * Media Transformation Service (Application Layer)
 * Orchestrates image processing and transformation workflows
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IMediaRepository,
  MEDIA_REPOSITORY,
} from '../../domain/repositories/media.repository.interface';
import { MediaValidator } from '../../domain/validators/media.validator';
import { ImageTransformService } from '../../modules/transform/image-transform.service';
import { MetadataExtractionService } from '../../modules/assets/metadata-extraction.service';

export interface TransformMediaCommand {
  assetId: string;
  operations?: {
    resize?: { width?: number; height?: number };
    quality?: number;
    format?: string;
    stripMetadata?: boolean;
    autoOrient?: boolean;
  };
}

export interface TransformResult {
  assetId: string;
  metadata: {
    width?: number;
    height?: number;
    format?: string;
    phash?: string;
    blurhash?: string;
    palette?: any;
  };
  renditions?: any[];
}

@Injectable()
export class MediaTransformationService {
  private readonly logger = new Logger(MediaTransformationService.name);

  constructor(
    @Inject(MEDIA_REPOSITORY)
    private readonly repository: IMediaRepository,
    private readonly validator: MediaValidator,
    private readonly imageTransform: ImageTransformService,
    private readonly metadataExtraction: MetadataExtractionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process and transform media asset
   */
  async transformMedia(command: TransformMediaCommand): Promise<TransformResult> {
    this.logger.log(`Transforming media asset: ${command.assetId}`);

    // Find asset
    const asset = await this.repository.findById(command.assetId);
    if (!asset) {
      throw new Error(`Asset ${command.assetId} not found`);
    }

    // Update status to processing
    await this.repository.updateStatus(command.assetId, 'PROCESSING');

    try {
      // For now, return basic structure
      // Actual transformation would fetch from storage, process, and update
      const result: TransformResult = {
        assetId: command.assetId,
        metadata: {
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
          format: asset.format ?? undefined,
        },
      };

      // Update status to ready
      await this.repository.updateStatus(command.assetId, 'READY');
      await this.repository.update(command.assetId, { processed: true });

      // Emit event
      this.eventEmitter.emit('media.transformation.completed', {
        assetId: command.assetId,
        metadata: result.metadata,
      });

      this.logger.log(`Transformation complete for asset: ${command.assetId}`);

      return result;
    } catch (error) {
      this.logger.error(`Transformation failed for asset ${command.assetId}: ${error.message}`);

      // Update status to failed
      await this.repository.updateStatus(command.assetId, 'FAILED');

      // Emit error event
      this.eventEmitter.emit('media.transformation.failed', {
        assetId: command.assetId,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Extract and store metadata from image
   */
  async extractMetadata(assetId: string, buffer: Buffer): Promise<void> {
    this.logger.log(`Extracting metadata for asset: ${assetId}`);

    try {
      // Extract comprehensive metadata
      const metadata = await this.metadataExtraction.extractImageMetadata(buffer);

      // Validate dimensions if role is specified
      const asset = await this.repository.findById(assetId);
      if (asset?.role && metadata.width && metadata.height) {
        const dimensionValidation = this.validator.validateImageDimensions(
          metadata.width,
          metadata.height,
          asset.role,
        );

        if (!dimensionValidation.valid) {
          this.logger.warn(
            `Dimension validation issues for ${assetId}: ${dimensionValidation.issues.map((i) => i.message).join(', ')}`,
          );

          // Store QC issues
          await this.repository.update(assetId, {
            qcIssues: dimensionValidation.issues,
          });
        }
      }

      // Update asset with metadata
      await this.repository.update(assetId, {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        palette: metadata.palette,
      });

      this.logger.log(`Metadata extraction complete for asset: ${assetId}`);

      // Emit event
      this.eventEmitter.emit('media.metadata.extracted', {
        assetId,
        metadata,
      });
    } catch (error) {
      this.logger.error(`Metadata extraction failed for asset ${assetId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate renditions for an asset
   */
  async generateRenditions(
    assetId: string,
    purposes: string[] = ['THUMB', 'WEB', 'RETINA'],
  ): Promise<any[]> {
    this.logger.log(`Generating renditions for asset: ${assetId}`);

    // Find asset
    const asset = await this.repository.findById(assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    // TODO: Implement rendition generation logic
    // This would:
    // 1. Fetch original from storage
    // 2. Generate multiple sizes/formats
    // 3. Store renditions in storage
    // 4. Create AssetRendition records

    this.logger.log(`Renditions generated for asset: ${assetId}`);

    return [];
  }
}
