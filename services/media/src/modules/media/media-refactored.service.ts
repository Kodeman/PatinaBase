/**
 * Media Service (Refactored) - Facade Pattern
 *
 * This service provides 100% backward compatibility with the original MediaService
 * while delegating to the new clean architecture implementation.
 *
 * Architecture:
 * - Domain Layer: Validators, Repository Interfaces, Domain Services
 * - Infrastructure Layer: Prisma Repositories
 * - Application Layer: Upload, Transformation, Storage Services
 * - Presentation Layer: This facade service
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  IMediaRepository,
  MEDIA_REPOSITORY,
  MediaQuery,
} from '../../domain/repositories/media.repository.interface';
import { MediaValidator } from '../../domain/validators/media.validator';
import { MediaUploadService } from '../../application/services/media-upload.service';
import { MediaTransformationService } from '../../application/services/media-transformation.service';
import { MediaStorageService } from '../../application/services/media-storage.service';

// DTOs (re-exported from original service)
import {
  UploadMediaDto,
  BatchUploadMediaDto,
  ProcessMediaDto,
  BatchProcessMediaDto,
  UpdateMediaMetadataDto,
  MediaQueryDto,
  MediaResponseDto,
  MediaListResponseDto,
  ProcessingPriority,
} from './dto';

@Injectable()
export class MediaRefactoredService {
  private readonly logger = new Logger(MediaRefactoredService.name);

  constructor(
    @Inject(MEDIA_REPOSITORY)
    private readonly repository: IMediaRepository,
    private readonly validator: MediaValidator,
    private readonly uploadService: MediaUploadService,
    private readonly transformationService: MediaTransformationService,
    private readonly storageService: MediaStorageService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('media-processing') private readonly processingQueue: Queue,
  ) {}

  /**
   * Upload single media asset
   * Delegates to MediaUploadService
   */
  async uploadSingle(userId: string, dto: UploadMediaDto, file?: Buffer) {
    this.logger.log(`Starting upload for user ${userId}: ${dto.filename}`);

    const result = await this.uploadService.uploadSingle({
      userId,
      kind: dto.kind as any,
      filename: dto.filename,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
      productId: dto.productId,
      variantId: dto.variantId,
      role: dto.role,
      tags: dto.tags,
      isPublic: dto.isPublic,
      licenseType: dto.licenseType,
      attribution: dto.attribution,
      file,
    });

    // Return in original format
    if (result.duplicate) {
      return {
        duplicate: true,
        existingAssetId: result.existingAssetId,
      };
    }

    return {
      assetId: result.assetId,
      uploadSessionId: result.uploadSessionId,
      uploadUrl: result.uploadUrl,
      expiresAt: result.expiresAt,
    };
  }

  /**
   * Upload multiple media assets (batch)
   * Delegates to MediaUploadService
   */
  async uploadBatch(userId: string, dto: BatchUploadMediaDto) {
    this.logger.log(`Starting batch upload for user ${userId}: ${dto.uploads.length} files`);

    const commands = dto.uploads.map((upload) => ({
      userId,
      kind: upload.kind as any,
      filename: upload.filename,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      productId: upload.productId,
      variantId: upload.variantId,
      role: upload.role,
      tags: upload.tags,
      isPublic: upload.isPublic,
      licenseType: upload.licenseType,
      attribution: upload.attribution,
    }));

    return this.uploadService.uploadBatch(commands);
  }

  /**
   * Process media asset (queue processing job)
   */
  async processMedia(dto: ProcessMediaDto) {
    const asset = await this.repository.findById(dto.assetId);

    if (!asset) {
      throw new NotFoundException(`Asset ${dto.assetId} not found`);
    }

    // Check if already processing
    if (asset.status === 'PROCESSING' && !dto.forceReprocess) {
      throw new BadRequestException(`Asset ${dto.assetId} is already being processed`);
    }

    // Update status
    await this.repository.updateStatus(dto.assetId, 'PROCESSING');

    // Queue processing job
    const job = await this.processingQueue.add(
      'process-asset',
      {
        assetId: dto.assetId,
        options: dto.options || {},
      },
      {
        priority: this.getPriority(dto.priority),
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    this.logger.log(`Queued processing job ${job.id} for asset ${dto.assetId}`);

    return {
      assetId: dto.assetId,
      jobId: job.id,
      status: 'processing',
    };
  }

  /**
   * Process multiple media assets (batch)
   */
  async processBatch(dto: BatchProcessMediaDto) {
    this.logger.log(`Starting batch processing: ${dto.assetIds.length} assets`);

    const results = await Promise.allSettled(
      dto.assetIds.map((assetId) =>
        this.processMedia({
          assetId,
          priority: dto.priority,
          options: dto.options,
        }),
      ),
    );

    return {
      total: dto.assetIds.length,
      queued: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
      results,
    };
  }

  /**
   * Get media asset by ID
   * Delegates to MediaStorageService
   */
  async getById(assetId: string, incrementViewCount = false): Promise<MediaResponseDto> {
    const asset = await this.storageService.getAsset({
      assetId,
      incrementViewCount,
    });

    return this.transformToDto(asset);
  }

  /**
   * Search/query media assets with pagination
   * Delegates to repository
   */
  async search(query: MediaQueryDto): Promise<MediaListResponseDto> {
    const mediaQuery: MediaQuery = {
      kind: query.kind,
      productId: query.productId,
      variantId: query.variantId,
      role: query.role,
      status: query.status,
      uploadedBy: query.uploadedBy,
      isPublic: query.isPublic,
      mimeType: query.mimeType,
      tags: query.tags,
      minSize: query.minSize,
      maxSize: query.maxSize,
      processedOnly: query.processedOnly,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    };

    const result = await this.repository.findAll(mediaQuery);

    this.logger.log(`Search returned ${result.data.length} of ${result.pagination.total} total assets`);

    return {
      data: result.data.map((asset) => this.transformToDto(asset)),
      pagination: result.pagination,
    };
  }

  /**
   * Update media asset metadata
   * Delegates to repository
   */
  async updateMetadata(assetId: string, dto: UpdateMediaMetadataDto) {
    const asset = await this.repository.findById(assetId);

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    // Prepare update data
    const updateData: any = {};

    if (dto.role !== undefined) updateData.role = dto.role;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;
    if (dto.width !== undefined) updateData.width = dto.width;
    if (dto.height !== undefined) updateData.height = dto.height;
    if (dto.format !== undefined) updateData.format = dto.format;
    if (dto.permissions !== undefined) updateData.permissions = dto.permissions;

    // Handle license fields
    if (dto.licenseType !== undefined || dto.attribution !== undefined) {
      const currentLicense = (asset.license as any) || {};
      updateData.license = { ...currentLicense };
      if (dto.licenseType !== undefined) updateData.license.licenseType = dto.licenseType;
      if (dto.attribution !== undefined) updateData.license.attribution = dto.attribution;
    }

    // Handle custom metadata
    if (dto.meta) {
      this.logger.warn(
        'UpdateMediaMetadataDto.meta is deprecated. Use specific fields instead.',
      );
      const currentPalette = (asset.palette as any) || {};
      updateData.palette = { ...currentPalette, ...dto.meta };
    }

    const updated = await this.repository.update(assetId, updateData);

    this.logger.log(`Updated metadata for asset ${assetId}`);

    // Emit event
    this.eventEmitter.emit('media.metadata.updated', {
      assetId,
      changes: dto,
    });

    return this.transformToDto(updated);
  }

  /**
   * Delete media asset
   * Delegates to MediaStorageService
   */
  async delete(assetId: string, softDelete = true) {
    return this.storageService.deleteAsset({
      assetId,
      softDelete,
    });
  }

  /**
   * Get job priority value
   */
  private getPriority(priority?: ProcessingPriority): number {
    switch (priority) {
      case ProcessingPriority.URGENT:
        return 1;
      case ProcessingPriority.HIGH:
        return 5;
      case ProcessingPriority.NORMAL:
        return 10;
      case ProcessingPriority.LOW:
        return 20;
      default:
        return 10;
    }
  }

  /**
   * Transform database model to DTO
   */
  private transformToDto(asset: any): MediaResponseDto {
    return {
      id: asset.id,
      kind: asset.kind,
      productId: asset.productId,
      variantId: asset.variantId,
      role: asset.role,
      rawKey: asset.rawKey,
      uri: undefined,
      width: asset.width,
      height: asset.height,
      format: asset.format,
      status: asset.status,
      tags: asset.tags || [],
      viewCount: asset.viewCount || 0,
      downloadCount: asset.downloadCount || 0,
      sizeBytes: asset.sizeBytes?.toString(),
      mimeType: asset.mimeType,
      isPublic: asset.isPublic || false,
      uploadedBy: asset.uploadedBy,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }
}
