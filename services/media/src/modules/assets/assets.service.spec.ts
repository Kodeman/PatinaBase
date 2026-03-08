import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AssetsService } from './assets.service';
import { PrismaClient, AssetStatus, AssetKind, AssetRole, ScanStatus } from '../../generated/prisma-client';
import { OCIStorageService } from '../storage/oci-storage.service';
import { CDNManagerService } from '../storage/cdn/cdn-manager.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: PrismaClient;
  let storage: OCIStorageService;
  let cdn: CDNManagerService;
  let jobQueue: JobQueueService;
  let eventEmitter: EventEmitter2;

  const mockAsset = {
    id: 'asset-1',
    kind: 'IMAGE' as AssetKind,
    productId: 'product-1',
    variantId: null,
    role: 'HERO' as AssetRole,
    rawKey: 'raw/images/asset-1/hero.jpg',
    processed: true,
    status: 'READY' as AssetStatus,
    width: 1920,
    height: 1080,
    format: 'jpeg',
    sizeBytes: 500000,
    mimeType: 'image/jpeg',
    phash: 'abc123',
    palette: null,
    blurhash: 'L123',
    lqipKey: null,
    license: null,
    qcIssues: null,
    qcScore: 0,
    scanStatus: 'CLEAN' as ScanStatus,
    scanResult: null,
    isPublic: true,
    permissions: null,
    viewCount: 0,
    downloadCount: 0,
    tags: [],
    sortOrder: 0,
    uploadedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    renditions: [],
    threeD: null,
    jobs: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        {
          provide: PrismaClient,
          useValue: {
            mediaAsset: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              create: jest.fn(),
            },
            assetRendition: {
              create: jest.fn(),
            },
            $transaction: jest.fn((callback) =>
              typeof callback === 'function' ? callback() : Promise.all(callback),
            ),
          },
        },
        {
          provide: OCIStorageService,
          useValue: {
            deleteObject: jest.fn(),
            copyObject: jest.fn(),
            generateObjectKey: jest.fn(),
            generateRenditionKey: jest.fn(),
          },
        },
        {
          provide: CDNManagerService,
          useValue: {
            purgeCachePaths: jest.fn().mockResolvedValue({ invalidationId: 'inv-123' }),
            purgeCache: jest.fn().mockResolvedValue({ invalidationId: 'inv-123' }),
          },
        },
        {
          provide: JobQueueService,
          useValue: {
            addJob: jest.fn().mockResolvedValue('job-123'),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
    prisma = module.get<PrismaClient>(PrismaClient);
    storage = module.get<OCIStorageService>(OCIStorageService);
    cdn = module.get<CDNManagerService>(CDNManagerService);
    jobQueue = module.get<JobQueueService>(JobQueueService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('getAsset', () => {
    it('should return an asset by ID', async () => {
      jest.spyOn(prisma.mediaAsset, 'findUnique').mockResolvedValue(mockAsset);

      const result = await service.getAsset('asset-1');

      expect(result).toEqual(mockAsset);
      expect(prisma.mediaAsset.findUnique).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        include: { renditions: true, threeD: true },
      });
    });

    it('should throw NotFoundException if asset not found', async () => {
      jest.spyOn(prisma.mediaAsset, 'findUnique').mockResolvedValue(null);

      await expect(service.getAsset('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAsset', () => {
    it('should update an asset', async () => {
      const updates = { role: 'LIFESTYLE' as AssetRole, tags: ['modern', 'living-room'] };
      const updatedAsset = { ...mockAsset, ...updates };

      jest.spyOn(prisma.mediaAsset, 'update').mockResolvedValue(updatedAsset);

      const result = await service.updateAsset('asset-1', updates);

      expect(result).toEqual(updatedAsset);
      expect(eventEmitter.emit).toHaveBeenCalledWith('media.asset.updated', {
        assetId: 'asset-1',
        updates,
      });
    });
  });

  describe('deleteAsset', () => {
    it('should soft delete an asset', async () => {
      jest.spyOn(prisma.mediaAsset, 'findUnique').mockResolvedValue(mockAsset);
      jest.spyOn(prisma.mediaAsset, 'update').mockResolvedValue(mockAsset);

      const result = await service.deleteAsset('asset-1', true, true);

      expect(result.deletedAssets).toBe(1);
      expect(result.cdnPurged).toBe(true);
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: {
          status: AssetStatus.BLOCKED,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should hard delete an asset via job queue', async () => {
      jest.spyOn(prisma.mediaAsset, 'findUnique').mockResolvedValue(mockAsset);

      const result = await service.deleteAsset('asset-1', false, true);

      expect(result.jobId).toBe('job-123');
      expect(jobQueue.addJob).toHaveBeenCalled();
    });
  });

  describe('bulkUpdateAssets', () => {
    it('should update multiple assets', async () => {
      const assetIds = ['asset-1', 'asset-2', 'asset-3'];
      const updates = { isPublic: true };

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue(
        assetIds.map((id) => ({ id })) as any,
      );
      jest.spyOn(prisma.mediaAsset, 'updateMany').mockResolvedValue({ count: 3 });

      const result = await service.bulkUpdateAssets({ assetIds, updates });

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'media.assets.bulk_updated',
        expect.any(Object),
      );
    });

    it('should handle missing assets', async () => {
      const assetIds = ['asset-1', 'nonexistent'];

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue([{ id: 'asset-1' }] as any);
      jest.spyOn(prisma.mediaAsset, 'updateMany').mockResolvedValue({ count: 1 });

      const result = await service.bulkUpdateAssets({
        assetIds,
        updates: { isPublic: true },
      });

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('bulkDeleteAssets', () => {
    it('should soft delete multiple assets', async () => {
      const assetIds = ['asset-1', 'asset-2'];

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue(
        assetIds.map((id) => ({ id, rawKey: `raw/${id}` })) as any,
      );
      jest.spyOn(prisma.mediaAsset, 'updateMany').mockResolvedValue({ count: 2 });

      const result = await service.bulkDeleteAssets({
        assetIds,
        softDelete: true,
        purgeCdn: true,
      });

      expect(result.deletedAssets).toBe(2);
      expect(result.cdnPurged).toBe(true);
    });

    it('should queue hard delete for large batches', async () => {
      const assetIds = Array.from({ length: 15 }, (_, i) => `asset-${i}`);

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue(
        assetIds.map((id) => ({ id })) as any,
      );

      const result = await service.bulkDeleteAssets({
        assetIds,
        softDelete: false,
      });

      expect(result.jobId).toBeDefined();
      expect(jobQueue.addJob).toHaveBeenCalled();
    });
  });

  describe('moveAssets', () => {
    it('should move assets to new product', async () => {
      const assetIds = ['asset-1', 'asset-2'];
      const assets = assetIds.map((id) => ({ ...mockAsset, id, sortOrder: 0 }));

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue(assets as any);
      jest
        .spyOn(prisma, '$transaction')
        .mockResolvedValue(assets.map((a) => ({ ...a, productId: 'product-2' })) as any);

      const result = await service.moveAssets({
        assetIds,
        toProductId: 'product-2',
        preserveOrder: true,
      });

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(eventEmitter.emit).toHaveBeenCalledWith('media.assets.moved', expect.any(Object));
    });

    it('should validate source product if specified', async () => {
      const assetIds = ['asset-1'];
      const asset = { ...mockAsset, productId: 'product-wrong' };

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue([asset] as any);

      await expect(
        service.moveAssets({
          assetIds,
          fromProductId: 'product-1',
          toProductId: 'product-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('copyAssets', () => {
    it('should queue copy job for large batches', async () => {
      const assetIds = Array.from({ length: 10 }, (_, i) => `asset-${i}`);

      const result = await service.copyAssets({
        assetIds,
        toProductId: 'product-2',
        copyFiles: false,
        copyRenditions: true,
      });

      expect(result.jobId).toBeDefined();
      expect(jobQueue.addJob).toHaveBeenCalled();
    });
  });

  describe('reorderAssets', () => {
    it('should reorder assets for a product', async () => {
      const assetIds = ['asset-3', 'asset-1', 'asset-2'];
      const assets = assetIds.map((id) => ({ id, productId: 'product-1' }));

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue(assets as any);
      jest.spyOn(prisma, '$transaction').mockResolvedValue([] as any);

      const result = await service.reorderAssets('product-1', { assetIds });

      expect(result.success).toBe(3);
      expect(eventEmitter.emit).toHaveBeenCalledWith('media.assets.reordered', expect.any(Object));
    });

    it('should throw if assets do not belong to product', async () => {
      const assetIds = ['asset-1', 'asset-2'];

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue([{ id: 'asset-1' }] as any);

      await expect(service.reorderAssets('product-1', { assetIds })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('purgeCdn', () => {
    it('should purge CDN by product ID', async () => {
      const assets = [
        { id: 'asset-1', rawKey: 'raw/1', renditions: [{ key: 'thumb/1' }] },
        { id: 'asset-2', rawKey: 'raw/2', renditions: [] },
      ];

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue(assets as any);

      const result = await service.purgeCdn({
        productId: 'product-1',
        includeRenditions: true,
      });

      expect(result.invalidationId).toBe('inv-123');
      expect(result.purgedPaths).toContain('raw/1');
      expect(result.purgedPaths).toContain('thumb/1');
    });

    it('should purge CDN by asset IDs', async () => {
      const assets = [{ id: 'asset-1', rawKey: 'raw/1', renditions: [] }];

      jest.spyOn(prisma.mediaAsset, 'findMany').mockResolvedValue(assets as any);

      const result = await service.purgeCdn({
        assetIds: ['asset-1'],
        includeRenditions: false,
      });

      expect(result.invalidationId).toBe('inv-123');
      expect(result.purgedPaths).toContain('raw/1');
    });

    it('should purge entire CDN cache', async () => {
      const result = await service.purgeCdn({ purgeAll: true });

      expect(result.invalidationId).toBe('inv-123');
      expect(result.purgedPaths).toEqual(['*']);
      expect(cdn.purgeCache).toHaveBeenCalledWith({ purgeAll: true });
    });
  });
});
