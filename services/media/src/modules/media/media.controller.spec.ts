import { Test, TestingModule } from '@nestjs/testing';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaKind, MediaRole, MediaStatus } from './dto';

describe('MediaController', () => {
  let controller: MediaController;
  let service: jest.Mocked<MediaService>;

  const mockMediaResponse = {
    id: 'asset-123',
    kind: 'image',
    productId: 'product-123',
    variantId: undefined,
    role: 'hero',
    rawKey: 'raw/images/asset-123/hero.jpg',
    uri: 'processed/images/asset-123/hero.webp',
    width: 1920,
    height: 1080,
    format: 'webp',
    status: 'completed',
    tags: ['furniture', 'modern'],
    viewCount: 10,
    downloadCount: 5,
    sizeBytes: '2048576',
    mimeType: 'image/jpeg',
    isPublic: true,
    uploadedBy: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      uploadSingle: jest.fn(),
      uploadBatch: jest.fn(),
      getById: jest.fn(),
      search: jest.fn(),
      updateMetadata: jest.fn(),
      delete: jest.fn(),
      processMedia: jest.fn(),
      processBatch: jest.fn(),
      prisma: {
        mediaAsset: {
          update: jest.fn(),
          count: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        {
          provide: MediaService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<MediaController>(MediaController);
    service = module.get(MediaService) as jest.Mocked<MediaService>;
  });

  describe('uploadSingle', () => {
    it('should upload single media asset', async () => {
      const user = { id: 'user-123' };
      const dto = {
        kind: MediaKind.IMAGE,
        filename: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      };

      const uploadResult = {
        assetId: 'asset-123',
        uploadSessionId: 'session-123',
        uploadUrl: 'https://upload.url',
        expiresAt: new Date(),
      };

      service.uploadSingle.mockResolvedValue(uploadResult);

      const result = await controller.uploadSingle(user, dto);

      expect(result).toEqual(uploadResult);
      expect(service.uploadSingle).toHaveBeenCalledWith('user-123', dto, undefined);
    });
  });

  describe('getById', () => {
    it('should retrieve asset by ID', async () => {
      service.getById.mockResolvedValue(mockMediaResponse);

      const result = await controller.getById('asset-123', false);

      expect(result).toEqual(mockMediaResponse);
      expect(service.getById).toHaveBeenCalledWith('asset-123', false);
    });

    it('should increment view count when requested', async () => {
      service.getById.mockResolvedValue(mockMediaResponse);

      await controller.getById('asset-123', true);

      expect(service.getById).toHaveBeenCalledWith('asset-123', true);
    });
  });

  describe('search', () => {
    it('should search media assets with filters', async () => {
      const searchResult = {
        data: [mockMediaResponse],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      service.search.mockResolvedValue(searchResult);

      const query = {
        kind: MediaKind.IMAGE,
        status: MediaStatus.COMPLETED,
        page: 1,
        limit: 20,
      };

      const result = await controller.search(query);

      expect(result).toEqual(searchResult);
      expect(service.search).toHaveBeenCalledWith(query);
    });
  });

  describe('updateMetadata', () => {
    it('should update asset metadata', async () => {
      const updateDto = {
        tags: ['updated', 'tags'],
        role: MediaRole.HERO,
      };

      service.updateMetadata.mockResolvedValue({
        ...mockMediaResponse,
        tags: ['updated', 'tags'],
      });

      const result = await controller.updateMetadata('asset-123', updateDto);

      expect(result.tags).toEqual(['updated', 'tags']);
      expect(service.updateMetadata).toHaveBeenCalledWith('asset-123', updateDto);
    });
  });

  describe('delete', () => {
    it('should soft delete by default', async () => {
      const deleteResult = {
        success: true,
        assetId: 'asset-123',
        deleted: false,
      };

      service.delete.mockResolvedValue(deleteResult);

      const result = await controller.delete('asset-123');

      expect(result).toEqual(deleteResult);
      expect(service.delete).toHaveBeenCalledWith('asset-123', true);
    });

    it('should hard delete when requested', async () => {
      const deleteResult = {
        success: true,
        assetId: 'asset-123',
        deleted: true,
      };

      service.delete.mockResolvedValue(deleteResult);

      const result = await controller.delete('asset-123', true);

      expect(result.deleted).toBe(true);
      expect(service.delete).toHaveBeenCalledWith('asset-123', false);
    });
  });

  describe('processAsset', () => {
    it('should queue processing job', async () => {
      const processResult = {
        assetId: 'asset-123',
        jobId: 'job-123',
        status: 'processing',
      };

      service.processMedia.mockResolvedValue(processResult);

      const result = await controller.processAsset('asset-123', {
        priority: 'high' as any,
      });

      expect(result).toEqual(processResult);
      expect(service.processMedia).toHaveBeenCalledWith({
        assetId: 'asset-123',
        priority: 'high',
      });
    });
  });

  describe('getDownloadUrl', () => {
    it('should generate download URL and increment count', async () => {
      service.getById.mockResolvedValue(mockMediaResponse);
      service['prisma'].mediaAsset.update.mockResolvedValue({} as any);

      const result = await controller.getDownloadUrl('asset-123');

      expect(result).toHaveProperty('downloadUrl');
      expect(result).toHaveProperty('expiresAt');
      expect(service['prisma'].mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: { downloadCount: { increment: 1 } },
      });
    });
  });

  describe('getStats', () => {
    it('should return media statistics', async () => {
      service['prisma'].mediaAsset.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(60) // images
        .mockResolvedValueOnce(30) // videos
        .mockResolvedValueOnce(10) // models
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(10) // processing
        .mockResolvedValueOnce(80) // completed
        .mockResolvedValueOnce(5); // failed

      const result = await controller.getStats();

      expect(result.total).toBe(100);
      expect(result.byKind.images).toBe(60);
      expect(result.byStatus.completed).toBe(80);
    });

    it('should filter stats by product ID', async () => {
      service['prisma'].mediaAsset.count.mockResolvedValue(10);

      await controller.getStats('product-123');

      expect(service['prisma'].mediaAsset.count).toHaveBeenCalledWith({
        where: { productId: 'product-123' },
      });
    });
  });
});
