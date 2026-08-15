import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import {
  AssetKind,
  AssetRole,
  AssetStatus,
  PrismaClient,
  ScanStatus,
} from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { JobQueueService } from '../jobs/job-queue.service';
import { CDNManagerService } from '../storage/cdn/cdn-manager.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  const subject = '11111111-1111-4111-8111-111111111111';
  const scope = {
    subject,
    authorization: {
      subject,
      roles: ['independent_designer'],
      permissions: ['media.read.own', 'media.manage.own'],
      organizationIds: [],
    },
    where: { uploadedBy: subject },
    admin: false,
  } as const;
  const mockAsset = {
    id: 'asset-1',
    kind: AssetKind.IMAGE,
    productId: 'product-1',
    variantId: null,
    role: AssetRole.HERO,
    rawKey: 'raw/images/asset-1/hero.jpg',
    processed: true,
    status: AssetStatus.READY,
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
    scanStatus: ScanStatus.CLEAN,
    scanResult: null,
    isPublic: true,
    permissions: null,
    viewCount: 0,
    downloadCount: 0,
    tags: [],
    sortOrder: 0,
    uploadedBy: subject,
    createdAt: new Date(),
    updatedAt: new Date(),
    renditions: [] as Array<any>,
    threeD: null,
    jobs: [],
  };

  let service: AssetsService;
  let transaction: any;
  let storage: jest.Mocked<OCIStorageService>;
  let cdn: jest.Mocked<CDNManagerService>;
  let jobQueue: jest.Mocked<JobQueueService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let authorization: jest.Mocked<MediaAuthorizationResolver>;

  beforeEach(() => {
    transaction = {
      mediaAsset: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      assetRendition: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };
    storage = {
      deleteObject: jest.fn(),
      copyObject: jest.fn(),
      generateObjectKey: jest.fn().mockReturnValue('raw/images/copy.jpg'),
    } as unknown as jest.Mocked<OCIStorageService>;
    cdn = {
      purgeCachePaths: jest.fn().mockResolvedValue({ invalidationId: 'inv-123' }),
      purgeCache: jest.fn().mockResolvedValue({ invalidationId: 'inv-123' }),
    } as unknown as jest.Mocked<CDNManagerService>;
    jobQueue = {
      addJob: jest.fn().mockResolvedValue('job-123'),
    } as unknown as jest.Mocked<JobQueueService>;
    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;
    authorization = {
      withAssetScope: jest.fn(async (_subject, _action, operation) =>
        operation(transaction, scope as any),
      ),
      withAdmin: jest.fn(async (_subject, operation) =>
        operation(transaction, scope.authorization),
      ),
      requireAsset: jest.fn().mockResolvedValue(mockAsset),
      requireAssets: jest.fn(async (_transaction, _scope, ids) => [...new Set(ids)]),
      requireProduct: jest.fn().mockResolvedValue(undefined),
      scopedWhere: jest.fn((_scope, additional) => additional ?? scope.where),
      notFound: jest.fn(() => new NotFoundException('Media object not found')),
    } as unknown as jest.Mocked<MediaAuthorizationResolver>;

    service = new AssetsService(
      transaction as PrismaClient,
      storage,
      cdn,
      jobQueue,
      eventEmitter,
      authorization,
    );
  });

  it('gets an authorized asset by ID', async () => {
    await expect(service.getAsset(subject, 'asset-1')).resolves.toEqual(mockAsset);
    expect(authorization.requireAsset).toHaveBeenCalledWith(
      transaction,
      expect.any(Object),
      'asset-1',
      { renditions: true, threeD: true },
    );
  });

  it('preserves the common non-enumerating 404', async () => {
    authorization.requireAsset.mockRejectedValueOnce(authorization.notFound());
    await expect(service.getAsset(subject, 'other-asset')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates an authorized asset and records the verified actor', async () => {
    const updates = { role: AssetRole.LIFESTYLE, tags: ['modern'] };
    transaction.mediaAsset.update.mockResolvedValue({ ...mockAsset, ...updates });

    await expect(service.updateAsset(subject, 'asset-1', updates)).resolves.toMatchObject(updates);
    expect(eventEmitter.emit).toHaveBeenCalledWith('media.asset.updated', {
      actor: subject,
      assetId: 'asset-1',
    });
  });

  it('soft deletes an authorized asset', async () => {
    await expect(service.deleteAsset(subject, 'asset-1', true, true)).resolves.toEqual({
      deletedAssets: 1,
      deletedRenditions: 0,
      cdnPurged: true,
    });
    expect(transaction.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: { status: AssetStatus.BLOCKED },
    });
  });

  it('hard deletes authorized storage and database rows inline', async () => {
    authorization.requireAsset.mockResolvedValueOnce({
      ...mockAsset,
      renditions: [{ key: 'rendition/asset-1.webp' }],
    } as any);

    await expect(service.deleteAsset(subject, 'asset-1', false, true)).resolves.toMatchObject({
      deletedAssets: 1,
      deletedRenditions: 1,
    });
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(transaction.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: 'asset-1' } });
  });

  it('updates every authorized batch ID', async () => {
    const assetIds = ['asset-1', 'asset-2', 'asset-3'];
    transaction.mediaAsset.updateMany.mockResolvedValue({ count: 3 });

    await expect(
      service.bulkUpdateAssets(subject, { assetIds, updates: { isPublic: true } }),
    ).resolves.toEqual({ success: 3, failed: 0, errors: [] });
  });

  it('fails a mixed-access batch without revealing which ID was inaccessible', async () => {
    authorization.requireAssets.mockRejectedValueOnce(authorization.notFound());

    await expect(
      service.bulkUpdateAssets(subject, {
        assetIds: ['asset-1', 'other-asset'],
        updates: { isPublic: true },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.mediaAsset.updateMany).not.toHaveBeenCalled();
  });

  it('soft deletes an authorized batch', async () => {
    const assets = ['asset-1', 'asset-2'].map((id) => ({
      ...mockAsset,
      id,
      rawKey: `raw/${id}`,
      renditions: [],
    }));
    transaction.mediaAsset.findMany.mockResolvedValue(assets);
    transaction.mediaAsset.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.bulkDeleteAssets(subject, {
        assetIds: assets.map((asset) => asset.id),
        softDelete: true,
        purgeCdn: true,
      }),
    ).resolves.toMatchObject({ deletedAssets: 2, cdnPurged: true });
  });

  it('hard deletes an authorized batch without falling back to an unscoped job', async () => {
    const assets = ['asset-1', 'asset-2'].map((id) => ({
      ...mockAsset,
      id,
      rawKey: `raw/${id}`,
      renditions: [],
    }));
    transaction.mediaAsset.findMany.mockResolvedValue(assets);
    transaction.mediaAsset.deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      service.bulkDeleteAssets(subject, {
        assetIds: assets.map((asset) => asset.id),
        softDelete: false,
      }),
    ).resolves.toMatchObject({ deletedAssets: 2 });
    expect(jobQueue.addJob).not.toHaveBeenCalled();
  });

  it('moves authorized assets to an authorized product', async () => {
    const assets = ['asset-1', 'asset-2'].map((id) => ({ ...mockAsset, id }));
    transaction.mediaAsset.findMany.mockResolvedValue(assets);

    await expect(
      service.moveAssets(subject, {
        assetIds: assets.map((asset) => asset.id),
        toProductId: 'product-2',
        preserveOrder: true,
      }),
    ).resolves.toEqual({ success: 2, failed: 0, errors: [] });
    expect(authorization.requireProduct).toHaveBeenCalled();
    expect(transaction.mediaAsset.update).toHaveBeenCalledTimes(2);
  });

  it('uses a non-enumerating 404 for a source-product mismatch', async () => {
    transaction.mediaAsset.findMany.mockResolvedValue([
      { ...mockAsset, productId: 'different-product' },
    ]);

    await expect(
      service.moveAssets(subject, {
        assetIds: ['asset-1'],
        fromProductId: 'product-1',
        toProductId: 'product-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('copies authorized assets under the verified subject', async () => {
    transaction.mediaAsset.findMany.mockResolvedValue([{ ...mockAsset, renditions: [] }]);
    transaction.mediaAsset.create.mockResolvedValue({ id: 'copied-asset' });

    await expect(
      service.copyAssets(subject, {
        assetIds: ['asset-1'],
        toProductId: 'product-2',
        copyFiles: true,
        copyRenditions: false,
      }),
    ).resolves.toEqual({ success: 1, failed: 0, errors: [] });
    expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ uploadedBy: subject, productId: 'product-2' }),
    });
  });

  it('reorders only a complete authorized product set', async () => {
    transaction.mediaAsset.count.mockResolvedValue(3);

    await expect(
      service.reorderAssets(subject, 'product-1', {
        assetIds: ['asset-3', 'asset-1', 'asset-2'],
      }),
    ).resolves.toEqual({ success: 3, failed: 0, errors: [] });
    expect(transaction.mediaAsset.update).toHaveBeenCalledTimes(3);
  });

  it('denies reorder when the product-scoped count is incomplete', async () => {
    transaction.mediaAsset.count.mockResolvedValue(1);
    await expect(
      service.reorderAssets(subject, 'product-1', { assetIds: ['asset-1', 'asset-2'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('purges product assets only under current admin authorization', async () => {
    transaction.mediaAsset.findMany.mockResolvedValue([
      { id: 'asset-1', rawKey: 'raw/1', renditions: [{ key: 'thumb/1' }] },
    ]);

    await expect(
      service.purgeCdn(subject, { productId: 'product-1', includeRenditions: true }),
    ).resolves.toEqual({
      invalidationId: 'inv-123',
      purgedPaths: ['raw/1', 'thumb/1'],
    });
    expect(authorization.withAdmin).toHaveBeenCalledWith(subject, expect.any(Function));
  });

  it('purges the entire CDN only under current admin authorization', async () => {
    await expect(service.purgeCdn(subject, { purgeAll: true })).resolves.toEqual({
      invalidationId: 'inv-123',
      purgedPaths: ['*'],
    });
    expect(cdn.purgeCache).toHaveBeenCalledWith({ purgeAll: true });
  });
});
