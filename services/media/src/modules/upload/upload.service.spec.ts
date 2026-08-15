import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetKind, AssetRole } from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { OCIStorageService } from '../storage/oci-storage.service';
import { UploadIntent, UploadService } from './upload.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '550e8400-e29b-41d4-a716-446655440000'),
}));

describe('UploadService', () => {
  const subject = '11111111-1111-4111-8111-111111111111';
  const assetId = '550e8400-e29b-41d4-a716-446655440000';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const expiresAt = new Date('2030-01-01T00:00:00.000Z');

  let service: UploadService;
  let transaction: any;
  let storage: jest.Mocked<OCIStorageService>;
  let config: jest.Mocked<ConfigService>;
  let authorization: jest.Mocked<MediaAuthorizationResolver>;

  beforeEach(() => {
    transaction = {
      mediaAsset: {
        create: jest.fn().mockResolvedValue({ id: assetId }),
        update: jest.fn().mockResolvedValue({ id: assetId }),
      },
      uploadSession: {
        create: jest.fn().mockResolvedValue({ id: sessionId }),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    storage = {
      generateObjectKey: jest.fn().mockReturnValue(`raw/images/${assetId}/hero.jpg`),
      createPAR: jest.fn().mockResolvedValue({
        fullUrl: 'https://example.test/upload',
        expiresAt,
      }),
      headObject: jest.fn().mockResolvedValue({ sizeBytes: 10, contentType: 'image/jpeg' }),
    } as unknown as jest.Mocked<OCIStorageService>;
    config = {
      get: jest.fn().mockReturnValue('raw-bucket'),
    } as unknown as jest.Mocked<ConfigService>;
    authorization = {
      withAssetScope: jest.fn(async (_subject, _action, operation) =>
        operation(transaction, {
          subject,
          authorization: {
            subject,
            roles: ['independent_designer'],
            permissions: ['media.manage.own'],
            organizationIds: [],
          },
          where: { uploadedBy: subject },
          admin: false,
        }),
      ),
      requireProduct: jest.fn().mockResolvedValue(undefined),
      requireAsset: jest.fn().mockResolvedValue({ id: assetId }),
      notFound: jest.fn(() => new NotFoundException('Media object not found')),
    } as unknown as jest.Mocked<MediaAuthorizationResolver>;

    service = new UploadService(storage, config, authorization);
  });

  describe('createUploadIntent', () => {
    it('creates an image upload intent bound to the verified subject', async () => {
      const intent: UploadIntent = {
        kind: AssetKind.IMAGE,
        filename: 'hero.jpg',
        fileSize: 10,
        mimeType: 'image/jpeg',
        role: AssetRole.HERO,
      };

      const result = await service.createUploadIntent(subject, intent);

      expect(result).toEqual({
        assetId,
        uploadSessionId: sessionId,
        parUrl: 'https://example.test/upload',
        targetKey: `raw/images/${assetId}/hero.jpg`,
        headers: { 'x-content-type': 'image/jpeg' },
        expiresAt: expect.any(Date),
      });
      expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: assetId,
          kind: AssetKind.IMAGE,
          uploadedBy: subject,
          status: 'PENDING',
        }),
      });
      expect(transaction.uploadSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: subject, assetId }),
      });
    });

    it('creates a 3D upload intent', async () => {
      const result = await service.createUploadIntent(subject, {
        kind: AssetKind.MODEL3D,
        filename: 'chair.glb',
        fileSize: 20,
        mimeType: 'model/gltf-binary',
      });

      expect(result.assetId).toBe(assetId);
      expect(storage.generateObjectKey).toHaveBeenCalledWith(assetId, '3d', 'chair.glb');
    });

    it.each([
      {
        kind: AssetKind.IMAGE,
        filename: 'test.bmp',
        mimeType: 'image/bmp',
      },
      {
        kind: AssetKind.MODEL3D,
        filename: 'test.obj',
        mimeType: 'model/obj',
      },
    ])('rejects unsupported MIME type $mimeType', async (intent) => {
      await expect(service.createUploadIntent(subject, intent)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it.each([
      {
        kind: AssetKind.IMAGE,
        filename: 'large.jpg',
        fileSize: 60 * 1024 * 1024,
        mimeType: 'image/jpeg',
      },
      {
        kind: AssetKind.MODEL3D,
        filename: 'large.glb',
        fileSize: 600 * 1024 * 1024,
        mimeType: 'model/gltf-binary',
      },
    ])('rejects an oversized $kind upload', async (intent) => {
      await expect(service.createUploadIntent(subject, intent)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it.each(['', 'a'.repeat(300)])('rejects invalid filename length', async (filename) => {
      await expect(
        service.createUploadIntent(subject, {
          kind: AssetKind.IMAGE,
          filename,
          mimeType: 'image/jpeg',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects HERO role for non-image assets', async () => {
      await expect(
        service.createUploadIntent(subject, {
          kind: AssetKind.MODEL3D,
          filename: 'model.glb',
          mimeType: 'model/gltf-binary',
          role: AssetRole.HERO,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('scopes an idempotent replay to the same subject and intent', async () => {
      transaction.uploadSession.findUnique.mockResolvedValue({
        id: sessionId,
        assetId,
        userId: subject,
        filename: 'test.jpg',
        fileSize: null,
        mimeType: 'image/jpeg',
        productId: null,
        variantId: null,
        kind: AssetKind.IMAGE,
        role: null,
        parUrl: 'https://example.test/upload',
        targetKey: `raw/images/${assetId}/test.jpg`,
        expiresAt,
      });

      const result = await service.createUploadIntent(
        subject,
        { kind: AssetKind.IMAGE, filename: 'test.jpg', mimeType: 'image/jpeg' },
        'same-key',
      );

      expect(result.uploadSessionId).toBe(sessionId);
      expect(transaction.uploadSession.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/) },
      });
      expect(transaction.mediaAsset.create).not.toHaveBeenCalled();
      expect(authorization.requireAsset).toHaveBeenCalled();
    });

    it.each(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])(
      'accepts allowed image MIME %s',
      async (mimeType) => {
        await expect(
          service.createUploadIntent(subject, {
            kind: AssetKind.IMAGE,
            filename: `test.${mimeType.split('/')[1]}`,
            mimeType,
          }),
        ).resolves.toBeDefined();
      },
    );

    it.each([
      'model/gltf-binary',
      'model/gltf+json',
      'model/vnd.usdz+zip',
      'application/octet-stream',
    ])('accepts allowed 3D MIME %s', async (mimeType) => {
      await expect(
        service.createUploadIntent(subject, {
          kind: AssetKind.MODEL3D,
          filename: 'test.glb',
          mimeType,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('confirmUpload', () => {
    const pendingSession = {
      id: sessionId,
      assetId,
      userId: subject,
      status: 'PENDING',
      targetKey: `raw/images/${assetId}/test.jpg`,
      fileSize: 10,
      mimeType: 'image/jpeg',
      expiresAt,
    };

    it('confirms an uploaded object for the verified subject', async () => {
      transaction.uploadSession.findFirst.mockResolvedValue(pendingSession);

      const result = await service.confirmUpload(subject, sessionId);

      expect(result).toEqual({ assetId, targetKey: pendingSession.targetKey });
      expect(transaction.uploadSession.findFirst).toHaveBeenCalledWith({
        where: { id: sessionId, userId: subject },
      });
      expect(transaction.uploadSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: { status: 'UPLOADED', uploadedAt: expect.any(Date) },
      });
      expect(transaction.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: { rawKey: pendingSession.targetKey },
      });
    });

    it('returns the common 404 for a missing or foreign session', async () => {
      transaction.uploadSession.findFirst.mockResolvedValue(null);

      await expect(service.confirmUpload(subject, sessionId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('does not repeat storage or database writes for an uploaded session', async () => {
      transaction.uploadSession.findFirst.mockResolvedValue({
        ...pendingSession,
        status: 'UPLOADED',
      });

      await expect(service.confirmUpload(subject, sessionId)).resolves.toEqual({
        assetId,
        targetKey: pendingSession.targetKey,
      });
      expect(storage.headObject).not.toHaveBeenCalled();
      expect(transaction.uploadSession.update).not.toHaveBeenCalled();
    });
  });
});
