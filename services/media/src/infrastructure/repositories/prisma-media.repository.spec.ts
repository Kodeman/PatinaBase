/**
 * Prisma Media Repository Tests
 * Tests repository implementation with mocked Prisma client
 */

import { PrismaMediaRepository } from './prisma-media.repository';
import { PrismaClient } from '../../generated/prisma-client';

// Mock Prisma Client
const mockPrismaClient = {
  mediaAsset: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  assetRendition: {
    findMany: jest.fn(),
  },
  threeDAsset: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
} as unknown as PrismaClient;

describe('PrismaMediaRepository', () => {
  let repository: PrismaMediaRepository;

  beforeEach(() => {
    repository = new PrismaMediaRepository(mockPrismaClient);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a media asset', async () => {
      const command = {
        kind: 'IMAGE',
        rawKey: 'raw/image/123/asset.jpg',
        uploadedBy: 'user-123',
      };

      const mockAsset = {
        id: 'asset-123',
        ...command,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrismaClient.mediaAsset.create as jest.Mock).mockResolvedValue(mockAsset);

      const result = await repository.create(command);

      expect(result).toEqual(mockAsset);
      expect(mockPrismaClient.mediaAsset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'IMAGE',
          rawKey: 'raw/image/123/asset.jpg',
          uploadedBy: 'user-123',
        }),
      });
    });

    it('should set default values for optional fields', async () => {
      const command = {
        kind: 'IMAGE',
        rawKey: 'key',
      };

      (mockPrismaClient.mediaAsset.create as jest.Mock).mockResolvedValue({});

      await repository.create(command);

      expect(mockPrismaClient.mediaAsset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'PENDING',
          isPublic: false,
          tags: [],
        }),
      });
    });
  });

  describe('findById', () => {
    it('should find asset by ID with relations', async () => {
      const mockAsset = {
        id: 'asset-123',
        kind: 'IMAGE',
        rawKey: 'key',
        renditions: [],
        threeD: null,
      };

      (mockPrismaClient.mediaAsset.findUnique as jest.Mock).mockResolvedValue(mockAsset);

      const result = await repository.findById('asset-123');

      expect(result).toEqual(mockAsset);
      expect(mockPrismaClient.mediaAsset.findUnique).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        include: {
          renditions: true,
          threeD: true,
        },
      });
    });

    it('should return null if asset not found', async () => {
      (mockPrismaClient.mediaAsset.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const mockAssets = [
        { id: 'asset-1', kind: 'IMAGE' },
        { id: 'asset-2', kind: 'IMAGE' },
      ];

      (mockPrismaClient.$transaction as jest.Mock).mockResolvedValue([mockAssets, 10]);

      const result = await repository.findAll({ page: 1, limit: 2 });

      expect(result.data).toEqual(mockAssets);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 10,
        totalPages: 5,
      });
    });

    it('should apply filters correctly', async () => {
      (mockPrismaClient.$transaction as jest.Mock).mockResolvedValue([[], 0]);

      await repository.findAll({
        kind: 'IMAGE',
        productId: 'product-123',
        status: 'READY',
        tags: ['modern', 'furniture'],
      });

      expect(mockPrismaClient.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({
          where: expect.objectContaining({
            kind: 'IMAGE',
            productId: 'product-123',
            status: 'READY',
            tags: { hasSome: ['modern', 'furniture'] },
          }),
        }),
        expect.any(Object),
      ]);
    });

    it('should apply size filters', async () => {
      (mockPrismaClient.$transaction as jest.Mock).mockResolvedValue([[], 0]);

      await repository.findAll({
        minSize: 1000,
        maxSize: 5000,
      });

      expect(mockPrismaClient.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({
          where: {
            sizeBytes: {
              gte: 1000,
              lte: 5000,
            },
          },
        }),
        expect.any(Object),
      ]);
    });

    it('should apply search filter', async () => {
      (mockPrismaClient.$transaction as jest.Mock).mockResolvedValue([[], 0]);

      await repository.findAll({
        search: 'furniture',
      });

      expect(mockPrismaClient.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({
          where: {
            OR: [
              { rawKey: { contains: 'furniture', mode: 'insensitive' } },
              { tags: { has: 'furniture' } },
            ],
          },
        }),
        expect.any(Object),
      ]);
    });

    it('should limit results to max 100 per page', async () => {
      (mockPrismaClient.$transaction as jest.Mock).mockResolvedValue([[], 0]);

      await repository.findAll({ limit: 200 });

      expect(mockPrismaClient.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({
          take: 100, // Should be capped at 100
        }),
        expect.any(Object),
      ]);
    });
  });

  describe('update', () => {
    it('should update asset with provided fields', async () => {
      const command = {
        role: 'HERO',
        tags: ['modern', 'sofa'],
        isPublic: true,
      };

      const mockUpdated = {
        id: 'asset-123',
        ...command,
      };

      (mockPrismaClient.mediaAsset.update as jest.Mock).mockResolvedValue(mockUpdated);

      const result = await repository.update('asset-123', command);

      expect(result).toEqual(mockUpdated);
      expect(mockPrismaClient.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: command,
      });
    });

    it('should only update provided fields', async () => {
      const command = { tags: ['new-tag'] };

      (mockPrismaClient.mediaAsset.update as jest.Mock).mockResolvedValue({});

      await repository.update('asset-123', command);

      expect(mockPrismaClient.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: { tags: ['new-tag'] },
      });
    });
  });

  describe('delete', () => {
    it('should soft delete by default', async () => {
      (mockPrismaClient.mediaAsset.update as jest.Mock).mockResolvedValue({});

      await repository.delete('asset-123');

      expect(mockPrismaClient.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: { status: 'BLOCKED' },
      });
      expect(mockPrismaClient.mediaAsset.delete).not.toHaveBeenCalled();
    });

    it('should hard delete when requested', async () => {
      (mockPrismaClient.mediaAsset.delete as jest.Mock).mockResolvedValue({});

      await repository.delete('asset-123', false);

      expect(mockPrismaClient.mediaAsset.delete).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
      });
      expect(mockPrismaClient.mediaAsset.update).not.toHaveBeenCalled();
    });
  });

  describe('findByPhash', () => {
    it('should find asset by perceptual hash', async () => {
      const mockAsset = {
        id: 'asset-123',
        phash: 'abcd1234',
      };

      (mockPrismaClient.mediaAsset.findFirst as jest.Mock).mockResolvedValue(mockAsset);

      const result = await repository.findByPhash('abcd1234');

      expect(result).toEqual(mockAsset);
      expect(mockPrismaClient.mediaAsset.findFirst).toHaveBeenCalledWith({
        where: {
          phash: 'abcd1234',
          status: { not: 'BLOCKED' },
        },
      });
    });

    it('should return null if not found', async () => {
      (mockPrismaClient.mediaAsset.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByPhash('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      (mockPrismaClient.mediaAsset.update as jest.Mock).mockResolvedValue({});

      await repository.incrementViewCount('asset-123');

      expect(mockPrismaClient.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: {
          viewCount: { increment: 1 },
        },
      });
    });
  });

  describe('incrementDownloadCount', () => {
    it('should increment download count', async () => {
      (mockPrismaClient.mediaAsset.update as jest.Mock).mockResolvedValue({});

      await repository.incrementDownloadCount('asset-123');

      expect(mockPrismaClient.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: {
          downloadCount: { increment: 1 },
        },
      });
    });
  });

  describe('updateStatus', () => {
    it('should update asset status', async () => {
      const mockUpdated = {
        id: 'asset-123',
        status: 'READY',
      };

      (mockPrismaClient.mediaAsset.update as jest.Mock).mockResolvedValue(mockUpdated);

      const result = await repository.updateStatus('asset-123', 'READY');

      expect(result).toEqual(mockUpdated);
      expect(mockPrismaClient.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: { status: 'READY' },
      });
    });
  });

  describe('exists', () => {
    it('should return true if asset exists', async () => {
      (mockPrismaClient.mediaAsset.count as jest.Mock).mockResolvedValue(1);

      const result = await repository.exists('asset-123');

      expect(result).toBe(true);
    });

    it('should return false if asset does not exist', async () => {
      (mockPrismaClient.mediaAsset.count as jest.Mock).mockResolvedValue(0);

      const result = await repository.exists('non-existent');

      expect(result).toBe(false);
    });
  });
});
