import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import * as crypto from 'crypto';

// Services
import { OCIStorageService } from '../storage/oci-storage.service';
import { UploadService } from '../upload/upload.service';
import { MetadataExtractionService } from '../assets/metadata-extraction.service';
import { ImageTransformService } from '../transform/image-transform.service';
import { ThreeDProcessingService } from '../3d/3d-processing.service';
import { VirusScannerService } from '../security/virus-scanner.service';

// DTOs
import {
  UploadMediaDto,
  BatchUploadMediaDto,
  ProcessMediaDto,
  BatchProcessMediaDto,
  UpdateMediaMetadataDto,
  MediaQueryDto,
  MediaResponseDto,
  MediaListResponseDto,
  MediaKind,
  ProcessingPriority,
  MediaStatus,
  SortBy,
  SortOrder,
} from './dto';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  // File size limits (in bytes)
  private readonly MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
  private readonly MAX_3D_SIZE = 500 * 1024 * 1024; // 500MB

  // Allowed MIME types
  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/heic',
  ];

  private readonly ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ];

  private readonly ALLOWED_3D_TYPES = [
    'model/gltf-binary',
    'model/gltf+json',
    'model/vnd.usdz+zip',
    'application/octet-stream', // For GLB/USDZ
  ];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly ociStorage: OCIStorageService,
    private readonly uploadService: UploadService,
    private readonly metadataService: MetadataExtractionService,
    private readonly imageTransform: ImageTransformService,
    private readonly threeDProcessing: ThreeDProcessingService,
    private readonly virusScanner: VirusScannerService,
    @InjectQueue('media-processing') private readonly processingQueue: Queue,
  ) {}

  /**
   * Upload single media asset
   */
  async uploadSingle(userId: string, dto: UploadMediaDto, file?: Buffer) {
    this.logger.log(`Starting upload for user ${userId}: ${dto.filename}`);

    // Validate file
    this.validateUpload(dto);

    // Check for duplicates using perceptual hash if file is provided
    let duplicateAssetId: string | null = null;
    if (file && dto.kind === MediaKind.IMAGE) {
      duplicateAssetId = await this.checkDuplicate(file);
      if (duplicateAssetId) {
        this.logger.warn(`Duplicate asset detected: ${duplicateAssetId}`);
        return {
          duplicate: true,
          existingAssetId: duplicateAssetId,
        };
      }
    }

    // Create upload intent
    const uploadIntent = await this.uploadService.createUploadIntent(
      userId,
      {
        kind: dto.kind as any,
        filename: dto.filename,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        productId: dto.productId,
        variantId: dto.variantId,
        role: dto.role as any,
      },
      crypto.randomUUID(), // idempotency key
    );

    // Update asset with additional metadata
    const licenseData: any = {};
    if (dto.licenseType) licenseData.licenseType = dto.licenseType;
    if (dto.attribution) licenseData.attribution = dto.attribution;

    await this.prisma.mediaAsset.update({
      where: { id: uploadIntent.assetId },
      data: {
        tags: dto.tags || [],
        isPublic: dto.isPublic || false,
        license: Object.keys(licenseData).length > 0 ? licenseData : undefined,
      },
    });

    this.logger.log(`Upload intent created: ${uploadIntent.assetId}`);

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
  async uploadBatch(userId: string, dto: BatchUploadMediaDto) {
    this.logger.log(`Starting batch upload for user ${userId}: ${dto.uploads.length} files`);

    const results = await Promise.allSettled(
      dto.uploads.map((upload) => this.uploadSingle(userId, upload)),
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`Batch upload complete: ${successful} successful, ${failed} failed`);

    return {
      total: dto.uploads.length,
      successful,
      failed,
      results: results.map((r, index) => ({
        filename: dto.uploads[index].filename,
        status: r.status,
        data: r.status === 'fulfilled' ? r.value : null,
        error: r.status === 'rejected' ? r.reason.message : null,
      })),
    };
  }

  /**
   * Process media asset (queue processing job)
   */
  async processMedia(dto: ProcessMediaDto) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: dto.assetId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${dto.assetId} not found`);
    }

    // Check if already processing
    if (asset.status === 'PROCESSING' && !dto.forceReprocess) {
      throw new BadRequestException(`Asset ${dto.assetId} is already being processed`);
    }

    // Update status
    await this.prisma.mediaAsset.update({
      where: { id: dto.assetId },
      data: {
        status: 'PROCESSING',
      },
    });

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

    // Note: processingJobId is not in schema - tracking handled by ProcessJob table
    this.logger.log(`Created ProcessJob with jobId: ${job.id}`);

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
   */
  async getById(assetId: string, incrementViewCount = false): Promise<MediaResponseDto> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    // Increment view count if requested
    if (incrementViewCount) {
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          viewCount: { increment: 1 },
        },
      });
    }

    return this.transformToDto(asset);
  }

  /**
   * Search/query media assets with pagination
   */
  async search(query: MediaQueryDto): Promise<MediaListResponseDto> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (query.kind) where.kind = query.kind;
    if (query.productId) where.productId = query.productId;
    if (query.variantId) where.variantId = query.variantId;
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.uploadedBy) where.uploadedBy = query.uploadedBy;
    if (query.isPublic !== undefined) where.isPublic = query.isPublic;
    if (query.mimeType) where.mimeType = query.mimeType;
    if (query.processedOnly) where.processed = true;

    // Tags filter (any of)
    if (query.tags && query.tags.length > 0) {
      where.tags = { hasSome: query.tags };
    }

    // Size filters
    if (query.minSize !== undefined || query.maxSize !== undefined) {
      where.sizeBytes = {};
      if (query.minSize !== undefined) where.sizeBytes.gte = query.minSize;
      if (query.maxSize !== undefined) where.sizeBytes.lte = query.maxSize;
    }

    // Search filter (filename or tags)
    if (query.search) {
      where.OR = [
        { rawKey: { contains: query.search, mode: 'insensitive' } },
        { tags: { has: query.search } },
      ];
    }

    // Build orderBy
    const orderBy: any = {};
    const sortBy = query.sortBy || SortBy.CREATED_AT;
    const sortOrder = query.sortOrder || SortOrder.DESC;
    orderBy[sortBy] = sortOrder;

    // Execute query with pagination
    const [assets, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    this.logger.log(`Search returned ${assets.length} of ${total} total assets`);

    return {
      data: assets.map((asset) => this.transformToDto(asset)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update media asset metadata
   */
  async updateMetadata(assetId: string, dto: UpdateMediaMetadataDto) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

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

    // Handle license fields - store in license Json field
    if (dto.licenseType !== undefined || dto.attribution !== undefined) {
      const currentLicense = (asset.license as any) || {};
      updateData.license = { ...currentLicense };
      if (dto.licenseType !== undefined) updateData.license.licenseType = dto.licenseType;
      if (dto.attribution !== undefined) updateData.license.attribution = dto.attribution;
    }

    // Handle custom metadata - route to appropriate fields
    // Note: MediaAsset schema doesn't have generic 'meta' field
    // Data should be stored in specific fields: palette, qcIssues, scanResult
    if (dto.meta) {
      this.logger.warn(
        'UpdateMediaMetadataDto.meta is deprecated. Use specific fields (palette, qcIssues, scanResult) instead.',
      );
      // For backwards compatibility, store in palette field if provided
      const currentPalette = (asset.palette as any) || {};
      updateData.palette = { ...currentPalette, ...dto.meta };
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: updateData,
    });

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
   */
  async delete(assetId: string, softDelete = true) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    if (softDelete) {
      // Soft delete by setting status to BLOCKED or QUARANTINED
      // Note: schema doesn't have 'archived' status - using BLOCKED instead
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          status: 'BLOCKED',
        },
      });

      this.logger.log(`Soft deleted (blocked) asset ${assetId}`);
    } else {
      // Hard delete - remove from storage and database
      try {
        // Delete from object storage
        if (asset.rawKey) {
          await this.ociStorage.deleteObject(
            this.config.get('OCI_BUCKET_RAW') || '',
            asset.rawKey,
          );
        }
        // Note: schema doesn't have 'uri' field for processed files
        // Renditions are stored in AssetRendition table
      } catch (error) {
        this.logger.error(`Failed to delete asset from storage: ${error.message}`);
      }

      // Delete from database
      await this.prisma.mediaAsset.delete({
        where: { id: assetId },
      });

      this.logger.log(`Hard deleted asset ${assetId}`);
    }

    // Emit event
    this.eventEmitter.emit('media.deleted', {
      assetId,
      softDelete,
    });

    return { success: true, assetId, deleted: !softDelete };
  }

  /**
   * Check for duplicate assets using perceptual hash
   */
  private async checkDuplicate(fileBuffer: Buffer): Promise<string | null> {
    try {
      // Calculate perceptual hash
      const phash = await this.calculatePerceptualHash(fileBuffer);

      // Search for existing asset with same hash
      const existing = await this.prisma.mediaAsset.findFirst({
        where: {
          phash,
          status: { not: 'BLOCKED' as any },
        },
      });

      return existing?.id || null;
    } catch (error) {
      this.logger.error(`Failed to check for duplicates: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate perceptual hash for duplicate detection
   */
  private async calculatePerceptualHash(fileBuffer: Buffer): Promise<string> {
    // This is a simplified implementation
    // In production, use a proper perceptual hashing library like pHash or dHash
    const hash = createHash('sha256').update(fileBuffer).digest('hex');
    return hash.substring(0, 16); // Use first 16 chars as simplified perceptual hash
  }

  /**
   * Validate upload request
   */
  private validateUpload(dto: UploadMediaDto) {
    // Validate file size
    if (dto.fileSize) {
      let maxSize: number;
      switch (dto.kind) {
        case MediaKind.IMAGE:
          maxSize = this.MAX_IMAGE_SIZE;
          break;
        case MediaKind.VIDEO:
          maxSize = this.MAX_VIDEO_SIZE;
          break;
        case MediaKind.MODEL_3D:
          maxSize = this.MAX_3D_SIZE;
          break;
        default:
          throw new BadRequestException('Invalid media kind');
      }

      if (dto.fileSize > maxSize) {
        throw new BadRequestException(
          `File size exceeds maximum allowed (${maxSize} bytes for ${dto.kind})`,
        );
      }
    }

    // Validate MIME type
    if (dto.mimeType) {
      let allowedTypes: string[];
      switch (dto.kind) {
        case MediaKind.IMAGE:
          allowedTypes = this.ALLOWED_IMAGE_TYPES;
          break;
        case MediaKind.VIDEO:
          allowedTypes = this.ALLOWED_VIDEO_TYPES;
          break;
        case MediaKind.MODEL_3D:
          allowedTypes = this.ALLOWED_3D_TYPES;
          break;
        default:
          throw new BadRequestException('Invalid media kind');
      }

      if (!allowedTypes.includes(dto.mimeType)) {
        throw new BadRequestException(
          `Invalid MIME type for ${dto.kind}. Allowed: ${allowedTypes.join(', ')}`,
        );
      }
    }
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
      uri: undefined, // Note: schema doesn't have 'uri' field - use rawKey or renditions
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
