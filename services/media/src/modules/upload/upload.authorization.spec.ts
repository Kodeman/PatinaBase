import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetKind } from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { OCIStorageService } from '../storage/oci-storage.service';
import { UploadService } from './upload.service';

const SUBJECT = '11111111-1111-4111-8111-111111111111';

describe('UploadService authorization binding', () => {
  const scope = {
    subject: SUBJECT,
    authorization: {
      subject: SUBJECT,
      roles: ['designer'],
      permissions: ['media.manage.own'],
      organizationIds: [],
    },
    where: { uploadedBy: SUBJECT },
    admin: false,
  };

  function harness() {
    const transaction = {
      uploadSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'session-id' }),
        update: jest.fn(),
      },
      mediaAsset: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const authorization = {
      withAssetScope: jest.fn(async (subject, _action, operation) => {
        expect(subject).toBe(SUBJECT);
        return operation(transaction, scope);
      }),
      requireProduct: jest.fn(),
      requireAsset: jest.fn().mockResolvedValue({ id: 'asset-id' }),
      notFound: jest.fn(() => new Error('not found')),
    } as unknown as MediaAuthorizationResolver;
    const storage = {
      generateObjectKey: jest.fn().mockReturnValue('raw/images/asset/key.jpg'),
      createPAR: jest.fn().mockResolvedValue({ fullUrl: 'https://upload.invalid' }),
      headObject: jest.fn().mockResolvedValue({ sizeBytes: 100, contentType: 'image/jpeg' }),
    } as unknown as OCIStorageService;
    const config = { get: jest.fn().mockReturnValue('raw-bucket') } as unknown as ConfigService;
    return {
      service: new UploadService(storage, config, authorization),
      transaction,
      authorization,
    };
  }

  it('stores verified subject as uploader/session actor and salts idempotency per subject', async () => {
    const { service, transaction } = harness();
    await service.createUploadIntent(
      SUBJECT,
      {
        kind: AssetKind.IMAGE,
        filename: 'chair.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100,
      },
      'caller-key',
    );

    expect(transaction.mediaAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ uploadedBy: SUBJECT }) }),
    );
    const sessionData = transaction.uploadSession.create.mock.calls[0][0].data;
    expect(sessionData.userId).toBe(SUBJECT);
    expect(sessionData.idempotencyKey).not.toBe('caller-key');
    expect(sessionData.idempotencyKey).toHaveLength(64);
  });

  it('rejects a body session id that differs from the route without querying state', async () => {
    const { service, transaction } = harness();
    await expect(
      service.confirmUpload(SUBJECT, 'route-session', 'body-session'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.uploadSession.findFirst).not.toHaveBeenCalled();
  });

  it('queries confirmation sessions by both route id and verified subject', async () => {
    const { service, transaction } = harness();
    transaction.uploadSession.findFirst.mockResolvedValue({
      id: 'route-session',
      assetId: 'asset-id',
      targetKey: 'raw/images/asset/key.jpg',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      fileSize: 100,
      mimeType: 'image/jpeg',
    });
    await service.confirmUpload(SUBJECT, 'route-session');
    expect(transaction.uploadSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'route-session', userId: SUBJECT },
    });
  });
});
