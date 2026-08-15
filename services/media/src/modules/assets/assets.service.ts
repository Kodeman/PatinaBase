import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AssetKind,
  AssetStatus,
  JobType,
  Prisma,
  PrismaClient,
} from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { JobQueueService } from '../jobs/job-queue.service';
import { CDNManagerService } from '../storage/cdn/cdn-manager.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import {
  BulkDeleteAssetsDto,
  BulkUpdateAssetsDto,
  CopyAssetsDto,
  MoveAssetsDto,
  PurgeCdnDto,
  ReorderAssetsDto,
  UpdateAssetDto,
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

interface AssetSearch {
  productId?: string;
  variantId?: string;
  kind?: string;
  role?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: OCIStorageService,
    private readonly cdn: CDNManagerService,
    private readonly jobQueue: JobQueueService,
    private readonly eventEmitter: EventEmitter2,
    private readonly authorization: MediaAuthorizationResolver,
  ) {}

  async getAsset(subject: string, id: string) {
    return this.authorization.withAssetScope(subject, 'read', (transaction, scope) =>
      this.authorization.requireAsset(transaction, scope, id, {
        renditions: true,
        threeD: true,
      }),
    );
  }

  async getRenditions(subject: string, id: string) {
    return this.authorization.withAssetScope(subject, 'read', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, id);
      const renditions = await transaction.assetRendition.findMany({
        where: { assetId: asset.id },
        orderBy: { width: 'asc' },
      });
      return { data: renditions, count: renditions.length };
    });
  }

  async searchAssets(subject: string, query: AssetSearch) {
    return this.authorization.withAssetScope(subject, 'read', async (transaction, scope) => {
      if (query.cursor) {
        await this.authorization.requireAsset(transaction, scope, query.cursor);
      }
      const where: Prisma.MediaAssetWhereInput = {};
      if (query.productId) where.productId = query.productId;
      if (query.variantId) where.variantId = query.variantId;
      if (query.kind) where.kind = this.enumValue(AssetKind, query.kind, 'kind');
      if (query.role) where.role = query.role as any;
      if (query.status) where.status = this.enumValue(AssetStatus, query.status, 'status');
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const assets = await transaction.mediaAsset.findMany({
        where: this.authorization.scopedWhere(scope, where),
        take: limit + 1,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        skip: query.cursor ? 1 : undefined,
        orderBy: { createdAt: 'desc' },
        include: { renditions: { take: 3 }, threeD: true },
      });
      const hasMore = assets.length > limit;
      const data = assets.slice(0, limit);
      return {
        data,
        meta: {
          count: data.length,
          nextCursor: hasMore ? (data[data.length - 1]?.id ?? null) : null,
          hasMore,
        },
      };
    });
  }

  async updateAsset(subject: string, id: string, updates: UpdateAssetDto) {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, id);
      const productId = updates.productId === undefined ? asset.productId : updates.productId;
      const variantId = updates.variantId === undefined ? asset.variantId : updates.variantId;
      if (updates.productId !== undefined || updates.variantId !== undefined) {
        await this.authorization.requireProduct(transaction, scope, productId, variantId);
      }
      const updated = await transaction.mediaAsset.update({
        where: { id: asset.id },
        data: updates,
      });
      this.eventEmitter.emit('media.asset.updated', { actor: subject, assetId: asset.id });
      return updated;
    });
  }

  async deleteAsset(
    subject: string,
    id: string,
    softDelete = true,
    purgeCdn = true,
  ): Promise<DeleteResult> {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, id, {
        renditions: true,
      });
      const renditions = (asset.renditions ?? []) as Array<{ key: string }>;
      if (softDelete) {
        await transaction.mediaAsset.update({
          where: { id: asset.id },
          data: { status: AssetStatus.BLOCKED },
        });
      } else {
        await this.storage.deleteObject(this.bucketName(), asset.rawKey);
        for (const rendition of renditions) {
          await this.storage.deleteObject(this.bucketName(), rendition.key);
        }
        await transaction.mediaAsset.delete({ where: { id: asset.id } });
      }
      if (purgeCdn) {
        await this.cdn.purgeCachePaths([asset.rawKey, ...renditions.map((item) => item.key)]);
      }
      this.eventEmitter.emit('media.asset.deleted', {
        actor: subject,
        assetId: asset.id,
        softDelete,
      });
      return {
        deletedAssets: 1,
        deletedRenditions: softDelete ? 0 : renditions.length,
        cdnPurged: purgeCdn,
      };
    });
  }

  async bulkUpdateAssets(subject: string, dto: BulkUpdateAssetsDto): Promise<BulkOperationResult> {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const ids = await this.authorization.requireAssets(transaction, scope, dto.assetIds);
      if (dto.updates.productId !== undefined || dto.updates.variantId !== undefined) {
        await this.authorization.requireProduct(
          transaction,
          scope,
          dto.updates.productId,
          dto.updates.variantId,
        );
      }
      const updated = await transaction.mediaAsset.updateMany({
        where: this.authorization.scopedWhere(scope, { id: { in: ids } }),
        data: dto.updates,
      });
      this.eventEmitter.emit('media.assets.bulk_updated', {
        actor: subject,
        count: updated.count,
      });
      return { success: updated.count, failed: 0, errors: [] };
    });
  }

  async bulkDeleteAssets(subject: string, dto: BulkDeleteAssetsDto): Promise<DeleteResult> {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const ids = await this.authorization.requireAssets(transaction, scope, dto.assetIds);
      const assets = await transaction.mediaAsset.findMany({
        where: this.authorization.scopedWhere(scope, { id: { in: ids } }),
        include: { renditions: true },
      });
      if (dto.softDelete !== false) {
        const updated = await transaction.mediaAsset.updateMany({
          where: this.authorization.scopedWhere(scope, { id: { in: ids } }),
          data: { status: AssetStatus.BLOCKED },
        });
        if (dto.purgeCdn !== false) {
          await this.cdn.purgeCachePaths(this.storageKeys(assets));
        }
        return {
          deletedAssets: updated.count,
          deletedRenditions: 0,
          cdnPurged: dto.purgeCdn !== false,
        };
      }
      for (const asset of assets) {
        await this.storage.deleteObject(this.bucketName(), asset.rawKey);
        for (const rendition of asset.renditions) {
          await this.storage.deleteObject(this.bucketName(), rendition.key);
        }
      }
      const renditionCount = assets.reduce((total, asset) => total + asset.renditions.length, 0);
      const deleted = await transaction.mediaAsset.deleteMany({
        where: this.authorization.scopedWhere(scope, { id: { in: ids } }),
      });
      if (dto.purgeCdn !== false) await this.cdn.purgeCachePaths(this.storageKeys(assets));
      this.eventEmitter.emit('media.assets.bulk_deleted', {
        actor: subject,
        count: deleted.count,
      });
      return {
        deletedAssets: deleted.count,
        deletedRenditions: renditionCount,
        cdnPurged: dto.purgeCdn !== false,
      };
    });
  }

  async moveAssets(subject: string, dto: MoveAssetsDto): Promise<BulkOperationResult> {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const ids = await this.authorization.requireAssets(transaction, scope, dto.assetIds);
      await this.authorization.requireProduct(transaction, scope, dto.toProductId, dto.toVariantId);
      const assets = await transaction.mediaAsset.findMany({
        where: this.authorization.scopedWhere(scope, { id: { in: ids } }),
        orderBy: dto.preserveOrder === false ? undefined : { sortOrder: 'asc' },
      });
      if (dto.fromProductId && assets.some((asset) => asset.productId !== dto.fromProductId)) {
        throw this.authorization.notFound();
      }
      for (const [index, asset] of assets.entries()) {
        await transaction.mediaAsset.update({
          where: { id: asset.id },
          data: {
            productId: dto.toProductId,
            variantId: dto.toVariantId ?? null,
            sortOrder: dto.preserveOrder === false ? index : asset.sortOrder,
          },
        });
      }
      this.eventEmitter.emit('media.assets.moved', { actor: subject, count: assets.length });
      return { success: assets.length, failed: 0, errors: [] };
    });
  }

  async copyAssets(subject: string, dto: CopyAssetsDto): Promise<BulkOperationResult> {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const ids = await this.authorization.requireAssets(transaction, scope, dto.assetIds);
      await this.authorization.requireProduct(transaction, scope, dto.toProductId, dto.toVariantId);
      const assets = await transaction.mediaAsset.findMany({
        where: this.authorization.scopedWhere(scope, { id: { in: ids } }),
        include: { renditions: dto.copyRenditions !== false },
      });
      let copied = 0;
      for (const asset of assets) {
        const id = crypto.randomUUID();
        const rawKey = this.storage.generateObjectKey(
          id,
          asset.kind === AssetKind.IMAGE ? 'image' : '3d',
          asset.rawKey.split('/').pop() ?? 'copy',
        );
        await this.storage.copyObject(this.bucketName(), asset.rawKey, this.bucketName(), rawKey);
        const created = await transaction.mediaAsset.create({
          data: {
            kind: asset.kind,
            productId: dto.toProductId,
            variantId: dto.toVariantId,
            role: asset.role,
            rawKey,
            processed: asset.processed,
            status: asset.status,
            width: asset.width,
            height: asset.height,
            format: asset.format,
            sizeBytes: asset.sizeBytes,
            mimeType: asset.mimeType,
            license: asset.license ?? undefined,
            tags: asset.tags,
            uploadedBy: subject,
          },
        });
        if (dto.copyRenditions !== false) {
          for (const rendition of asset.renditions) {
            const key = rendition.key.replace(asset.id, created.id);
            await this.storage.copyObject(this.bucketName(), rendition.key, this.bucketName(), key);
            await transaction.assetRendition.create({
              data: {
                assetId: created.id,
                key,
                width: rendition.width,
                height: rendition.height,
                format: rendition.format,
                sizeBytes: rendition.sizeBytes,
                purpose: rendition.purpose,
                transform: rendition.transform ?? undefined,
              },
            });
          }
        }
        copied += 1;
      }
      this.eventEmitter.emit('media.assets.copied', { actor: subject, count: copied });
      return { success: copied, failed: 0, errors: [] };
    });
  }

  async reorderAssets(
    subject: string,
    productId: string,
    dto: ReorderAssetsDto,
  ): Promise<BulkOperationResult> {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      await this.authorization.requireProduct(transaction, scope, productId);
      const ids = await this.authorization.requireAssets(transaction, scope, dto.assetIds);
      const count = await transaction.mediaAsset.count({
        where: this.authorization.scopedWhere(scope, {
          id: { in: ids },
          productId,
        }),
      });
      if (count !== ids.length) throw this.authorization.notFound();
      for (const [index, id] of ids.entries()) {
        await transaction.mediaAsset.update({ where: { id }, data: { sortOrder: index } });
      }
      this.eventEmitter.emit('media.assets.reordered', { actor: subject, count: ids.length });
      return { success: ids.length, failed: 0, errors: [] };
    });
  }

  async purgeCdn(subject: string, dto: PurgeCdnDto) {
    return this.authorization.withAdmin(subject, async (transaction) => {
      if (dto.purgeAll) {
        const result = await this.cdn.purgeCache({ purgeAll: true });
        return { invalidationId: result.invalidationId, purgedPaths: ['*'] };
      }
      const paths = [...(dto.paths ?? [])];
      const filters: Prisma.MediaAssetWhereInput[] = [];
      if (dto.productId) filters.push({ productId: dto.productId });
      if (dto.assetIds?.length) filters.push({ id: { in: dto.assetIds } });
      if (filters.length) {
        const assets = await transaction.mediaAsset.findMany({
          where: { OR: filters },
          include: { renditions: dto.includeRenditions !== false },
        });
        paths.push(...this.storageKeys(assets));
      }
      const uniquePaths = [...new Set(paths)];
      if (!uniquePaths.length) throw new BadRequestException('No CDN targets specified');
      const result = await this.cdn.purgeCachePaths(uniquePaths);
      return { invalidationId: result.invalidationId, purgedPaths: uniquePaths };
    });
  }

  async reprocessAsset(subject: string, id: string) {
    return this.authorization.withAssetScope(subject, 'manage', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, id);
      const jobId = await this.jobQueue.addJob(
        {
          assetId: asset.id,
          type: JobType.IMAGE_PROCESS,
          meta: { rawKey: asset.rawKey, operations: [{ type: 'generate_renditions' }] },
        },
        transaction,
      );
      return { message: 'Asset queued for reprocessing', jobId, assetId: asset.id };
    });
  }

  async get3DPreview(subject: string, assetId: string) {
    return this.authorization.withAssetScope(subject, 'read', async (transaction, scope) => {
      const asset = await this.authorization.requireAsset(transaction, scope, assetId, {
        threeD: true,
      });
      const threeD = asset.threeD as any;
      if (!threeD) throw this.authorization.notFound();
      return {
        assetId: asset.id,
        dimensions: {
          width: threeD.widthM,
          height: threeD.heightM,
          depth: threeD.depthM,
          volume: threeD.volumeM3,
        },
        geometry: {
          triangles: threeD.triCount,
          nodes: threeD.nodeCount,
          materials: threeD.materialCount,
          textures: threeD.textureCount,
        },
        snapshots: threeD.snapshots,
        arReady: threeD.arReady,
        lods: threeD.lods,
        files: { glb: threeD.glbKey, usdz: threeD.usdzKey },
      };
    });
  }

  private storageKeys(
    assets: Array<{ rawKey: string; renditions: Array<{ key: string }> }>,
  ): string[] {
    return assets.flatMap((asset) => [asset.rawKey, ...asset.renditions.map((item) => item.key)]);
  }

  private bucketName(): string {
    return process.env.OCI_BUCKET_MEDIA ?? process.env.OCI_BUCKET_RAW ?? 'patina-media';
  }

  private enumValue<T extends Record<string, string>>(
    values: T,
    supplied: string,
    field: string,
  ): T[keyof T] {
    const value = supplied.toUpperCase();
    if (!Object.values(values).includes(value)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return value as T[keyof T];
  }
}
