import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { MediaService } from './media.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { OCIStorageService } from '../storage/oci-storage.service';
import { UploadService } from '../upload/upload.service';
import { MetadataExtractionService } from '../assets/metadata-extraction.service';
import { ImageTransformService } from '../transform/image-transform.service';
import { ThreeDProcessingService } from '../3d/3d-processing.service';
import { VirusScannerService } from '../security/virus-scanner.service';
import { MediaKind, ProcessingPriority } from './dto';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: jest.Mocked<PrismaClient>;
  let uploadService: jest.Mocked<UploadService>;
  let processingQueue: any;

  const mockAsset = {
    id: 'asset-123',
    kind: 'image',
    productId: 'product-123',
    variantId: null,
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
    sizeBytes: BigInt(2048576),
    mimeType: 'image/jpeg',
    isPublic: true,
    uploadedBy: 'user-123',
    processed: true,
    processingError: null,
    processingJobId: 'job-123',
    processedAt: new Date(),
    version: 1,
    originalAssetId: null,
    aiTags: null,
    lastAccessedAt: new Date(),
    phash: 'abc123def456',
    palette: null,
    meta: {},
    license: null,
    licenseType: null,
    attribution: null,
    expiresAt: null,
    permissions: null,
    checksum: 'sha256-checksum',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      mediaAsset: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((args) => Promise.all(args)),
    };

    const mockUploadService = {
      createUploadIntent: jest.fn(),
    };

    const mockQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        {
          provide: PrismaClient,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              const config: any = {
                OCI_BUCKET_RAW: 'raw-bucket',
                OCI_BUCKET_PROCESSED: 'processed-bucket',
              };
              return config[key];
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: OCIStorageService,
          useValue: {
            deleteObject: jest.fn(),
          },
        },
        {
          provide: UploadService,
          useValue: mockUploadService,
        },
        {
          provide: MetadataExtractionService,
          useValue: {},
        },
        {
          provide: ImageTransformService,
          useValue: {},
        },
        {
          provide: ThreeDProcessingService,
          useValue: {},
        },
        {
          provide: VirusScannerService,
          useValue: {},
        },
        {
          provide: getQueueToken('media-processing'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    prisma = module.get(PrismaClient) as jest.Mocked<PrismaClient>;
    uploadService = module.get(UploadService) as jest.Mocked<UploadService>;
    processingQueue = module.get(getQueueToken('media-processing'));
  });

  describe('uploadSingle', () => {
    it('should create upload intent for valid media', async () => {
      const userId = 'user-123';
      const dto = {
        kind: MediaKind.IMAGE,
        filename: 'test-image.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        productId: 'product-123',
        tags: ['test'],
        isPublic: true,
      };

      uploadService.createUploadIntent.mockResolvedValue({
        assetId: 'asset-123',
        uploadSessionId: 'session-123',
        parUrl: 'https://upload.url',
        targetKey: 'raw/images/asset-123/test-image.jpg',
        headers: {},
        expiresAt: new Date(),
      });

      prisma.mediaAsset.update.mockResolvedValue(mockAsset as any);

      const result = await service.uploadSingle(userId, dto);

      expect(result).toHaveProperty('assetId');
      expect(result).toHaveProperty('uploadUrl');
      expect(uploadService.createUploadIntent).toHaveBeenCalled();
    });

    it('should reject files exceeding size limits', async () => {
      const dto = {
        kind: MediaKind.IMAGE,
        filename: 'huge-image.jpg',
        fileSize: 100 * 1024 * 1024, // 100MB (exceeds 50MB limit)
        mimeType: 'image/jpeg',
      };

      await expect(service.uploadSingle('user-123', dto)).rejects.toThrow();
    });

    it('should reject invalid MIME types', async () => {
      const dto = {
        kind: MediaKind.IMAGE,
        filename: 'test.exe',
        fileSize: 1024,
        mimeType: 'application/x-msdownload',
      };

      await expect(service.uploadSingle('user-123', dto)).rejects.toThrow();
    });
  });

  describe('processMedia', () => {
    it('should queue processing job for asset', async () => {
      const dto = {
        assetId: 'asset-123',
        priority: ProcessingPriority.HIGH,
        options: {
          generateThumbnails: true,
        },
      };

      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset as any);
      prisma.mediaAsset.update.mockResolvedValue(mockAsset as any);
      processingQueue.add.mockResolvedValue({ id: 'job-123' });

      const result = await service.processMedia(dto);

      expect(result).toHaveProperty('jobId', 'job-123');
      expect(processingQueue.add).toHaveBeenCalledWith(
        'process-asset',
        expect.any(Object),
        expect.objectContaining({
          priority: 5, // HIGH priority
        }),
      );
    });

    it('should reject processing if asset not found', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.processMedia({ assetId: 'non-existent' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('getById', () => {
    it('should retrieve asset by ID', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset as any);

      const result = await service.getById('asset-123');

      expect(result.id).toBe('asset-123');
      expect(prisma.mediaAsset.findUnique).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
      });
    });

    it('should increment view count when requested', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset as any);
      prisma.mediaAsset.update.mockResolvedValue({
        ...mockAsset,
        viewCount: 11,
      } as any);

      await service.getById('asset-123', true);

      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: {
          viewCount: { increment: 1 },
          lastAccessedAt: expect.any(Date),
        },
      });
    });
  });

  describe('search', () => {
    it('should search assets with pagination', async () => {
      const assets = [mockAsset];
      prisma.mediaAsset.findMany.mockResolvedValue(assets as any);
      prisma.mediaAsset.count.mockResolvedValue(1);

      const result = await service.search({
        kind: MediaKind.IMAGE,
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('should filter by tags', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([mockAsset] as any);
      prisma.mediaAsset.count.mockResolvedValue(1);

      await service.search({
        tags: ['furniture', 'modern'],
      });

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: { hasSome: ['furniture', 'modern'] },
          }),
        }),
      );
    });
  });

  describe('updateMetadata', () => {
    it('should update asset metadata', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset as any);
      prisma.mediaAsset.update.mockResolvedValue({
        ...mockAsset,
        tags: ['updated', 'tags'],
      } as any);

      const result = await service.updateMetadata('asset-123', {
        tags: ['updated', 'tags'],
      });

      expect(result.tags).toEqual(['updated', 'tags']);
    });
  });

  describe('delete', () => {
    it('should soft delete by default', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset as any);
      prisma.mediaAsset.update.mockResolvedValue({
        ...mockAsset,
        status: 'archived',
      } as any);

      const result = await service.delete('asset-123', true);

      expect(result.deleted).toBe(false);
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: { status: 'archived' },
      });
    });

    it('should hard delete when requested', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset as any);
      prisma.mediaAsset.delete.mockResolvedValue(mockAsset as any);

      const result = await service.delete('asset-123', false);

      expect(result.deleted).toBe(true);
      expect(prisma.mediaAsset.delete).toHaveBeenCalled();
    });
  });
});
