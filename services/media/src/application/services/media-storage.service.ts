/**
 * Media Storage Service (Application Layer)
 * Orchestrates storage operations (retrieval, deletion, CDN management)
 */

import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IMediaRepository,
  MEDIA_REPOSITORY,
} from '../../domain/repositories/media.repository.interface';
import { OCIStorageService } from '../../modules/storage/oci-storage.service';
import { ConfigService } from '@nestjs/config';

export interface MediaRetrievalCommand {
  assetId: string;
  incrementViewCount?: boolean;
}

export interface MediaDeletionCommand {
  assetId: string;
  softDelete?: boolean;
}

@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);

  constructor(
    @Inject(MEDIA_REPOSITORY)
    private readonly repository: IMediaRepository,
    private readonly ociStorage: OCIStorageService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get media asset by ID
   */
  async getAsset(command: MediaRetrievalCommand) {
    const { assetId, incrementViewCount = false } = command;

    const asset = await this.repository.findById(assetId);

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    // Increment view count if requested
    if (incrementViewCount) {
      await this.repository.incrementViewCount(assetId);
    }

    return asset;
  }

  /**
   * Delete media asset
   */
  async deleteAsset(command: MediaDeletionCommand): Promise<{
    success: boolean;
    assetId: string;
    deleted: boolean;
  }> {
    const { assetId, softDelete = true } = command;

    const asset = await this.repository.findById(assetId);

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    if (!softDelete) {
      // Hard delete - remove from storage first
      try {
        if (asset.rawKey) {
          const rawBucket = this.config.get('OCI_BUCKET_RAW') || '';
          await this.ociStorage.deleteObject(rawBucket, asset.rawKey);
        }

        // TODO: Delete renditions from storage
        const renditions = await this.repository.findRenditions(assetId);
        for (const rendition of renditions) {
          try {
            const processedBucket = this.config.get('OCI_BUCKET_PROCESSED') || '';
            await this.ociStorage.deleteObject(processedBucket, rendition.key);
          } catch (error) {
            this.logger.error(`Failed to delete rendition ${rendition.id}: ${error.message}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to delete asset from storage: ${error.message}`);
      }
    }

    // Delete from database
    await this.repository.delete(assetId, softDelete);

    this.logger.log(`${softDelete ? 'Soft' : 'Hard'} deleted asset ${assetId}`);

    // Emit event
    this.eventEmitter.emit('media.deleted', {
      assetId,
      softDelete,
    });

    return {
      success: true,
      assetId,
      deleted: !softDelete,
    };
  }

  /**
   * Get signed URL for asset download
   */
  async getDownloadUrl(assetId: string, expiresInMinutes = 15): Promise<string> {
    const asset = await this.repository.findById(assetId);

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    if (!asset.rawKey) {
      throw new Error(`Asset ${assetId} has no storage key`);
    }

    // Increment download count
    await this.repository.incrementDownloadCount(assetId);

    // Generate PAR for download
    const rawBucket = this.config.get('OCI_BUCKET_RAW') || '';
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const par = await this.ociStorage.createPAR({
      bucketName: rawBucket,
      objectName: asset.rawKey,
      accessType: 'ObjectRead',
      timeExpires: expiresAt,
    });

    return par.fullUrl;
  }

  /**
   * Get assets by product ID
   */
  async getAssetsByProduct(productId: string) {
    return this.repository.findByProductId(productId);
  }

  /**
   * Get assets by variant ID
   */
  async getAssetsByVariant(variantId: string) {
    return this.repository.findByVariantId(variantId);
  }

  /**
   * Get asset renditions
   */
  async getRenditions(assetId: string) {
    const exists = await this.repository.exists(assetId);
    if (!exists) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    return this.repository.findRenditions(assetId);
  }

  /**
   * Get 3D metadata
   */
  async get3DMetadata(assetId: string) {
    const exists = await this.repository.exists(assetId);
    if (!exists) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    return this.repository.find3DMetadata(assetId);
  }
}
