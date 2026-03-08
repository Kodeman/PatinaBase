import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService, UploadIntent } from './upload.service';
import { OCIStorageService } from '../storage/oci-storage.service';
import { PrismaClient, AssetKind, AssetRole } from '../../generated/prisma-client';

describe('UploadService', () => {
  let service: UploadService;
  let prisma: jest.Mocked<PrismaClient>;
  let ociStorage: jest.Mocked<OCIStorageService>;
  let config: jest.Mocked<ConfigService>;

  const mockUserId = 'user-123';
  const mockAssetId = '550e8400-e29b-41d4-a716-446655440000';
  const mockSessionId = 'session-123';

  beforeEach(async () => {
    const mockPrisma = {
      mediaAsset: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      uploadSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;

    const mockOCIStorage = {
      generateObjectKey: jest.fn(),
      createPAR: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: OCIStorageService, useValue: mockOCIStorage },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    prisma = module.get(PrismaClient) as jest.Mocked<PrismaClient>;
    ociStorage = module.get(OCIStorageService) as jest.Mocked<OCIStorageService>;
    config = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUploadIntent', () => {
    it('should create upload intent for valid image', async () => {
      const intent: UploadIntent = {
        kind: 'IMAGE',
        filename: 'hero.jpg',
        fileSize: 10 * 1024 * 1024, // 10MB
        mimeType: 'image/jpeg',
        role: 'HERO',
      };

      const mockAsset = {
        id: mockAssetId,
        kind: 'IMAGE',
        status: 'PENDING',
        uploadedBy: mockUserId,
      };

      const mockTargetKey = 'raw/images/550e8400-e29b-41d4-a716-446655440000/hero.jpg';
      const mockPAR = {
        parUrl: '/p/abc123',
        fullUrl: 'https://objectstorage.us-ashburn-1.oraclecloud.com/p/abc123',
        expiresAt: new Date(),
      };

      const mockSession = {
        id: mockSessionId,
        assetId: mockAssetId,
        parUrl: mockPAR.fullUrl,
        targetKey: mockTargetKey,
      };

      (prisma.mediaAsset.create as jest.Mock).mockResolvedValue(mockAsset as any);
      ociStorage.generateObjectKey.mockReturnValue(mockTargetKey);
      ociStorage.createPAR.mockResolvedValue(mockPAR);
      (prisma.uploadSession.create as jest.Mock).mockResolvedValue(mockSession as any);
      config.get.mockReturnValue('raw-bucket');

      const result = await service.createUploadIntent(mockUserId, intent);

      expect(result).toEqual({
        assetId: mockAssetId,
        uploadSessionId: mockSessionId,
        parUrl: mockPAR.fullUrl,
        targetKey: mockTargetKey,
        headers: { 'x-content-type': 'image/jpeg' },
        expiresAt: mockPAR.expiresAt,
      });

      expect(prisma.mediaAsset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'IMAGE',
          mimeType: 'image/jpeg',
          role: 'HERO',
          uploadedBy: mockUserId,
          status: 'PENDING',
        }),
      });
    });

    it('should create upload intent for 3D model', async () => {
      const intent: UploadIntent = {
        kind: 'MODEL3D',
        filename: 'chair.glb',
        fileSize: 20 * 1024 * 1024, // 20MB
        mimeType: 'model/gltf-binary',
      };

      (prisma.mediaAsset.create as jest.Mock).mockResolvedValue({ id: mockAssetId } as any);
      ociStorage.generateObjectKey.mockReturnValue('raw/3d/123/chair.glb');
      ociStorage.createPAR.mockResolvedValue({
        fullUrl: 'https://example.com/par',
        expiresAt: new Date(),
      } as any);
      (prisma.uploadSession.create as jest.Mock).mockResolvedValue({ id: mockSessionId } as any);
      config.get.mockReturnValue('raw-bucket');

      const result = await service.createUploadIntent(mockUserId, intent);

      expect(result.assetId).toBe(mockAssetId);
      expect(ociStorage.generateObjectKey).toHaveBeenCalledWith(
        expect.any(String),
        '3d',
        'chair.glb',
      );
    });

    it('should reject invalid MIME type for image', async () => {
      const intent: UploadIntent = {
        kind: 'IMAGE',
        filename: 'test.bmp',
        mimeType: 'image/bmp', // Not allowed
      };

      await expect(service.createUploadIntent(mockUserId, intent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid MIME type for 3D model', async () => {
      const intent: UploadIntent = {
        kind: 'MODEL3D',
        filename: 'test.obj',
        mimeType: 'model/obj', // Not allowed
      };

      await expect(service.createUploadIntent(mockUserId, intent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject image file size exceeding limit', async () => {
      const intent: UploadIntent = {
        kind: 'IMAGE',
        filename: 'large.jpg',
        fileSize: 60 * 1024 * 1024, // 60MB exceeds 50MB limit
        mimeType: 'image/jpeg',
      };

      await expect(service.createUploadIntent(mockUserId, intent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject 3D file size exceeding limit', async () => {
      const intent: UploadIntent = {
        kind: 'MODEL3D',
        filename: 'large.glb',
        fileSize: 600 * 1024 * 1024, // 600MB exceeds 500MB limit
        mimeType: 'model/gltf-binary',
      };

      await expect(service.createUploadIntent(mockUserId, intent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid filename', async () => {
      const intent: UploadIntent = {
        kind: 'IMAGE',
        filename: '', // Empty filename
        mimeType: 'image/jpeg',
      };

      await expect(service.createUploadIntent(mockUserId, intent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject filename exceeding max length', async () => {
      const intent: UploadIntent = {
        kind: 'IMAGE',
        filename: 'a'.repeat(300), // Too long
        mimeType: 'image/jpeg',
      };

      await expect(service.createUploadIntent(mockUserId, intent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject HERO role for non-image assets', async () => {
      const intent: UploadIntent = {
        kind: 'MODEL3D',
        filename: 'model.glb',
        mimeType: 'model/gltf-binary',
        role: 'HERO', // Invalid for 3D
      };

      await expect(service.createUploadIntent(mockUserId, intent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle idempotency key for duplicate requests', async () => {
      const intent: UploadIntent = {
        kind: 'IMAGE',
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
      };

      const existingSession = {
        id: mockSessionId,
        assetId: mockAssetId,
        parUrl: 'https://example.com/par',
        targetKey: 'raw/images/123/test.jpg',
        expiresAt: new Date(),
      };

      (prisma.uploadSession.findUnique as jest.Mock).mockResolvedValue(existingSession as any);

      const result = await service.createUploadIntent(mockUserId, intent, 'idempotency-key-123');

      expect(result.uploadSessionId).toBe(mockSessionId);
      expect(prisma.mediaAsset.create).not.toHaveBeenCalled();
      expect(prisma.uploadSession.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'idempotency-key-123' },
      });
    });

    it('should accept all allowed image MIME types', async () => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

      for (const mimeType of allowedMimes) {
        const intent: UploadIntent = {
          kind: 'IMAGE',
          filename: `test.${mimeType.split('/')[1]}`,
          mimeType,
        };

        (prisma.mediaAsset.create as jest.Mock).mockResolvedValue({ id: mockAssetId } as any);
        ociStorage.generateObjectKey.mockReturnValue('raw/images/123/test.jpg');
        ociStorage.createPAR.mockResolvedValue({
          fullUrl: 'https://example.com/par',
          expiresAt: new Date(),
        } as any);
        (prisma.uploadSession.create as jest.Mock).mockResolvedValue({ id: mockSessionId } as any);
        config.get.mockReturnValue('raw-bucket');

        await expect(service.createUploadIntent(mockUserId, intent)).resolves.toBeDefined();
      }
    });

    it('should accept all allowed 3D MIME types', async () => {
      const allowedMimes = [
        'model/gltf-binary',
        'model/gltf+json',
        'model/vnd.usdz+zip',
        'application/octet-stream',
      ];

      for (const mimeType of allowedMimes) {
        const intent: UploadIntent = {
          kind: 'MODEL3D',
          filename: 'test.glb',
          mimeType,
        };

        (prisma.mediaAsset.create as jest.Mock).mockResolvedValue({ id: mockAssetId } as any);
        ociStorage.generateObjectKey.mockReturnValue('raw/3d/123/test.glb');
        ociStorage.createPAR.mockResolvedValue({
          fullUrl: 'https://example.com/par',
          expiresAt: new Date(),
        } as any);
        (prisma.uploadSession.create as jest.Mock).mockResolvedValue({ id: mockSessionId } as any);
        config.get.mockReturnValue('raw-bucket');

        await expect(service.createUploadIntent(mockUserId, intent)).resolves.toBeDefined();
      }
    });
  });

  describe('confirmUpload', () => {
    it('should confirm successful upload', async () => {
      const mockSession = {
        id: mockSessionId,
        assetId: mockAssetId,
        status: 'PENDING',
        targetKey: 'raw/images/123/test.jpg',
      };

      (prisma.uploadSession.findUnique as jest.Mock).mockResolvedValue(mockSession as any);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.confirmUpload(mockSessionId);

      expect(result).toEqual({
        assetId: mockAssetId,
        targetKey: mockSession.targetKey,
      });

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({
          where: { id: mockSessionId },
        }),
        expect.objectContaining({
          where: { id: mockAssetId },
        }),
      ]);
    });

    it('should throw error for non-existent session', async () => {
      (prisma.uploadSession.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.confirmUpload('invalid-session')).rejects.toThrow(BadRequestException);
    });

    it('should skip confirmation if already uploaded', async () => {
      const mockSession = {
        id: mockSessionId,
        assetId: mockAssetId,
        status: 'UPLOADED',
      };

      (prisma.uploadSession.findUnique as jest.Mock).mockResolvedValue(mockSession as any);

      await service.confirmUpload(mockSessionId);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should mark expired sessions as EXPIRED', async () => {
      const expiredSessions = [
        { id: 'session-1', expiresAt: new Date(Date.now() - 3600000) },
        { id: 'session-2', expiresAt: new Date(Date.now() - 7200000) },
      ];

      (prisma.uploadSession.findMany as jest.Mock).mockResolvedValue(expiredSessions as any);
      (prisma.uploadSession.updateMany as jest.Mock).mockResolvedValue({ count: 2 } as any);

      await service.cleanupExpiredSessions();

      expect(prisma.uploadSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['session-1', 'session-2'] },
        },
        data: {
          status: 'EXPIRED',
        },
      });
    });

    it('should not update if no expired sessions', async () => {
      (prisma.uploadSession.findMany as jest.Mock).mockResolvedValue([]);

      await service.cleanupExpiredSessions();

      expect(prisma.uploadSession.updateMany).not.toHaveBeenCalled();
    });
  });
});
