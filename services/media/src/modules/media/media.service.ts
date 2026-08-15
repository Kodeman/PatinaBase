import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import {
  AssetKind,
  AssetRole,
  AssetStatus,
  JobType,
  Prisma,
  PrismaClient,
} from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { JobQueueService } from '../jobs/job-queue.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import { UploadService } from '../upload/upload.service';
import {
  BatchProcessMediaDto,
  BatchUploadMediaDto,
  MediaKind,
  MediaListResponseDto,
  MediaQueryDto,
  MediaResponseDto,
  ProcessingPriority,
  ProcessMediaDto,
  SortBy,
  SortOrder,
  UpdateMediaMetadataDto,
  UploadMediaDto,
} from './dto';

@Injectable()
export class MediaService {
  private readonly MAX_IMAGE_SIZE = 50 * 1024 * 1024;
  private readonly MAX_VIDEO_SIZE = 500 * 1024 * 1024;
  private readonly MAX_3D_SIZE = 500 * 1024 * 1024;

  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/heic',
  ];
  private readonly ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
  private readonly ALLOWED_3D_TYPES = [
    'model/gltf-binary',
    'model/gltf+json',
    'model/vnd.usdz+zip',
    'application/octet-stream',
  ];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly ociStorage: OCIStorageService,
    private readonly uploadService: UploadService,
    private readonly jobQueue: JobQueueService,
    private readonly authorization: MediaAuthorizationResolver,
  ) {}

  async uploadSingle(subject: string, dto: UploadMediaDto) {
    this.validateUpload(dto);
    const uploadIntent = await this.uploadService.createUploadIntent(
      subject,
      {
        kind: this.toAssetKind(dto.kind),
        filename: dto.filename,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        productId: dto.productId,
        variantId: dto.variantId,
        role: dto.role ? this.toAssetRole(dto.role) : undefined,
      },
      randomUUID(),
    );

    await this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      await this.authorization.requireAsset(transaction, scope, uploadIntent.assetId);
      const license: Record<string, string> = {};
      if (dto.licenseType) license.licenseType = dto.licenseType;
      if (dto.attribution) license.attribution = dto.attribution;
      await transaction.mediaAsset.update({
        where: { id: uploadIntent.assetId },
        data: {
          tags: dto.tags ?? [],
          isPublic: dto.isPublic ?? false,
          license: Object.keys(license).length > 0 ? license : undefined,
        },
      });
    });

    return {
      assetId: uploadIntent.assetId,
      uploadSessionId: uploadIntent.uploadSessionId,
      uploadUrl: uploadIntent.parUrl,
      expiresAt: uploadIntent.expiresAt,
    };
  }

  async uploadBatch(subject: string, dto: BatchUploadMediaDto) {
    const results = [];
    for (const upload of dto.uploads) {
      results.push(await this.uploadSingle(subject, upload));
    }
    return { total: results.length, successful: results.length, failed: 0, results };
  }

  async processMedia(subject: string, dto: ProcessMediaDto) {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, dto.assetId);
      if (asset.status === AssetStatus.PROCESSING && !dto.forceReprocess) {
        throw new BadRequestException('Media object is already being processed');
      }
      await transaction.mediaAsset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.PROCESSING },
      });
      const jobId = await this.jobQueue.addJob(
        {
          assetId: asset.id,
          type: JobType.IMAGE_PROCESS,
          priority: this.getPriority(dto.priority),
          meta: {
            rawKey: asset.rawKey,
            operations: this.buildOperationsFromOptions(dto.options),
          },
        },
        transaction,
      );
      return { assetId: asset.id, jobId, status: 'processing' };
    });
  }

  async processBatch(subject: string, dto: BatchProcessMediaDto) {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const ids = await this.authorization.requireAssets(transaction, scope, dto.assetIds);
      const assets = await transaction.mediaAsset.findMany({
        where: this.authorization.scopedWhere(scope, { id: { in: ids } }),
      });
      for (const asset of assets) {
        if (asset.status === AssetStatus.PROCESSING) {
          throw new BadRequestException('One or more media objects are already processing');
        }
      }
      await transaction.mediaAsset.updateMany({
        where: this.authorization.scopedWhere(scope, { id: { in: ids } }),
        data: { status: AssetStatus.PROCESSING },
      });
      for (const asset of assets) {
        await this.jobQueue.addJob(
          {
            assetId: asset.id,
            type: JobType.IMAGE_PROCESS,
            priority: this.getPriority(dto.priority),
            meta: {
              rawKey: asset.rawKey,
              operations: this.buildOperationsFromOptions(dto.options),
            },
          },
          transaction,
        );
      }
      return { total: ids.length, queued: ids.length, failed: 0 };
    });
  }

  async getById(
    subject: string,
    assetId: string,
    incrementViewCount = false,
  ): Promise<MediaResponseDto> {
    return this.authorization.withAssetScope(subject, 'read', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, assetId);
      if (incrementViewCount) {
        await transaction.mediaAsset.update({
          where: { id: asset.id },
          data: { viewCount: { increment: 1 } },
        });
        asset.viewCount += 1;
      }
      return this.transformToDto(asset);
    });
  }

  async getDownloadUrl(subject: string, assetId: string) {
    return this.authorization.withAssetScope(subject, 'read', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, assetId);
      await transaction.mediaAsset.update({
        where: { id: asset.id },
        data: { downloadCount: { increment: 1 } },
      });
      return {
        assetId: asset.id,
        downloadUrl: asset.rawKey,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };
    });
  }

  async search(subject: string, query: MediaQueryDto): Promise<MediaListResponseDto> {
    return this.authorization.withAssetScope(subject, 'read', async (transaction, scope) => {
      if (query.uploadedBy && !scope.admin && query.uploadedBy !== subject) {
        throw new BadRequestException('Uploader filter must match authenticated identity');
      }
      const page = query.page ?? 1;
      const limit = Math.min(query.limit ?? 20, 100);
      const where: Prisma.MediaAssetWhereInput = {};
      if (query.kind) where.kind = this.toAssetKind(query.kind);
      if (query.productId) where.productId = query.productId;
      if (query.variantId) where.variantId = query.variantId;
      if (query.role) where.role = this.toAssetRole(query.role);
      if (query.status) where.status = this.toAssetStatus(query.status);
      if (query.uploadedBy) where.uploadedBy = query.uploadedBy;
      if (query.isPublic !== undefined) where.isPublic = query.isPublic;
      if (query.mimeType) where.mimeType = query.mimeType;
      if (query.processedOnly) where.processed = true;
      if (query.tags?.length) where.tags = { hasSome: query.tags };
      if (query.minSize !== undefined || query.maxSize !== undefined) {
        where.sizeBytes = {
          gte: query.minSize,
          lte: query.maxSize,
        };
      }
      if (query.search) {
        where.OR = [
          { rawKey: { contains: query.search, mode: 'insensitive' } },
          { tags: { has: query.search } },
        ];
      }
      const scopedWhere = this.authorization.scopedWhere(scope, where);
      const orderBy: Prisma.MediaAssetOrderByWithRelationInput = {
        [query.sortBy ?? SortBy.CREATED_AT]: query.sortOrder ?? SortOrder.DESC,
      };
      const assets = await transaction.mediaAsset.findMany({
        where: scopedWhere,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      });
      const total = await transaction.mediaAsset.count({ where: scopedWhere });
      return {
        data: assets.map((asset) => this.transformToDto(asset)),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async updateMetadata(subject: string, assetId: string, dto: UpdateMediaMetadataDto) {
    if (dto.permissions !== undefined) {
      throw new BadRequestException('Caller-provided permissions are not accepted');
    }
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, assetId);
      const data: Prisma.MediaAssetUpdateInput = {};
      if (dto.role !== undefined) data.role = this.toAssetRole(dto.role);
      if (dto.tags !== undefined) data.tags = dto.tags;
      if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;
      if (dto.width !== undefined) data.width = dto.width;
      if (dto.height !== undefined) data.height = dto.height;
      if (dto.format !== undefined) data.format = dto.format;
      if (dto.licenseType !== undefined || dto.attribution !== undefined) {
        const current = this.objectValue(asset.license);
        data.license = {
          ...current,
          ...(dto.licenseType === undefined ? {} : { licenseType: dto.licenseType }),
          ...(dto.attribution === undefined ? {} : { attribution: dto.attribution }),
        };
      }
      if (dto.meta !== undefined) {
        data.palette = { ...this.objectValue(asset.palette), ...dto.meta };
      }
      const updated = await transaction.mediaAsset.update({
        where: { id: asset.id },
        data,
      });
      this.eventEmitter.emit('media.metadata.updated', {
        actor: subject,
        assetId: asset.id,
      });
      return this.transformToDto(updated);
    });
  }

  async delete(subject: string, assetId: string, softDelete = true) {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, assetId);
      if (softDelete) {
        await transaction.mediaAsset.update({
          where: { id: asset.id },
          data: { status: AssetStatus.BLOCKED },
        });
      } else {
        try {
          if (asset.rawKey) {
            await this.ociStorage.deleteObject(
              this.config.get<string>('OCI_BUCKET_RAW') ?? '',
              asset.rawKey,
            );
          }
        } catch {
          throw new InternalServerErrorException('Media deletion failed');
        }
        await transaction.mediaAsset.delete({ where: { id: asset.id } });
      }
      this.eventEmitter.emit('media.deleted', {
        actor: subject,
        assetId: asset.id,
        softDelete,
      });
      return { success: true, assetId: asset.id, deleted: !softDelete };
    });
  }

  async getStats(subject: string, productId?: string) {
    return this.authorization.withAssetScope(subject, 'read', async (transaction, scope) => {
      const base = this.authorization.scopedWhere(scope, productId ? { productId } : undefined);
      const total = await transaction.mediaAsset.count({ where: base });
      const images = await transaction.mediaAsset.count({
        where: this.authorization.scopedWhere(scope, {
          ...(productId ? { productId } : {}),
          kind: AssetKind.IMAGE,
        }),
      });
      const models = await transaction.mediaAsset.count({
        where: this.authorization.scopedWhere(scope, {
          ...(productId ? { productId } : {}),
          kind: AssetKind.MODEL3D,
        }),
      });
      const byStatus = async (status: AssetStatus) =>
        transaction.mediaAsset.count({
          where: this.authorization.scopedWhere(scope, {
            ...(productId ? { productId } : {}),
            status,
          }),
        });
      return {
        total,
        byKind: { images, videos: 0, models },
        byStatus: {
          pending: await byStatus(AssetStatus.PENDING),
          processing: await byStatus(AssetStatus.PROCESSING),
          completed: await byStatus(AssetStatus.READY),
          failed: await byStatus(AssetStatus.FAILED),
        },
      };
    });
  }

  private buildOperationsFromOptions(options?: ProcessMediaDto['options']) {
    const operations: Array<{ type: string; params?: Record<string, unknown> }> = [];
    if (!options || options.generateThumbnails !== false) {
      operations.push({ type: 'generate_renditions' });
    }
    if (!options || options.extractMetadata !== false) {
      operations.push({ type: 'extract_metadata' });
    }
    if (options?.optimizeQuality !== undefined) {
      operations.push({ type: 'optimize', params: { quality: options.optimizeQuality } });
    }
    return operations;
  }

  private getPriority(priority?: ProcessingPriority): number {
    switch (priority) {
      case ProcessingPriority.URGENT:
        return 1;
      case ProcessingPriority.HIGH:
        return 5;
      case ProcessingPriority.LOW:
        return 20;
      default:
        return 10;
    }
  }

  private validateUpload(dto: UploadMediaDto): void {
    const maximum =
      dto.kind === MediaKind.IMAGE
        ? this.MAX_IMAGE_SIZE
        : dto.kind === MediaKind.VIDEO
          ? this.MAX_VIDEO_SIZE
          : this.MAX_3D_SIZE;
    if (dto.fileSize !== undefined && dto.fileSize > maximum) {
      throw new BadRequestException('File size exceeds the allowed maximum');
    }
    const allowed =
      dto.kind === MediaKind.IMAGE
        ? this.ALLOWED_IMAGE_TYPES
        : dto.kind === MediaKind.VIDEO
          ? this.ALLOWED_VIDEO_TYPES
          : this.ALLOWED_3D_TYPES;
    if (dto.mimeType && !allowed.includes(dto.mimeType)) {
      throw new BadRequestException('Invalid media MIME type');
    }
  }

  private toAssetKind(kind: MediaKind): AssetKind {
    if (kind === MediaKind.IMAGE) return AssetKind.IMAGE;
    if (kind === MediaKind.MODEL_3D) return AssetKind.MODEL3D;
    throw new BadRequestException('Video assets are not supported by the retained schema');
  }

  private toAssetRole(role: string): AssetRole {
    const normalized = role.replace('-', '_').toUpperCase();
    if (!Object.values(AssetRole).includes(normalized as AssetRole)) {
      throw new BadRequestException('Invalid media role');
    }
    return normalized as AssetRole;
  }

  private toAssetStatus(status: string): AssetStatus {
    const mapped = status === 'completed' ? AssetStatus.READY : status.toUpperCase();
    if (mapped === 'ARCHIVED') return AssetStatus.BLOCKED;
    if (!Object.values(AssetStatus).includes(mapped as AssetStatus)) {
      throw new BadRequestException('Invalid media status');
    }
    return mapped as AssetStatus;
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private transformToDto(asset: {
    id: string;
    kind: AssetKind;
    productId: string | null;
    variantId: string | null;
    role: AssetRole | null;
    rawKey: string;
    width: number | null;
    height: number | null;
    format: string | null;
    status: AssetStatus;
    tags: string[];
    viewCount: number;
    downloadCount: number;
    sizeBytes: number | null;
    mimeType: string | null;
    isPublic: boolean;
    uploadedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): MediaResponseDto {
    return {
      id: asset.id,
      kind: asset.kind,
      productId: asset.productId ?? undefined,
      variantId: asset.variantId ?? undefined,
      role: asset.role ?? undefined,
      rawKey: asset.rawKey,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      format: asset.format ?? undefined,
      status: asset.status,
      tags: asset.tags,
      viewCount: asset.viewCount,
      downloadCount: asset.downloadCount,
      sizeBytes: asset.sizeBytes?.toString(),
      mimeType: asset.mimeType ?? undefined,
      isPublic: asset.isPublic,
      uploadedBy: asset.uploadedBy ?? undefined,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }
}
