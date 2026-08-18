import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AssetKind, AssetRole, AssetStatus, PrismaClient } from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { JobQueueService } from '../jobs/job-queue.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import { UploadService } from '../upload/upload.service';
import { MediaKind, MediaStatus, ProcessingPriority } from './dto';
import { MediaService } from './media.service';

describe('MediaService', () => {
  const subject = '11111111-1111-4111-8111-111111111111';
  const baseAsset = {
    id: 'asset-123',
    kind: AssetKind.IMAGE,
    productId: 'product-123',
    variantId: null,
    role: AssetRole.HERO,
    rawKey: 'raw/images/asset-123/hero.jpg',
    width: 1920,
    height: 1080,
    format: 'webp',
    status: AssetStatus.READY,
    tags: ['furniture', 'modern'],
    viewCount: 10,
    downloadCount: 5,
    sizeBytes: 2048576,
    mimeType: 'image/jpeg',
    isPublic: true,
    uploadedBy: subject,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    license: null,
    palette: null,
  };

  let service: MediaService;
  let transaction: any;
  let uploadService: jest.Mocked<UploadService>;
  let jobQueue: jest.Mocked<JobQueueService>;
  let storage: jest.Mocked<OCIStorageService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let authorization: jest.Mocked<MediaAuthorizationResolver>;

  beforeEach(() => {
    transaction = {
      mediaAsset: {
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };
    uploadService = {
      createUploadIntent: jest.fn(),
    } as unknown as jest.Mocked<UploadService>;
    jobQueue = {
      addJob: jest.fn().mockResolvedValue('job-123'),
    } as unknown as jest.Mocked<JobQueueService>;
    storage = {
      deleteObject: jest.fn(),
    } as unknown as jest.Mocked<OCIStorageService>;
    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;
    authorization = {
      withAssetScope: jest.fn(async (_subject, _action, operation) =>
        operation(transaction, {
          subject,
          authorization: {
            subject,
            roles: ['independent_designer'],
            permissions: ['media.read.own', 'media.manage.own'],
            organizationIds: [],
          },
          where: { uploadedBy: subject },
          projectIds: [],
          admin: false,
        }),
      ),
      requireAsset: jest.fn().mockImplementation(async () => ({ ...baseAsset })),
      requireAssets: jest.fn(async (_transaction, _scope, ids) => [...new Set(ids)]),
      scopedWhere: jest.fn((_scope, additional) => additional ?? { uploadedBy: subject }),
      notFound: jest.fn(() => new NotFoundException('Media object not found')),
    } as unknown as jest.Mocked<MediaAuthorizationResolver>;

    const config = {
      get: jest.fn((key: string) => (key === 'OCI_BUCKET_RAW' ? 'raw-bucket' : 'processed-bucket')),
    } as unknown as ConfigService;

    service = new MediaService(
      transaction as PrismaClient,
      config,
      eventEmitter,
      storage,
      uploadService,
      jobQueue,
      authorization,
    );
  });

  describe('uploadSingle', () => {
    it('creates an upload intent and updates only the subject-scoped asset', async () => {
      uploadService.createUploadIntent.mockResolvedValue({
        assetId: 'asset-123',
        uploadSessionId: 'session-123',
        parUrl: 'https://upload.test',
        targetKey: baseAsset.rawKey,
        headers: {},
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      });
      transaction.mediaAsset.update.mockResolvedValue(baseAsset);

      await expect(
        service.uploadSingle(subject, {
          kind: MediaKind.IMAGE,
          filename: 'test-image.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
          productId: 'product-123',
          tags: ['test'],
          isPublic: true,
        }),
      ).resolves.toMatchObject({ assetId: 'asset-123', uploadUrl: 'https://upload.test' });
      expect(uploadService.createUploadIntent).toHaveBeenCalledWith(
        subject,
        expect.any(Object),
        expect.any(String),
      );
      expect(authorization.requireAsset).toHaveBeenCalledWith(
        transaction,
        expect.any(Object),
        'asset-123',
      );
    });

    it.each([
      {
        kind: MediaKind.IMAGE,
        filename: 'huge.jpg',
        fileSize: 100 * 1024 * 1024,
        mimeType: 'image/jpeg',
      },
      {
        kind: MediaKind.IMAGE,
        filename: 'test.exe',
        fileSize: 1024,
        mimeType: 'application/x-msdownload',
      },
    ])('rejects invalid upload input', async (dto) => {
      await expect(service.uploadSingle(subject, dto)).rejects.toBeDefined();
    });
  });

  describe('processMedia', () => {
    it('queues processing inside the authorized transaction', async () => {
      await expect(
        service.processMedia(subject, {
          assetId: 'asset-123',
          priority: ProcessingPriority.HIGH,
          options: { generateThumbnails: true },
        }),
      ).resolves.toEqual({ assetId: 'asset-123', jobId: 'job-123', status: 'processing' });
      expect(jobQueue.addJob).toHaveBeenCalledWith(
        expect.objectContaining({ assetId: 'asset-123', priority: 5 }),
        transaction,
      );
    });

    it('preserves a non-enumerating 404 for an inaccessible asset', async () => {
      authorization.requireAsset.mockRejectedValueOnce(authorization.notFound());
      await expect(
        service.processMedia(subject, { assetId: 'other-asset' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getById', () => {
    it('retrieves an authorized asset', async () => {
      await expect(service.getById(subject, 'asset-123')).resolves.toMatchObject({
        id: 'asset-123',
        status: AssetStatus.READY,
      });
    });

    it('increments the authorized asset view count when requested', async () => {
      await service.getById(subject, 'asset-123', true);
      expect(transaction.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: { viewCount: { increment: 1 } },
      });
    });
  });

  describe('search', () => {
    it('uses the same scoped predicate for rows and pagination count', async () => {
      transaction.mediaAsset.findMany.mockResolvedValue([baseAsset]);
      transaction.mediaAsset.count.mockResolvedValue(1);

      await expect(
        service.search(subject, {
          kind: MediaKind.IMAGE,
          status: MediaStatus.COMPLETED,
          page: 1,
          limit: 20,
        }),
      ).resolves.toMatchObject({ pagination: { total: 1 }, data: [{ id: 'asset-123' }] });
      expect(transaction.mediaAsset.findMany.mock.calls[0][0].where).toEqual(
        transaction.mediaAsset.count.mock.calls[0][0].where,
      );
    });

    it('applies tag filters inside the authorized predicate', async () => {
      transaction.mediaAsset.findMany.mockResolvedValue([baseAsset]);
      transaction.mediaAsset.count.mockResolvedValue(1);

      await service.search(subject, { tags: ['furniture', 'modern'] });
      expect(transaction.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { hasSome: ['furniture', 'modern'] } }),
        }),
      );
    });
  });

  it('updates metadata only after subject-scoped lookup', async () => {
    transaction.mediaAsset.update.mockResolvedValue({
      ...baseAsset,
      tags: ['updated', 'tags'],
    });

    await expect(
      service.updateMetadata(subject, 'asset-123', { tags: ['updated', 'tags'] }),
    ).resolves.toMatchObject({ tags: ['updated', 'tags'] });
    expect(eventEmitter.emit).toHaveBeenCalledWith('media.metadata.updated', {
      actor: subject,
      assetId: 'asset-123',
    });
  });

  describe('delete', () => {
    it('soft deletes an authorized asset by default', async () => {
      await expect(service.delete(subject, 'asset-123', true)).resolves.toMatchObject({
        assetId: 'asset-123',
        deleted: false,
      });
      expect(transaction.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: { status: AssetStatus.BLOCKED },
      });
    });

    it('hard deletes an authorized asset', async () => {
      await expect(service.delete(subject, 'asset-123', false)).resolves.toMatchObject({
        assetId: 'asset-123',
        deleted: true,
      });
      expect(storage.deleteObject).toHaveBeenCalledWith('raw-bucket', baseAsset.rawKey);
      expect(transaction.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: 'asset-123' } });
    });
  });
});
