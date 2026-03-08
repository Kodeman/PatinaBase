import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient } from '../../generated/prisma-client';
import { OCIStorageService } from '../storage/oci-storage.service';
import { CDNManagerService } from '../storage/cdn/cdn-manager.service';
import { JobQueueService, JobResult } from './job-queue.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class BulkOperationsProcessor implements OnModuleInit {
  private readonly logger = new Logger(BulkOperationsProcessor.name);

  constructor(
    private prisma: PrismaClient,
    private storage: OCIStorageService,
    private cdn: CDNManagerService,
    private jobQueue: JobQueueService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Register workers for bulk operations
    this.jobQueue.registerWorker('ASSET_DELETE', this.processAssetDelete.bind(this), 3);
    this.jobQueue.registerWorker('BULK_DELETE', this.processBulkDelete.bind(this), 2);
    this.jobQueue.registerWorker('BULK_COPY', this.processBulkCopy.bind(this), 2);
    this.jobQueue.registerWorker('CLEANUP_ORPHANED', this.processCleanupOrphaned.bind(this), 1);

    this.logger.log('Bulk operations processor initialized');
  }

  /**
   * Process single asset deletion
   */
  private async processAssetDelete(job: Job): Promise<JobResult> {
    const { assetId, hardDelete = true, purgeCdn = true } = job.data;

    try {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: assetId },
        include: { renditions: true, threeD: true },
      });

      if (!asset) {
        return { success: false, error: 'Asset not found' };
      }

      // Delete from storage
      try {
        await this.storage.deleteObject(this.getBucketName(asset.kind), asset.rawKey);
      } catch (error) {
        this.logger.warn(`Failed to delete raw file: ${error.message}`);
      }

      // Delete renditions from storage
      if (asset.renditions) {
        for (const rendition of asset.renditions) {
          try {
            await this.storage.deleteObject(this.getBucketName(asset.kind), rendition.key);
          } catch (error) {
            this.logger.warn(`Failed to delete rendition: ${error.message}`);
          }
        }
      }

      // Delete 3D files if applicable
      if (asset.threeD) {
        if (asset.threeD.glbKey) {
          try {
            await this.storage.deleteObject(this.getBucketName(asset.kind), asset.threeD.glbKey);
          } catch (error) {
            this.logger.warn(`Failed to delete GLB file: ${error.message}`);
          }
        }
        if (asset.threeD.usdzKey) {
          try {
            await this.storage.deleteObject(this.getBucketName(asset.kind), asset.threeD.usdzKey);
          } catch (error) {
            this.logger.warn(`Failed to delete USDZ file: ${error.message}`);
          }
        }
      }

      // Delete from database (cascades to renditions and threeD)
      await this.prisma.mediaAsset.delete({
        where: { id: assetId },
      });

      // Purge from CDN
      if (purgeCdn) {
        const paths = [asset.rawKey];
        if (asset.renditions) {
          paths.push(...asset.renditions.map((r) => r.key));
        }
        await this.cdn.purgeCachePaths(paths);
      }

      this.eventEmitter.emit('media.asset.hard_deleted', { assetId });

      this.logger.log(`Hard deleted asset ${assetId}`);

      return {
        success: true,
        data: {
          assetId,
          deletedRenditions: asset.renditions?.length || 0,
          cdnPurged: purgeCdn,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to delete asset ${assetId}: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process bulk deletion
   */
  private async processBulkDelete(job: Job): Promise<JobResult> {
    const { assetIds, hardDelete = true, purgeCdn = true } = job.data;

    const results = {
      deleted: 0,
      failed: 0,
      errors: [] as Array<{ assetId: string; error: string }>,
    };

    this.logger.log(`Processing bulk delete for ${assetIds.length} assets`);

    for (const assetId of assetIds) {
      try {
        const result = await this.processAssetDelete({
          data: { assetId, hardDelete, purgeCdn },
        } as Job);

        if (result.success) {
          results.deleted++;
        } else {
          results.failed++;
          results.errors.push({ assetId, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ assetId, error: error.message });
      }

      // Report progress
      if ((results.deleted + results.failed) % 10 === 0) {
        await job.updateProgress(
          ((results.deleted + results.failed) / assetIds.length) * 100,
        );
      }
    }

    this.eventEmitter.emit('media.assets.bulk_delete_completed', results);

    this.logger.log(
      `Bulk delete completed: ${results.deleted} deleted, ${results.failed} failed`,
    );

    return {
      success: results.failed === 0,
      data: results,
      error: results.failed > 0 ? `${results.failed} assets failed to delete` : undefined,
    };
  }

  /**
   * Process bulk copy
   */
  private async processBulkCopy(job: Job): Promise<JobResult> {
    const {
      assetIds,
      toProductId,
      toVariantId,
      copyFiles = false,
      copyRenditions = true,
    } = job.data;

    const results = {
      copied: 0,
      failed: 0,
      errors: [] as Array<{ assetId: string; error: string }>,
    };

    this.logger.log(`Processing bulk copy for ${assetIds.length} assets to product ${toProductId}`);

    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      include: { renditions: copyRenditions, threeD: true },
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
            sortOrder: asset.sortOrder,
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

        // Copy 3D data if applicable
        if (asset.threeD) {
          let newGlbKey = asset.threeD.glbKey;
          let newUsdzKey = asset.threeD.usdzKey;

          if (copyFiles) {
            if (newGlbKey) {
              newGlbKey = this.storage.generate3DKey(newAssetId, 'glb');
              await this.storage.copyObject(
                this.getBucketName(asset.kind),
                asset.threeD.glbKey!,
                this.getBucketName(asset.kind),
                newGlbKey,
              );
            }
            if (newUsdzKey) {
              newUsdzKey = this.storage.generate3DKey(newAssetId, 'usdz');
              await this.storage.copyObject(
                this.getBucketName(asset.kind),
                asset.threeD.usdzKey!,
                this.getBucketName(asset.kind),
                newUsdzKey,
              );
            }
          }

          await this.prisma.threeDAsset.create({
            data: {
              assetId: newAsset.id,
              glbKey: newGlbKey,
              usdzKey: newUsdzKey,
              triCount: asset.threeD.triCount,
              nodeCount: asset.threeD.nodeCount,
              materialCount: asset.threeD.materialCount,
              textureCount: asset.threeD.textureCount,
              widthM: asset.threeD.widthM,
              heightM: asset.threeD.heightM,
              depthM: asset.threeD.depthM,
              volumeM3: asset.threeD.volumeM3,
              lods: asset.threeD.lods || undefined,
              materials: asset.threeD.materials || undefined,
              textures: asset.threeD.textures || undefined,
              arReady: asset.threeD.arReady,
              arChecks: asset.threeD.arChecks || undefined,
              snapshots: asset.threeD.snapshots || undefined,
              qcIssues: asset.threeD.qcIssues || undefined,
              drawCalls: asset.threeD.drawCalls,
              perfBudget: asset.threeD.perfBudget || undefined,
            },
          });
        }

        results.copied++;
      } catch (error) {
        this.logger.error(`Failed to copy asset ${asset.id}: ${error.message}`);
        results.failed++;
        results.errors.push({ assetId: asset.id, error: error.message });
      }

      // Report progress
      if ((results.copied + results.failed) % 5 === 0) {
        await job.updateProgress(((results.copied + results.failed) / assets.length) * 100);
      }
    }

    this.eventEmitter.emit('media.assets.bulk_copy_completed', results);

    this.logger.log(`Bulk copy completed: ${results.copied} copied, ${results.failed} failed`);

    return {
      success: results.failed === 0,
      data: results,
      error: results.failed > 0 ? `${results.failed} assets failed to copy` : undefined,
    };
  }

  /**
   * Process cleanup of orphaned files
   */
  private async processCleanupOrphaned(job: Job): Promise<JobResult> {
    this.logger.log('Starting orphaned files cleanup');

    const results = {
      checked: 0,
      deleted: 0,
      errors: [] as string[],
    };

    try {
      // Find assets marked as BLOCKED for more than 7 days
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const orphanedAssets = await this.prisma.mediaAsset.findMany({
        where: {
          status: 'BLOCKED',
          updatedAt: { lt: cutoffDate },
        },
        include: { renditions: true },
      });

      this.logger.log(`Found ${orphanedAssets.length} orphaned assets to clean up`);

      for (const asset of orphanedAssets) {
        try {
          // Delete from storage
          await this.storage.deleteObject(this.getBucketName(asset.kind), asset.rawKey);

          // Delete renditions
          if (asset.renditions) {
            for (const rendition of asset.renditions) {
              await this.storage.deleteObject(this.getBucketName(asset.kind), rendition.key);
            }
          }

          // Delete from database
          await this.prisma.mediaAsset.delete({ where: { id: asset.id } });

          results.deleted++;
        } catch (error) {
          this.logger.error(`Failed to cleanup asset ${asset.id}: ${error.message}`);
          results.errors.push(`${asset.id}: ${error.message}`);
        }

        results.checked++;
      }

      this.logger.log(
        `Orphaned files cleanup completed: ${results.deleted} deleted, ${results.errors.length} errors`,
      );

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      this.logger.error(`Orphaned files cleanup failed: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Private: Get bucket name based on asset kind
   */
  private getBucketName(kind: any): string {
    return process.env.OCI_BUCKET_MEDIA || 'patina-media';
  }

  /**
   * Private: Convert AssetKind to storage kind format
   */
  private toStorageKind(kind: any): 'image' | '3d' {
    return kind === 'IMAGE' ? 'image' : '3d';
  }

  /**
   * Private: Generate UUID
   */
  private generateUUID(): string {
    return crypto.randomUUID();
  }
}
