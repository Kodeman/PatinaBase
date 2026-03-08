import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, AssetStatus, AssetKind, JobType } from '../../generated/prisma-client';
import { OCIStorageService } from '../storage/oci-storage.service';
import { CDNManagerService } from '../storage/cdn/cdn-manager.service';
import { JobQueueService } from '../jobs/job-queue.service';
import {
  BulkUpdateAssetsDto,
  BulkDeleteAssetsDto,
  MoveAssetsDto,
  CopyAssetsDto,
  ReorderAssetsDto,
  UpdateAssetDto,
  PurgeCdnDto,
} from './dto';

export interface BulkOperationResult {
  success: number;
  failed: number;
  errors: Array<{ assetId: string; error: string }>;
  jobId?: string;
}

export interface DeleteResult {
  deletedAssets: number;
  deletedRenditions: number;
  cdnPurged: boolean;
  jobId?: string;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private prisma: PrismaClient,
    private storage: OCIStorageService,
    private cdn: CDNManagerService,
    private jobQueue: JobQueueService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get asset by ID
   */
  async getAsset(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        renditions: true,
        threeD: true,
      },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }

    return asset;
  }

  /**
   * Update single asset
   */
  async updateAsset(id: string, updates: UpdateAssetDto) {
    const asset = await this.prisma.mediaAsset.update({
      where: { id },
      data: updates,
    });

    this.eventEmitter.emit('media.asset.updated', { assetId: id, updates });

    return asset;
  }

  /**
   * Delete single asset
   */
  async deleteAsset(
    id: string,
    softDelete = true,
    purgeCdn = true,
  ): Promise<DeleteResult> {
    const asset = await this.getAsset(id);

    if (softDelete) {
      // Soft delete: update status
      await this.prisma.mediaAsset.update({
        where: { id },
        data: {
          status: AssetStatus.BLOCKED,
          updatedAt: new Date(),
        },
      });

      if (purgeCdn) {
        await this.purgeCdnForAssets([id]);
      }

      this.eventEmitter.emit('media.asset.deleted', {
        assetId: id,
        softDelete: true,
      });

      return {
        deletedAssets: 1,
        deletedRenditions: 0,
        cdnPurged: purgeCdn,
      };
    } else {
      // Hard delete: remove from storage and database
      const jobId = await this.jobQueue.addJob({
        assetId: id,
        type: 'ASSET_DELETE' as JobType,
        meta: { hardDelete: true, purgeCdn },
      });

      return {
        deletedAssets: 0,
        deletedRenditions: 0,
        cdnPurged: false,
        jobId,
      };
    }
  }

  /**
   * Bulk update assets
   */
  async bulkUpdateAssets(dto: BulkUpdateAssetsDto): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Validate all assets exist
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: dto.assetIds } },
      select: { id: true },
    });

    const foundIds = new Set(assets.map((a) => a.id));
    const missingIds = dto.assetIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      result.errors.push(
        ...missingIds.map((id) => ({
          assetId: id,
          error: 'Asset not found',
        })),
      );
      result.failed = missingIds.length;
    }

    // Perform bulk update
    try {
      const updated = await this.prisma.mediaAsset.updateMany({
        where: { id: { in: Array.from(foundIds) } },
        data: dto.updates,
      });

      result.success = updated.count;

      this.eventEmitter.emit('media.assets.bulk_updated', {
        assetIds: Array.from(foundIds),
        updates: dto.updates,
        count: updated.count,
      });

      this.logger.log(`Bulk updated ${updated.count} assets`);
    } catch (error) {
      this.logger.error(`Bulk update failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Bulk update failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Bulk delete assets
   */
  async bulkDeleteAssets(dto: BulkDeleteAssetsDto): Promise<DeleteResult> {
    const { assetIds, softDelete = true, purgeCdn = true } = dto;

    // Validate assets exist
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true },
    });

    if (assets.length === 0) {
      throw new NotFoundException('No assets found to delete');
    }

    const foundIds = assets.map((a) => a.id);

    if (softDelete) {
      // Soft delete
      const updated = await this.prisma.mediaAsset.updateMany({
        where: { id: { in: foundIds } },
        data: {
          status: AssetStatus.BLOCKED,
          updatedAt: new Date(),
        },
      });

      if (purgeCdn) {
        await this.purgeCdnForAssets(foundIds);
      }

      this.eventEmitter.emit('media.assets.bulk_deleted', {
        assetIds: foundIds,
        count: updated.count,
        softDelete: true,
      });

      this.logger.log(`Soft deleted ${updated.count} assets`);

      return {
        deletedAssets: updated.count,
        deletedRenditions: 0,
        cdnPurged: purgeCdn,
      };
    } else {
      // Hard delete via background job for large operations
      if (foundIds.length > 10) {
        const jobId = await this.jobQueue.addJob({
          assetId: foundIds[0], // Use first ID as reference
          type: 'BULK_DELETE' as JobType,
          meta: { assetIds: foundIds, hardDelete: true, purgeCdn },
        });

        this.logger.log(`Queued bulk hard delete job ${jobId} for ${foundIds.length} assets`);

        return {
          deletedAssets: 0,
          deletedRenditions: 0,
          cdnPurged: false,
          jobId,
        };
      } else {
        // Small batch - delete immediately
        return await this.hardDeleteAssets(foundIds, purgeCdn);
      }
    }
  }

  /**
   * Move assets to different product/variant
   */
  async moveAssets(dto: MoveAssetsDto): Promise<BulkOperationResult> {
    const { assetIds, fromProductId, toProductId, toVariantId, preserveOrder = true } = dto;

    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Validate assets exist
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      orderBy: preserveOrder ? { sortOrder: 'asc' } : undefined,
    });

    if (assets.length === 0) {
      throw new NotFoundException('No assets found to move');
    }

    // Validate source product if specified
    if (fromProductId) {
      const invalidAssets = assets.filter((a) => a.productId !== fromProductId);
      if (invalidAssets.length > 0) {
        throw new BadRequestException(
          `Assets do not belong to product ${fromProductId}: ${invalidAssets.map((a) => a.id).join(', ')}`,
        );
      }
    }

    // Update assets in transaction
    try {
      await this.prisma.$transaction(
        assets.map((asset, index) =>
          this.prisma.mediaAsset.update({
            where: { id: asset.id },
            data: {
              productId: toProductId,
              variantId: toVariantId || null,
              sortOrder: preserveOrder ? asset.sortOrder : index,
              updatedAt: new Date(),
            },
          }),
        ),
      );

      result.success = assets.length;

      this.eventEmitter.emit('media.assets.moved', {
        assetIds: assets.map((a) => a.id),
        fromProductId,
        toProductId,
        toVariantId,
        count: assets.length,
      });

      this.logger.log(`Moved ${assets.length} assets from ${fromProductId} to ${toProductId}`);
    } catch (error) {
      this.logger.error(`Move operation failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Move operation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Copy assets to different product/variant
   */
  async copyAssets(dto: CopyAssetsDto): Promise<BulkOperationResult> {
    const {
      assetIds,
      toProductId,
      toVariantId,
      copyFiles = false,
      copyRenditions = true,
    } = dto;

    // For large copy operations, use background job
    if (assetIds.length > 5 || copyFiles) {
      const jobId = await this.jobQueue.addJob({
        assetId: assetIds[0],
        type: 'BULK_COPY' as JobType,
        meta: { assetIds, toProductId, toVariantId, copyFiles, copyRenditions },
      });

      this.logger.log(`Queued bulk copy job ${jobId} for ${assetIds.length} assets`);

      return {
        success: 0,
        failed: 0,
        errors: [],
        jobId,
      };
    }

    // Small batch - copy immediately
    return await this.copyAssetsSync(assetIds, toProductId, toVariantId, copyFiles, copyRenditions);
  }

  /**
   * Reorder assets for a product
   */
  async reorderAssets(productId: string, dto: ReorderAssetsDto): Promise<BulkOperationResult> {
    const { assetIds } = dto;

    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Validate all assets belong to the product
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        id: { in: assetIds },
        productId,
      },
    });

    if (assets.length !== assetIds.length) {
      const foundIds = new Set(assets.map((a) => a.id));
      const missingIds = assetIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Assets not found or don't belong to product ${productId}: ${missingIds.join(', ')}`,
      );
    }

    // Update sort order in transaction
    try {
      await this.prisma.$transaction(
        assetIds.map((id, index) =>
          this.prisma.mediaAsset.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      );

      result.success = assetIds.length;

      this.eventEmitter.emit('media.assets.reordered', {
        productId,
        assetIds,
        count: assetIds.length,
      });

      this.logger.log(`Reordered ${assetIds.length} assets for product ${productId}`);
    } catch (error) {
      this.logger.error(`Reorder operation failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Reorder operation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Purge CDN cache
   */
  async purgeCdn(dto: PurgeCdnDto): Promise<{ invalidationId: string; purgedPaths: string[] }> {
    const purgedPaths: string[] = [];

    if (dto.purgeAll) {
      this.logger.warn('Purging entire CDN cache');
      const result = await this.cdn.purgeCache({ purgeAll: true });
      return { invalidationId: result.invalidationId, purgedPaths: ['*'] };
    }

    // Purge by product ID
    if (dto.productId) {
      const assets = await this.prisma.mediaAsset.findMany({
        where: { productId: dto.productId },
        include: { renditions: dto.includeRenditions },
      });

      for (const asset of assets) {
        purgedPaths.push(asset.rawKey);
        if (dto.includeRenditions && asset.renditions) {
          purgedPaths.push(...asset.renditions.map((r) => r.key));
        }
      }
    }

    // Purge by asset IDs
    if (dto.assetIds && dto.assetIds.length > 0) {
      const assets = await this.prisma.mediaAsset.findMany({
        where: { id: { in: dto.assetIds } },
        include: { renditions: dto.includeRenditions },
      });

      for (const asset of assets) {
        purgedPaths.push(asset.rawKey);
        if (dto.includeRenditions && asset.renditions) {
          purgedPaths.push(...asset.renditions.map((r) => r.key));
        }
      }
    }

    // Purge custom paths
    if (dto.paths && dto.paths.length > 0) {
      purgedPaths.push(...dto.paths);
    }

    if (purgedPaths.length === 0) {
      throw new BadRequestException('No paths specified for CDN purge');
    }

    this.logger.log(`Purging ${purgedPaths.length} paths from CDN`);

    const result = await this.cdn.purgeCachePaths(purgedPaths);

    this.eventEmitter.emit('media.cdn.purged', {
      invalidationId: result.invalidationId,
      pathCount: purgedPaths.length,
    });

    return { invalidationId: result.invalidationId, purgedPaths };
  }

  /**
   * Private: Hard delete assets from storage and database
   */
  private async hardDeleteAssets(assetIds: string[], purgeCdn: boolean): Promise<DeleteResult> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      include: { renditions: true },
    });

    let deletedRenditions = 0;

    // Delete from storage
    for (const asset of assets) {
      try {
        // Delete raw file
        await this.storage.deleteObject(
          this.getBucketName(asset.kind),
          asset.rawKey,
        );

        // Delete renditions
        if (asset.renditions) {
          for (const rendition of asset.renditions) {
            await this.storage.deleteObject(
              this.getBucketName(asset.kind),
              rendition.key,
            );
            deletedRenditions++;
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to delete asset ${asset.id} from storage: ${error.message}`,
        );
      }
    }

    // Delete from database (cascades to renditions)
    await this.prisma.mediaAsset.deleteMany({
      where: { id: { in: assetIds } },
    });

    if (purgeCdn) {
      await this.purgeCdnForAssets(assetIds);
    }

    this.eventEmitter.emit('media.assets.hard_deleted', {
      assetIds,
      count: assets.length,
    });

    this.logger.log(`Hard deleted ${assets.length} assets`);

    return {
      deletedAssets: assets.length,
      deletedRenditions,
      cdnPurged: purgeCdn,
    };
  }

  /**
   * Private: Copy assets synchronously
   */
  private async copyAssetsSync(
    assetIds: string[],
    toProductId: string,
    toVariantId: string | undefined,
    copyFiles: boolean,
    copyRenditions: boolean,
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      include: { renditions: copyRenditions },
    });

    for (const asset of assets) {
      try {
        const newAssetId = this.generateUUID();

        // Copy or reference file
        let newRawKey = asset.rawKey;
        if (copyFiles) {
          newRawKey = this.storage.generateObjectKey(newAssetId, this.toStorageKind(asset.kind), 'copy');
          await this.storage.copyObject(
            this.getBucketName(asset.kind),
            asset.rawKey,
            this.getBucketName(asset.kind),
            newRawKey,
          );
        }

        // Create new asset record
        const newAsset = await this.prisma.mediaAsset.create({
          data: {
            id: newAssetId,
            kind: asset.kind,
            productId: toProductId,
            variantId: toVariantId,
            role: asset.role,
            rawKey: newRawKey,
            processed: asset.processed,
            status: asset.status,
            width: asset.width,
            height: asset.height,
            format: asset.format,
            sizeBytes: asset.sizeBytes,
            mimeType: asset.mimeType,
            phash: asset.phash,
            palette: asset.palette || undefined,
            blurhash: asset.blurhash,
            tags: asset.tags,
            isPublic: asset.isPublic,
          },
        });

        // Copy renditions if requested
        if (copyRenditions && asset.renditions) {
          for (const rendition of asset.renditions) {
            let newRenditionKey = rendition.key;
            if (copyFiles) {
              newRenditionKey = this.storage.generateRenditionKey(
                newAssetId,
                rendition.width || 0,
                rendition.height || 0,
                rendition.format,
              );
              await this.storage.copyObject(
                this.getBucketName(asset.kind),
                rendition.key,
                this.getBucketName(asset.kind),
                newRenditionKey,
              );
            }

            await this.prisma.assetRendition.create({
              data: {
                assetId: newAsset.id,
                key: newRenditionKey,
                width: rendition.width,
                height: rendition.height,
                format: rendition.format,
                sizeBytes: rendition.sizeBytes,
                purpose: rendition.purpose,
                transform: rendition.transform || undefined,
              },
            });
          }
        }

        result.success++;
      } catch (error) {
        this.logger.error(`Failed to copy asset ${asset.id}: ${error.message}`);
        result.failed++;
        result.errors.push({ assetId: asset.id, error: error.message });
      }
    }

    this.eventEmitter.emit('media.assets.copied', {
      sourceIds: assetIds,
      toProductId,
      count: result.success,
    });

    this.logger.log(`Copied ${result.success} assets to product ${toProductId}`);

    return result;
  }

  /**
   * Private: Purge CDN for specific assets
   */
  private async purgeCdnForAssets(assetIds: string[]): Promise<void> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      include: { renditions: true },
    });

    const paths: string[] = [];
    for (const asset of assets) {
      paths.push(asset.rawKey);
      if (asset.renditions) {
        paths.push(...asset.renditions.map((r) => r.key));
      }
    }

    if (paths.length > 0) {
      await this.cdn.purgeCachePaths(paths);
    }
  }

  /**
   * Private: Get bucket name based on asset kind
   */
  private getBucketName(kind: AssetKind): string {
    // Use environment variable or default
    return process.env.OCI_BUCKET_MEDIA || 'patina-media';
  }

  /**
   * Private: Convert AssetKind to storage kind format
   */
  private toStorageKind(kind: AssetKind): 'image' | '3d' {
    return kind === 'IMAGE' ? 'image' : '3d';
  }

  /**
   * Private: Generate UUID
   */
  private generateUUID(): string {
    return crypto.randomUUID();
  }
}
