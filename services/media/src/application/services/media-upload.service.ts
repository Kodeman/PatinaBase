/**
 * Media Upload Service (Application Layer)
 * Orchestrates the upload workflow
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IMediaRepository,
  MEDIA_REPOSITORY,
} from '../../domain/repositories/media.repository.interface';
import { MediaValidator } from '../../domain/validators/media.validator';
import { MediaMetadataExtractorService } from '../../domain/services/media-metadata-extractor.service';
import { UploadService } from '../../modules/upload/upload.service';
import * as crypto from 'crypto';

export interface UploadMediaCommand {
  userId: string;
  kind: 'IMAGE' | 'VIDEO' | 'MODEL3D';
  filename: string;
  fileSize?: number;
  mimeType?: string;
  productId?: string;
  variantId?: string;
  role?: string;
  tags?: string[];
  isPublic?: boolean;
  licenseType?: string;
  attribution?: string;
  file?: Buffer;
}

export interface UploadResult {
  assetId: string;
  uploadSessionId: string;
  uploadUrl: string;
  expiresAt: Date;
  duplicate?: boolean;
  existingAssetId?: string;
}

@Injectable()
export class MediaUploadService {
  private readonly logger = new Logger(MediaUploadService.name);

  constructor(
    @Inject(MEDIA_REPOSITORY)
    private readonly repository: IMediaRepository,
    private readonly validator: MediaValidator,
    private readonly metadataExtractor: MediaMetadataExtractorService,
    private readonly uploadService: UploadService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Upload single media asset
   */
  async uploadSingle(command: UploadMediaCommand): Promise<UploadResult> {
    this.logger.log(`Starting upload for user ${command.userId}: ${command.filename}`);

    // Validate upload
    this.validator.validateFileUpload({
      kind: command.kind,
      mimeType: command.mimeType,
      fileSize: command.fileSize,
      filename: command.filename,
    });

    // Validate role if provided
    if (command.role) {
      this.validator.validateRole(command.kind, command.role);
    }

    // Validate tags if provided
    if (command.tags && command.tags.length > 0) {
      const tagValidation = this.validator.validateTags(command.tags);
      if (!tagValidation.valid) {
        throw new Error(
          `Tag validation failed: ${tagValidation.issues.map((i) => i.message).join(', ')}`,
        );
      }
    }

    // Check for duplicates if file buffer is provided
    if (command.file && command.kind === 'IMAGE') {
      const duplicateAssetId = await this.checkDuplicate(command.file);
      if (duplicateAssetId) {
        this.logger.warn(`Duplicate asset detected: ${duplicateAssetId}`);
        return {
          assetId: duplicateAssetId,
          uploadSessionId: '',
          uploadUrl: '',
          expiresAt: new Date(),
          duplicate: true,
          existingAssetId: duplicateAssetId,
        };
      }
    }

    // Create upload intent
    const uploadIntent = await this.uploadService.createUploadIntent(
      command.userId,
      {
        kind: command.kind as any,
        filename: command.filename,
        fileSize: command.fileSize,
        mimeType: command.mimeType,
        productId: command.productId,
        variantId: command.variantId,
        role: command.role as any,
      },
      crypto.randomUUID(), // idempotency key
    );

    // Update asset with additional metadata
    const licenseData: any = {};
    if (command.licenseType) licenseData.licenseType = command.licenseType;
    if (command.attribution) licenseData.attribution = command.attribution;

    await this.repository.update(uploadIntent.assetId, {
      tags: command.tags || [],
      isPublic: command.isPublic || false,
      license: Object.keys(licenseData).length > 0 ? licenseData : undefined,
    });

    this.logger.log(`Upload intent created: ${uploadIntent.assetId}`);

    // Emit event
    this.eventEmitter.emit('media.upload.initiated', {
      assetId: uploadIntent.assetId,
      userId: command.userId,
      kind: command.kind,
    });

    return {
      assetId: uploadIntent.assetId,
      uploadSessionId: uploadIntent.uploadSessionId,
      uploadUrl: uploadIntent.parUrl,
      expiresAt: uploadIntent.expiresAt,
    };
  }

  /**
   * Upload multiple media assets (batch)
   */
  async uploadBatch(commands: UploadMediaCommand[]): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: any[];
  }> {
    this.logger.log(`Starting batch upload: ${commands.length} files`);

    const results = await Promise.allSettled(
      commands.map((cmd) => this.uploadSingle(cmd)),
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`Batch upload complete: ${successful} successful, ${failed} failed`);

    return {
      total: commands.length,
      successful,
      failed,
      results: results.map((r, index) => ({
        filename: commands[index].filename,
        status: r.status,
        data: r.status === 'fulfilled' ? r.value : null,
        error: r.status === 'rejected' ? r.reason.message : null,
      })),
    };
  }

  /**
   * Check for duplicate assets using perceptual hash
   */
  private async checkDuplicate(fileBuffer: Buffer): Promise<string | null> {
    try {
      // Calculate perceptual hash
      const phash = await this.metadataExtractor.calculatePerceptualHash(fileBuffer);

      // Search for existing asset with same hash
      const existing = await this.repository.findByPhash(phash);

      return existing?.id || null;
    } catch (error) {
      this.logger.error(`Failed to check for duplicates: ${error.message}`);
      return null;
    }
  }

  /**
   * Confirm upload completion
   */
  async confirmUpload(sessionId: string): Promise<{ assetId: string; targetKey: string }> {
    const result = await this.uploadService.confirmUpload(sessionId);

    // Emit event
    this.eventEmitter.emit('media.upload.completed', {
      assetId: result.assetId,
      targetKey: result.targetKey,
    });

    return result;
  }
}
